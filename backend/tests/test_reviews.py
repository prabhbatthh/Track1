import os
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ["APP_ENV"] = "test"

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.core.constants import Role
from app.db.prisma import prisma
from app.main import create_app
from app.modules.members import repository as member_repository

os.environ.setdefault("DATABASE_URL", get_settings().database_url)

TEST_EMAIL_DOMAIN = "@reviews-test.example.com"
TEST_TITLE_MARKER = "REVIEWS-TEST-"


def _unique_email() -> str:
    return f"{uuid.uuid4().hex}{TEST_EMAIL_DOMAIN}"


def _book_payload(**overrides) -> dict:
    payload = {
        "title": f"{TEST_TITLE_MARKER}{uuid.uuid4().hex}",
        "author": "Test Author",
        "category": "Fiction",
        "total_copies": 1,
    }
    payload.update(overrides)
    return payload


async def _make_user(role_name: str):
    role = await member_repository.upsert_role(role_name)
    return await member_repository.create_member(
        email=_unique_email(),
        password_hash=None,
        full_name=f"Test {role_name.title()} {uuid.uuid4().hex[:6]}",
        phone=None,
        avatar_url=None,
        role_id=role.id,
    )


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    await prisma.connect()
    yield
    await prisma.review.delete_many(where={"book": {"title": {"startswith": TEST_TITLE_MARKER}}})
    await prisma.book.delete_many(where={"title": {"startswith": TEST_TITLE_MARKER}})
    await prisma.user.delete_many(where={"email": {"endswith": TEST_EMAIL_DOMAIN}})
    await prisma.disconnect()


@pytest_asyncio.fixture
async def member_user():
    return await _make_user(Role.MEMBER)


@pytest_asyncio.fixture
async def other_member_user():
    return await _make_user(Role.MEMBER)


@pytest_asyncio.fixture
async def manager_user():
    return await _make_user(Role.MANAGER)


@pytest_asyncio.fixture
async def admin_user():
    return await _make_user(Role.ADMIN)


@pytest_asyncio.fixture
async def librarian_user():
    return await _make_user(Role.LIBRARIAN)


def _client_as(user) -> AsyncClient:
    from app.api.deps import get_current_user

    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _create_book(librarian_user, **overrides) -> str:
    async with _client_as(librarian_user) as client:
        response = await client.post("/api/v1/books", json=_book_payload(**overrides))
    return response.json()["id"]


async def test_list_book_reviews_requires_authentication():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/api/v1/books/{uuid.uuid4()}/reviews")

    assert response.status_code == 401


async def test_create_review_requires_authentication():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            f"/api/v1/books/{uuid.uuid4()}/reviews", json={"rating": 5, "comment": "Great"}
        )

    assert response.status_code == 401


async def test_create_review_for_missing_book_returns_404(member_user):
    async with _client_as(member_user) as client:
        response = await client.post(
            f"/api/v1/books/{uuid.uuid4()}/reviews", json={"rating": 5, "comment": "Great"}
        )

    assert response.status_code == 404


async def test_member_can_review_a_book(member_user, librarian_user):
    book_id = await _create_book(librarian_user)

    async with _client_as(member_user) as client:
        response = await client.post(
            f"/api/v1/books/{book_id}/reviews",
            json={"rating": 5, "comment": "Loved it", "images": []},
        )

    assert response.status_code == 201
    body = response.json()
    assert body["book_id"] == book_id
    assert body["rating"] == 5
    assert body["comment"] == "Loved it"
    assert body["is_own"] is True


async def test_reviewing_the_same_book_twice_conflicts(member_user, librarian_user):
    book_id = await _create_book(librarian_user)

    async with _client_as(member_user) as client:
        first = await client.post(
            f"/api/v1/books/{book_id}/reviews", json={"rating": 4, "comment": "Good"}
        )
        second = await client.post(
            f"/api/v1/books/{book_id}/reviews", json={"rating": 3, "comment": "Again"}
        )

    assert first.status_code == 201
    assert second.status_code == 409


async def test_book_reviews_average_and_breakdown(member_user, other_member_user, librarian_user):
    book_id = await _create_book(librarian_user)

    async with _client_as(member_user) as client:
        await client.post(
            f"/api/v1/books/{book_id}/reviews", json={"rating": 5, "comment": "Excellent"}
        )
    async with _client_as(other_member_user) as client:
        await client.post(f"/api/v1/books/{book_id}/reviews", json={"rating": 3, "comment": "Okay"})

    async with _client_as(member_user) as client:
        response = await client.get(f"/api/v1/books/{book_id}/reviews")

    assert response.status_code == 200
    body = response.json()
    assert body["total_reviews"] == 2
    assert body["average_rating"] == 4.0
    breakdown = {row["stars"]: row["percent"] for row in body["breakdown"]}
    assert breakdown[5] == 50.0
    assert breakdown[3] == 50.0
    assert breakdown[4] == 0.0

    own_review = next(r for r in body["items"] if r["reviewer_id"] == member_user.id)
    other_review = next(r for r in body["items"] if r["reviewer_id"] == other_member_user.id)
    assert own_review["is_own"] is True
    assert other_review["is_own"] is False


def _fake_llm(reply_text: str) -> SimpleNamespace:
    return SimpleNamespace(ainvoke=AsyncMock(return_value=SimpleNamespace(content=reply_text)))


async def test_review_digest_is_none_without_any_reviews(member_user, librarian_user):
    book_id = await _create_book(librarian_user)

    async with _client_as(member_user) as client:
        response = await client.get(f"/api/v1/books/{book_id}/reviews")

    assert response.status_code == 200
    assert response.json()["review_digest"] is None


async def test_review_digest_is_generated_and_then_cached(member_user, librarian_user):
    book_id = await _create_book(librarian_user)
    async with _client_as(member_user) as client:
        await client.post(
            f"/api/v1/books/{book_id}/reviews", json={"rating": 5, "comment": "Loved it"}
        )

    fake_llm = _fake_llm("Readers loved this one.")
    with patch("app.modules.reviews.service.build_chat_llm", return_value=fake_llm):
        async with _client_as(member_user) as client:
            first = await client.get(f"/api/v1/books/{book_id}/reviews")
            second = await client.get(f"/api/v1/books/{book_id}/reviews")

    assert first.status_code == 200 and second.status_code == 200
    assert first.json()["review_digest"] == "Readers loved this one."
    assert second.json()["review_digest"] == "Readers loved this one."
    # Second call must be served from the Book.reviewDigest cache, not a second LLM call.
    fake_llm.ainvoke.assert_awaited_once()


async def test_review_digest_regenerates_after_review_count_changes(
    member_user, other_member_user, librarian_user
):
    book_id = await _create_book(librarian_user)
    async with _client_as(member_user) as client:
        await client.post(
            f"/api/v1/books/{book_id}/reviews", json={"rating": 5, "comment": "Great"}
        )

    fake_llm = _fake_llm("First summary.")
    with patch("app.modules.reviews.service.build_chat_llm", return_value=fake_llm):
        async with _client_as(member_user) as client:
            await client.get(f"/api/v1/books/{book_id}/reviews")

    async with _client_as(other_member_user) as client:
        await client.post(
            f"/api/v1/books/{book_id}/reviews", json={"rating": 2, "comment": "Mixed feelings"}
        )

    fake_llm_2 = _fake_llm("Second summary.")
    with patch("app.modules.reviews.service.build_chat_llm", return_value=fake_llm_2):
        async with _client_as(member_user) as client:
            response = await client.get(f"/api/v1/books/{book_id}/reviews")

    assert response.json()["review_digest"] == "Second summary."
    fake_llm_2.ainvoke.assert_awaited_once()


async def test_review_digest_degrades_gracefully_when_llm_fails(member_user, librarian_user):
    book_id = await _create_book(librarian_user)
    async with _client_as(member_user) as client:
        await client.post(
            f"/api/v1/books/{book_id}/reviews", json={"rating": 4, "comment": "Solid"}
        )

    fake_llm = SimpleNamespace(ainvoke=AsyncMock(side_effect=RuntimeError("connection refused")))
    with patch("app.modules.reviews.service.build_chat_llm", return_value=fake_llm):
        async with _client_as(member_user) as client:
            response = await client.get(f"/api/v1/books/{book_id}/reviews")

    # The reviews themselves must still come back — a broken LLM degrades the digest,
    # not the whole endpoint.
    assert response.status_code == 200
    assert response.json()["review_digest"] is None
    assert response.json()["total_reviews"] == 1


async def test_member_can_edit_own_review(member_user, librarian_user):
    book_id = await _create_book(librarian_user)
    async with _client_as(member_user) as client:
        created = await client.post(
            f"/api/v1/books/{book_id}/reviews", json={"rating": 2, "comment": "Meh"}
        )
        review_id = created.json()["id"]

        response = await client.put(
            f"/api/v1/reviews/{review_id}", json={"rating": 5, "comment": "Changed my mind"}
        )

    assert response.status_code == 200
    assert response.json()["rating"] == 5
    assert response.json()["comment"] == "Changed my mind"


async def test_member_cannot_edit_others_review(member_user, other_member_user, librarian_user):
    book_id = await _create_book(librarian_user)
    async with _client_as(member_user) as client:
        created = await client.post(
            f"/api/v1/books/{book_id}/reviews", json={"rating": 4, "comment": "Fine"}
        )
        review_id = created.json()["id"]

    async with _client_as(other_member_user) as client:
        response = await client.put(
            f"/api/v1/reviews/{review_id}", json={"rating": 1, "comment": "Hijacked"}
        )

    assert response.status_code == 403


async def test_member_can_delete_own_review(member_user, librarian_user):
    book_id = await _create_book(librarian_user)
    async with _client_as(member_user) as client:
        created = await client.post(
            f"/api/v1/books/{book_id}/reviews", json={"rating": 4, "comment": "Fine"}
        )
        review_id = created.json()["id"]

        response = await client.delete(f"/api/v1/reviews/{review_id}")
        list_response = await client.get(f"/api/v1/books/{book_id}/reviews")

    assert response.status_code == 204
    assert list_response.json()["total_reviews"] == 0


async def test_member_cannot_delete_others_review(member_user, other_member_user, librarian_user):
    book_id = await _create_book(librarian_user)
    async with _client_as(member_user) as client:
        created = await client.post(
            f"/api/v1/books/{book_id}/reviews", json={"rating": 4, "comment": "Fine"}
        )
        review_id = created.json()["id"]

    async with _client_as(other_member_user) as client:
        response = await client.delete(f"/api/v1/reviews/{review_id}")

    assert response.status_code == 403


async def test_moderator_can_delete_any_review(member_user, admin_user, librarian_user):
    book_id = await _create_book(librarian_user)
    async with _client_as(member_user) as client:
        created = await client.post(
            f"/api/v1/books/{book_id}/reviews", json={"rating": 4, "comment": "Fine"}
        )
        review_id = created.json()["id"]

    async with _client_as(admin_user) as client:
        response = await client.delete(f"/api/v1/reviews/{review_id}")

    assert response.status_code == 204


async def test_list_all_reviews_forbidden_for_member(member_user):
    async with _client_as(member_user) as client:
        response = await client.get("/api/v1/reviews")

    assert response.status_code == 403


async def test_list_all_reviews_visible_to_manager(member_user, manager_user, librarian_user):
    book_id = await _create_book(librarian_user)
    async with _client_as(member_user) as client:
        await client.post(f"/api/v1/books/{book_id}/reviews", json={"rating": 5, "comment": "Hi"})

    async with _client_as(manager_user) as client:
        response = await client.get("/api/v1/reviews")

    assert response.status_code == 200
    assert any(review["book_id"] == book_id for review in response.json())


async def test_list_my_reviews(member_user, librarian_user):
    book_id = await _create_book(librarian_user)
    async with _client_as(member_user) as client:
        await client.post(
            f"/api/v1/books/{book_id}/reviews",
            json={"rating": 4, "comment": "My review text"},
        )
        response = await client.get("/api/v1/reviews/me")

    assert response.status_code == 200
    items = response.json()
    assert any(
        item["book_id"] == book_id and item["rating"] == 4 and item["comment"] == "My review text"
        for item in items
    )
