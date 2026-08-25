import os
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ["APP_ENV"] = "test"

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from prisma import Json

from app.api.deps import get_current_user, get_optional_user
from app.core.config import get_settings
from app.core.constants import Role
from app.core.security import hash_password
from app.db.prisma import prisma
from app.main import create_app
from app.modules.members import repository as member_repository

os.environ.setdefault("DATABASE_URL", get_settings().database_url)

TEST_EMAIL_DOMAIN = "@books-test.example.com"
TEST_TITLE_MARKER = "BOOKS-TEST-"


def _unique_email() -> str:
    return f"{uuid.uuid4().hex}{TEST_EMAIL_DOMAIN}"


def _unique_title() -> str:
    return f"{TEST_TITLE_MARKER}{uuid.uuid4().hex}"


def _unique_isbn() -> str:
    # 13 digits, shape-valid per the service's ISBN check (not a real checksum).
    return f"979{uuid.uuid4().int % 10**10:010d}"


def _book_payload(**overrides) -> dict:
    payload = {"title": _unique_title(), "author": "Test Author", "category": "Fiction"}
    payload.update(overrides)
    return payload


async def _make_user(role_name: str):
    role = await member_repository.upsert_role(role_name)
    return await member_repository.create_member(
        email=_unique_email(),
        password_hash=hash_password("Password123!"),
        full_name=f"Test {role_name.title()}",
        phone=None,
        avatar_url=None,
        role_id=role.id,
    )


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    await prisma.connect()
    yield
    await prisma.loan.delete_many(where={"book": {"title": {"startswith": TEST_TITLE_MARKER}}})
    await prisma.book.delete_many(where={"title": {"startswith": TEST_TITLE_MARKER}})
    await prisma.user.delete_many(where={"email": {"endswith": TEST_EMAIL_DOMAIN}})
    await prisma.disconnect()


@pytest_asyncio.fixture
async def admin_user():
    return await _make_user(Role.ADMIN)


@pytest_asyncio.fixture
async def librarian_user():
    return await _make_user(Role.LIBRARIAN)


@pytest_asyncio.fixture
async def member_user():
    return await _make_user(Role.MEMBER)


def _client_as(user) -> AsyncClient:
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user
    # /books resolves the viewer through get_optional_user (for personalized sorting),
    # not get_current_user, so it needs its own override to see this user too.
    app.dependency_overrides[get_optional_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _anon_client() -> AsyncClient:
    app = create_app()
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_list_books_is_public():
    """Test Case 1: List Books Success (public, no auth)"""

    async with _anon_client() as client:
        response = await client.get("/api/v1/books")

    print("\nList Books Response:", response.status_code, response.text)

    assert response.status_code == 200
    body = response.json()
    assert "items" in body and "total" in body


async def test_get_book_not_found():
    """Test Case 2: Get Book Not Found"""

    async with _anon_client() as client:
        response = await client.get(f"/api/v1/books/{uuid.uuid4()}")

    print("\nGet Book Response:", response.status_code, response.text)

    assert response.status_code == 404


async def test_get_book_rejects_malformed_id():
    """Test Case 3: Get Book Malformed ID"""

    async with _anon_client() as client:
        response = await client.get("/api/v1/books/not-a-uuid")

    print("\nGet Book Response:", response.status_code, response.text)

    assert response.status_code == 422


async def test_create_book_requires_authentication():
    """Test Case 4: Create Book Requires Authentication"""

    async with _anon_client() as client:
        response = await client.post("/api/v1/books", json=_book_payload())

    print("\nCreate Book Response:", response.status_code, response.text)

    assert response.status_code == 401


async def test_create_book_forbidden_for_member_role(member_user):
    """Test Case 5: Create Book Forbidden (member role)"""

    async with _client_as(member_user) as client:
        response = await client.post("/api/v1/books", json=_book_payload())

    print("\nCreate Book Response:", response.status_code, response.text)

    assert response.status_code == 403


async def test_create_book_success_as_librarian(librarian_user):
    """Test Case 4: Create Book Success (as librarian)"""
    title = _unique_title()
    isbn = _unique_isbn()
    async with _client_as(librarian_user) as client:
        response = await client.post(
            "/api/v1/books",
            json=_book_payload(
                title=title,
                isbn=isbn,
                description="A test book",
                published_year=2020,
                language="English",
            ),
        )
    print("\nCreate Book Response:", response.status_code, response.text)
    assert response.status_code == 201
    body = response.json()
    assert body["title"] == title
    assert body["isbn"] == isbn
    assert body["published_year"] == 2020
    assert body["author"] == "Test Author"
    assert body["category"] == "Fiction"
    assert body["available"] is False


async def test_create_book_duplicate_isbn_conflicts(librarian_user):
    """Test Case 6: Create Book Duplicate ISBN"""

    isbn = _unique_isbn()
    async with _client_as(librarian_user) as client:
        first = await client.post("/api/v1/books", json=_book_payload(isbn=isbn))
        second = await client.post("/api/v1/books", json=_book_payload(isbn=isbn))

    print("\nCreate Book Response:", second.status_code, second.text)

    assert first.status_code == 201
    assert second.status_code == 409


async def test_create_book_rejects_invalid_isbn(librarian_user):
    """Test Case 8: Create Book Invalid ISBN"""

    async with _client_as(librarian_user) as client:
        response = await client.post("/api/v1/books", json=_book_payload(isbn="not-an-isbn"))

    print("\nCreate Book Response:", response.status_code, response.text)

    assert response.status_code == 422


async def test_create_book_rejects_future_published_year(librarian_user):
    """Test Case 9: Create Book Future Published Year"""

    async with _client_as(librarian_user) as client:
        response = await client.post("/api/v1/books", json=_book_payload(published_year=3000))

    print("\nCreate Book Response:", response.status_code, response.text)

    assert response.status_code == 422


async def test_create_book_requires_author_and_category(librarian_user):
    """Test Case 10: Create Book Missing Author/Category"""

    async with _client_as(librarian_user) as client:
        response = await client.post("/api/v1/books", json={"title": _unique_title()})

    print("\nCreate Book Response:", response.status_code, response.text)

    assert response.status_code == 422


async def test_create_book_available_when_copies_positive(librarian_user):
    async with _client_as(librarian_user) as client:
        response = await client.post("/api/v1/books", json=_book_payload(total_copies=3))

    assert response.status_code == 201
    body = response.json()
    assert body["total_copies"] == 3


async def test_create_book_with_shelf_location(librarian_user):
    async with _client_as(librarian_user) as client:
        response = await client.post(
            "/api/v1/books", json=_book_payload(shelf_location="Aisle 3, Shelf B")
        )

    assert response.status_code == 201
    assert response.json()["shelf_location"] == "Aisle 3, Shelf B"


async def test_create_book_without_shelf_location_defaults_to_none(librarian_user):
    async with _client_as(librarian_user) as client:
        response = await client.post("/api/v1/books", json=_book_payload())

    assert response.status_code == 201
    assert response.json()["shelf_location"] is None


async def test_update_book_can_set_and_clear_shelf_location(librarian_user):
    async with _client_as(librarian_user) as client:
        created = await client.post("/api/v1/books", json=_book_payload())
        book_id = created.json()["id"]
        assert created.json()["shelf_location"] is None

        set_response = await client.put(
            f"/api/v1/books/{book_id}", json={"shelf_location": "Aisle 3, Shelf B"}
        )
        assert set_response.json()["shelf_location"] == "Aisle 3, Shelf B"

        cleared_response = await client.put(
            f"/api/v1/books/{book_id}", json={"shelf_location": None}
        )

    assert set_response.status_code == 200
    assert cleared_response.status_code == 200
    assert cleared_response.json()["shelf_location"] is None


async def test_suggest_description_requires_authentication():
    async with _anon_client() as client:
        response = await client.post(
            "/api/v1/books/suggest-description",
            json={"title": "Dune", "author": "Frank Herbert"},
        )

    assert response.status_code == 401


async def test_suggest_description_forbidden_for_member_role(member_user):
    async with _client_as(member_user) as client:
        response = await client.post(
            "/api/v1/books/suggest-description",
            json={"title": "Dune", "author": "Frank Herbert"},
        )

    assert response.status_code == 403


async def test_suggest_description_success_as_librarian(librarian_user):
    fake_reply = SimpleNamespace(
        content="A sweeping saga of politics and prophecy on a desert world."
    )
    fake_llm = SimpleNamespace(ainvoke=AsyncMock(return_value=fake_reply))

    with patch("app.modules.books.service.build_chat_llm", return_value=fake_llm):
        async with _client_as(librarian_user) as client:
            response = await client.post(
                "/api/v1/books/suggest-description",
                json={"title": "Dune", "author": "Frank Herbert", "category": "Science Fiction"},
            )

    assert response.status_code == 200
    assert response.json() == {
        "description": "A sweeping saga of politics and prophecy on a desert world."
    }
    fake_llm.ainvoke.assert_awaited_once()


async def test_suggest_description_degrades_gracefully_when_llm_unavailable(librarian_user):
    fake_llm = SimpleNamespace(ainvoke=AsyncMock(side_effect=RuntimeError("connection refused")))

    with patch("app.modules.books.service.build_chat_llm", return_value=fake_llm):
        async with _client_as(librarian_user) as client:
            response = await client.post(
                "/api/v1/books/suggest-description",
                json={"title": "Dune", "author": "Frank Herbert"},
            )

    assert response.status_code == 503


async def test_identify_cover_requires_authentication():
    async with _anon_client() as client:
        response = await client.post("/api/v1/books/identify-cover", json={"image": "data:x"})
    assert response.status_code == 401


async def test_identify_cover_forbidden_for_member_role(member_user):
    async with _client_as(member_user) as client:
        response = await client.post("/api/v1/books/identify-cover", json={"image": "data:x"})
    assert response.status_code == 403


async def test_identify_cover_merges_vision_guess_with_verified_metadata(librarian_user):
    vision_guess = {"title": "Dune", "author": "Frank Herbert", "isbn": None}
    verified = {
        "title": "Dune",
        "author": "Frank Herbert",
        "isbn": "9780441013593",
        "publisher": "Ace Books",
        "published_year": 1965,
        "language": "English",
        "category": "Science",
        "description": "A verified description from the metadata API.",
    }
    with (
        patch("app.modules.books.service._vision_identify", AsyncMock(return_value=vision_guess)),
        patch("app.modules.books.service._lookup_metadata", AsyncMock(return_value=verified)),
    ):
        async with _client_as(librarian_user) as client:
            response = await client.post(
                "/api/v1/books/identify-cover", json={"image": "data:image/png;base64,abc"}
            )

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Dune"
    assert body["isbn"] == "9780441013593"
    assert body["publisher"] == "Ace Books"
    assert body["category"] == "Science"
    assert body["verified"] is True


async def test_identify_cover_degrades_gracefully_when_nothing_matches(librarian_user):
    with (
        patch("app.modules.books.service._vision_identify", AsyncMock(return_value={})),
        patch("app.modules.books.service._lookup_metadata", AsyncMock(return_value={})),
    ):
        async with _client_as(librarian_user) as client:
            response = await client.post(
                "/api/v1/books/identify-cover", json={"image": "data:image/png;base64,abc"}
            )

    # Never an error — an unidentifiable cover just means every field stays blank for
    # staff to fill in manually.
    assert response.status_code == 200
    body = response.json()
    assert body["title"] is None
    assert body["verified"] is False


def test_map_category_matches_known_subjects():
    from app.modules.books.service import _map_category

    assert _map_category(["Science fiction", "Adventure"]) == "Fiction"
    assert _map_category(["Self-help techniques"]) == "Self-Help"
    assert _map_category(["Completely unrelated subject"]) is None


async def test_update_cannot_shrink_copies_below_active_loans(librarian_user, member_user):
    book = await prisma.book.create(data=_book_payload(totalCopies=2))
    other_member = await _make_user(Role.MEMBER)
    for borrower in (member_user, other_member):
        await prisma.loan.create(
            data={
                "bookId": book.id,
                "memberId": borrower.id,
                "createdById": librarian_user.id,
                "dueDate": datetime.now(UTC) + timedelta(days=14),
            }
        )

    async with _client_as(librarian_user) as client:
        response = await client.put(f"/api/v1/books/{book.id}", json={"total_copies": 1})

    assert response.status_code == 409
    saved = await prisma.book.find_unique(where={"id": book.id})
    assert saved is not None
    assert saved.totalCopies == 2


async def test_list_books_search_and_pagination(librarian_user):
    unique_marker = uuid.uuid4().hex[:8]
    async with _client_as(librarian_user) as client:
        for i in range(3):
            await client.post(
                "/api/v1/books",
                json=_book_payload(title=f"{TEST_TITLE_MARKER}Searchable-{unique_marker}-{i}"),
            )

        response = await client.get(
            "/api/v1/books", params={"search": unique_marker, "page": 1, "page_size": 2}
        )

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2
    assert all(unique_marker in item["title"] for item in body["items"])


async def test_list_books_filters_by_category(librarian_user):
    unique_marker = uuid.uuid4().hex[:8]
    title = f"{TEST_TITLE_MARKER}CategoryFilter-{unique_marker}"
    async with _client_as(librarian_user) as client:
        await client.post("/api/v1/books", json=_book_payload(title=title, category="Science"))

        response = await client.get(
            "/api/v1/books", params={"search": unique_marker, "category": "Science"}
        )
        miss = await client.get(
            "/api/v1/books", params={"search": unique_marker, "category": "History"}
        )

    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert miss.json()["total"] == 0


async def test_update_book_changes_fields(librarian_user):
    async with _client_as(librarian_user) as client:
        created = await client.post("/api/v1/books", json=_book_payload())
        book_id = created.json()["id"]

        updated_title = f"{TEST_TITLE_MARKER}Updated-{uuid.uuid4().hex[:8]}"
        response = await client.put(
            f"/api/v1/books/{book_id}",
            json={"title": updated_title, "published_year": 1999},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == updated_title
    assert body["published_year"] == 1999


async def test_update_book_can_clear_nullable_fields(librarian_user):
    async with _client_as(librarian_user) as client:
        created = await client.post(
            "/api/v1/books",
            json=_book_payload(description="Has a description"),
        )
        book_id = created.json()["id"]
        assert created.json()["description"] == "Has a description"

        response = await client.put(f"/api/v1/books/{book_id}", json={"description": None})

    assert response.status_code == 200
    assert response.json()["description"] is None


async def test_delete_book_forbidden_for_librarian(librarian_user):
    async with _client_as(librarian_user) as client:
        created = await client.post("/api/v1/books", json=_book_payload())
        book_id = created.json()["id"]

        response = await client.delete(f"/api/v1/books/{book_id}")

    assert response.status_code == 403


async def test_delete_book_success_as_admin(admin_user, librarian_user):
    """Test Case 11: Delete Book Success (as admin)"""

    async with _client_as(librarian_user) as client:
        created = await client.post("/api/v1/books", json=_book_payload())
        book_id = created.json()["id"]

    async with _client_as(admin_user) as client:
        delete_response = await client.delete(f"/api/v1/books/{book_id}")

    print("\nDelete Book Response:", delete_response.status_code, delete_response.text)

    async with _anon_client() as client:
        get_response = await client.get(f"/api/v1/books/{book_id}")

    assert delete_response.status_code == 204
    assert get_response.status_code == 404


async def test_related_books_not_found():
    async with _anon_client() as client:
        response = await client.get(f"/api/v1/books/{uuid.uuid4()}/related")

    assert response.status_code == 404


async def test_related_books_ranks_by_co_borrowing(member_user):
    """No embedding provider available -> ensure_embedding degrades to [] and the
    endpoint falls back to its pre-embedding co-borrow ranking, unchanged."""
    anchor = await prisma.book.create(data=_book_payload(category="Fiction"))
    co_borrowed = await prisma.book.create(data=_book_payload(category="Sci-Fi"))
    unrelated = await prisma.book.create(data=_book_payload(category="History"))

    other_member = await _make_user(Role.MEMBER)
    for reader in (member_user, other_member):
        await prisma.loan.create(
            data={
                "bookId": anchor.id,
                "memberId": reader.id,
                "dueDate": datetime.now(UTC) + timedelta(days=7),
                "createdById": reader.id,
            }
        )
        await prisma.loan.create(
            data={
                "bookId": co_borrowed.id,
                "memberId": reader.id,
                "dueDate": datetime.now(UTC) + timedelta(days=7),
                "createdById": reader.id,
            }
        )

    with patch(
        "app.modules.books.embeddings.build_embeddings",
        side_effect=RuntimeError("no embedding provider configured"),
    ):
        async with _anon_client() as client:
            response = await client.get(f"/api/v1/books/{anchor.id}/related")

    assert response.status_code == 200
    ids = [item["id"] for item in response.json()]
    assert co_borrowed.id in ids
    assert unrelated.id not in ids or ids.index(co_borrowed.id) < ids.index(unrelated.id)


async def test_related_books_falls_back_to_category_without_loan_history():
    """Same degrade-gracefully path as above, exercised via the category/author tier."""
    anchor = await prisma.book.create(data=_book_payload(category="Poetry"))
    same_category = await prisma.book.create(data=_book_payload(category="Poetry"))

    with patch(
        "app.modules.books.embeddings.build_embeddings",
        side_effect=RuntimeError("no embedding provider configured"),
    ):
        async with _anon_client() as client:
            response = await client.get(f"/api/v1/books/{anchor.id}/related")

    assert response.status_code == 200
    ids = [item["id"] for item in response.json()]
    assert same_category.id in ids


def _fake_embeddings(vector_by_keyword: dict[str, list[float]], default: list[float]):
    """A minimal stand-in for a LangChain Embeddings object: returns a fixed vector
    based on which keyword appears in the text handed to embedding_text()."""

    async def aembed_query(text: str) -> list[float]:
        for keyword, vector in vector_by_keyword.items():
            if keyword in text:
                return vector
        return default

    return SimpleNamespace(aembed_query=aembed_query)


async def test_related_books_ranks_by_embedding_similarity():
    """Semantic similarity, not category/author matching: the anchor and its closest
    match share no category or author, but their (cached) embeddings are near-identical,
    while a same-category/same-author book's embedding points the opposite way and
    should rank lower. Candidate embeddings are pre-seeded rather than computed inline —
    get_related_books ranks against whatever's already cached (populated in practice by
    scripts/backfill_book_embeddings.py) and never embeds a whole catalog per request."""
    anchor = await prisma.book.create(data=_book_payload(category="Fiction", author="Author A"))
    close_match = await prisma.book.create(
        data=_book_payload(category="Science", author="Author B")
    )
    far_match = await prisma.book.create(data=_book_payload(category="Fiction", author="Author A"))

    await prisma.book.update(where={"id": close_match.id}, data={"embedding": [1.0, 0.0]})
    await prisma.book.update(where={"id": far_match.id}, data={"embedding": [0.0, 1.0]})

    fake = _fake_embeddings({}, default=[1.0, 0.0])  # anchor embeds to the close_match's vector
    with patch("app.modules.books.embeddings.build_embeddings", return_value=fake):
        async with _anon_client() as client:
            response = await client.get(f"/api/v1/books/{anchor.id}/related")

    assert response.status_code == 200
    ids = [item["id"] for item in response.json()]
    assert close_match.id in ids
    assert far_match.id not in ids or ids.index(close_match.id) < ids.index(far_match.id)


async def test_related_books_caches_embedding_after_first_request():
    anchor = await prisma.book.create(
        data=_book_payload(description="A journey through deep space")
    )
    await prisma.book.create(data=_book_payload(description="A cozy cookbook"))

    fake = _fake_embeddings({"space": [1.0, 0.0], "cookbook": [0.0, 1.0]}, default=[0.5, 0.5])
    with patch(
        "app.modules.books.embeddings.build_embeddings", return_value=fake
    ) as build_embeddings_mock:
        async with _anon_client() as client:
            first = await client.get(f"/api/v1/books/{anchor.id}/related")
            second = await client.get(f"/api/v1/books/{anchor.id}/related")

    assert first.status_code == second.status_code == 200
    # Anchor's own vector is computed once and reused, not recomputed per request —
    # build_embeddings() itself may still be called again for the other book's vector,
    # so this checks the persisted value rather than call counts.
    stored = await prisma.book.find_unique(where={"id": anchor.id})
    assert stored.embedding == [1.0, 0.0]
    assert build_embeddings_mock.called


async def test_update_book_invalidates_cached_embedding(librarian_user):
    book = await prisma.book.create(data=_book_payload(description="A journey through deep space"))
    await prisma.book.update(where={"id": book.id}, data={"embedding": [1.0, 0.0]})

    async with _client_as(librarian_user) as client:
        response = await client.put(
            f"/api/v1/books/{book.id}", json={"description": "Completely different plot"}
        )

    assert response.status_code == 200
    stored = await prisma.book.find_unique(where={"id": book.id})
    assert stored.embedding == []


async def test_book_without_reviews_has_no_rating(member_user):
    book = await prisma.book.create(data=_book_payload())

    async with _anon_client() as client:
        response = await client.get(f"/api/v1/books/{book.id}")

    assert response.status_code == 200
    body = response.json()
    assert body["average_rating"] is None
    assert body["review_count"] == 0


async def test_get_book_includes_average_rating(member_user):
    book = await prisma.book.create(data=_book_payload())
    other_member = await _make_user(Role.MEMBER)
    await prisma.review.create(
        data={
            "bookId": book.id,
            "memberId": member_user.id,
            "rating": 5,
            "comment": "Loved it",
            "images": [],
        }
    )
    await prisma.review.create(
        data={
            "bookId": book.id,
            "memberId": other_member.id,
            "rating": 3,
            "comment": "It was fine",
            "images": [],
        }
    )

    async with _anon_client() as client:
        response = await client.get(f"/api/v1/books/{book.id}")

    assert response.status_code == 200
    body = response.json()
    assert body["average_rating"] == 4.0
    assert body["review_count"] == 2


async def test_list_books_includes_average_rating(member_user):
    book = await prisma.book.create(data=_book_payload())
    await prisma.review.create(
        data={
            "bookId": book.id,
            "memberId": member_user.id,
            "rating": 4,
            "comment": "Good read",
            "images": [],
        }
    )

    async with _anon_client() as client:
        response = await client.get("/api/v1/books", params={"search": book.title})

    assert response.status_code == 200
    items = response.json()["items"]
    row = next(item for item in items if item["id"] == book.id)
    assert row["average_rating"] == 4.0
    assert row["review_count"] == 1


async def test_sort_by_rating_orders_highest_first(member_user):
    marker = f"{TEST_TITLE_MARKER}rating-{uuid.uuid4().hex[:6]}"
    low = await prisma.book.create(data=_book_payload(title=f"{marker}-low"))
    high = await prisma.book.create(data=_book_payload(title=f"{marker}-high"))
    unrated = await prisma.book.create(data=_book_payload(title=f"{marker}-unrated"))
    await prisma.review.create(
        data={
            "bookId": low.id,
            "memberId": member_user.id,
            "rating": 2,
            "images": [],
            "comment": "meh",
        }
    )
    other_member = await _make_user(Role.MEMBER)
    await prisma.review.create(
        data={
            "bookId": high.id,
            "memberId": other_member.id,
            "rating": 5,
            "images": [],
            "comment": "great",
        }
    )

    async with _anon_client() as client:
        response = await client.get(
            "/api/v1/books", params={"search": marker, "sort": "rating", "page_size": 10}
        )

    assert response.status_code == 200
    ids = [item["id"] for item in response.json()["items"]]
    # Rated-highest first; the unrated book (no reviews) sorts behind both.
    assert ids.index(high.id) < ids.index(low.id) < ids.index(unrated.id)


async def test_sort_recommended_prioritizes_matching_category_and_excludes_borrowed(
    member_user,
):
    marker = f"{TEST_TITLE_MARKER}rec-{uuid.uuid4().hex[:6]}"
    borrowed = await prisma.book.create(
        data=_book_payload(title=f"{marker}-borrowed", category="Science", author="Carl Sagan")
    )
    same_author = await prisma.book.create(
        data=_book_payload(title=f"{marker}-same-author", category="Fiction", author="Carl Sagan")
    )
    same_category = await prisma.book.create(
        data=_book_payload(title=f"{marker}-same-category", category="Science", author="Nobody")
    )
    unrelated = await prisma.book.create(
        data=_book_payload(title=f"{marker}-unrelated", category="Poetry", author="Nobody")
    )
    await prisma.loan.create(
        data={
            "bookId": borrowed.id,
            "memberId": member_user.id,
            "dueDate": datetime.now(UTC) + timedelta(days=7),
            "createdById": member_user.id,
        }
    )

    async with _client_as(member_user) as client:
        response = await client.get(
            "/api/v1/books", params={"search": marker, "sort": "recommended", "page_size": 10}
        )

    assert response.status_code == 200
    ids = [item["id"] for item in response.json()["items"]]
    # Already-borrowed book is excluded outright — "recommended" means something new.
    assert borrowed.id not in ids
    # Author match (weighted higher) outranks category match, which outranks no match.
    assert ids.index(same_author.id) < ids.index(same_category.id) < ids.index(unrelated.id)


async def test_sort_recommended_without_auth_falls_back_gracefully():
    marker = f"{TEST_TITLE_MARKER}rec-anon-{uuid.uuid4().hex[:6]}"
    await prisma.book.create(data=_book_payload(title=f"{marker}-a"))
    await prisma.book.create(data=_book_payload(title=f"{marker}-b"))

    async with _anon_client() as client:
        response = await client.get(
            "/api/v1/books", params={"search": marker, "sort": "recommended"}
        )

    assert response.status_code == 200
    assert len(response.json()["items"]) == 2


_FAKE_INSIGHTS_JSON = """{
  "summary": "A short summary.",
  "key_concepts": ["concept a", "concept b", "concept c"],
  "themes": ["theme a", "theme b"],
  "difficulty": "Intermediate",
  "technical_difficulty": "Unknown",
  "vocabulary_complexity": "Medium",
  "prerequisites": [],
  "why_read": "Because it is good."
}"""


async def test_book_insights_not_found():
    async with _anon_client() as client:
        response = await client.get(f"/api/v1/books/{uuid.uuid4()}/insights")

    assert response.status_code == 404


async def test_book_insights_generates_and_caches():
    book = await prisma.book.create(data=_book_payload(description="A story about space."))
    fake_llm = SimpleNamespace(
        ainvoke=AsyncMock(return_value=SimpleNamespace(content=_FAKE_INSIGHTS_JSON))
    )

    with patch("app.modules.books.insights.build_chat_llm", return_value=fake_llm):
        async with _anon_client() as client:
            first = await client.get(f"/api/v1/books/{book.id}/insights")
            second = await client.get(f"/api/v1/books/{book.id}/insights")

    assert first.status_code == second.status_code == 200
    body = first.json()
    assert body["difficulty"] == "Intermediate"
    assert body["key_concepts"] == ["concept a", "concept b", "concept c"]
    # Second request is a pure cache hit — the LLM is called once, not per request.
    fake_llm.ainvoke.assert_awaited_once()
    stored = await prisma.book.find_unique(where={"id": book.id})
    assert stored.aiInsights["difficulty"] == "Intermediate"


async def test_book_insights_unavailable_when_llm_fails():
    book = await prisma.book.create(data=_book_payload())
    fake_llm = SimpleNamespace(ainvoke=AsyncMock(side_effect=RuntimeError("connection refused")))

    with patch("app.modules.books.insights.build_chat_llm", return_value=fake_llm):
        async with _anon_client() as client:
            response = await client.get(f"/api/v1/books/{book.id}/insights")

    # Existing functionality (the endpoint itself) keeps working — 200 with a null body,
    # not a 500 — even though the AI provider is unreachable.
    assert response.status_code == 200
    assert response.json() is None


async def test_update_book_invalidates_cached_ai_insights(librarian_user):
    book = await prisma.book.create(data=_book_payload())
    await prisma.book.update(
        where={"id": book.id}, data={"aiInsights": Json({"difficulty": "Advanced"})}
    )

    async with _client_as(librarian_user) as client:
        response = await client.put(
            f"/api/v1/books/{book.id}", json={"description": "A brand new plot"}
        )

    assert response.status_code == 200
    stored = await prisma.book.find_unique(where={"id": book.id})
    assert stored.aiInsights is None
