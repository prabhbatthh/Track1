import os
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ["APP_ENV"] = "test"

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.constants import Role
from app.db.prisma import prisma
from app.main import create_app
from app.modules.members import repository as member_repository

os.environ.setdefault("DATABASE_URL", get_settings().database_url)

TEST_EMAIL_DOMAIN = "@members-test.example.com"
TEST_TITLE_MARKER = "MEMBERS-TEST-"


def _unique_email() -> str:
    return f"{uuid.uuid4().hex}{TEST_EMAIL_DOMAIN}"


def _book_payload(**overrides) -> dict:
    payload = {
        "title": f"{TEST_TITLE_MARKER}{uuid.uuid4().hex}",
        "author": "Test Author",
        "category": "Fiction",
        "totalCopies": 1,
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
    domain_filter = {"email": {"endswith": TEST_EMAIL_DOMAIN}}
    await prisma.loan.delete_many(where={"member": domain_filter})
    await prisma.reservation.delete_many(where={"member": domain_filter})
    await prisma.review.delete_many(where={"member": domain_filter})
    await prisma.book.delete_many(where={"title": {"startswith": TEST_TITLE_MARKER}})
    await prisma.user.delete_many(where=domain_filter)
    await prisma.disconnect()


@pytest_asyncio.fixture
async def member_user():
    return await _make_user(Role.MEMBER)


def _client_as(user) -> AsyncClient:
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


_FAKE_PROFILE_JSON = """{
  "interests": ["Fiction", "Science"],
  "difficulty": "Intermediate",
  "preference": "Practical",
  "insight": "Prefers practical technical books."
}"""


async def test_reading_profile_requires_authentication():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/members/me/reading-profile")

    assert response.status_code == 401


async def test_reading_profile_none_without_any_activity(member_user):
    async with _client_as(member_user) as client:
        response = await client.get("/api/v1/members/me/reading-profile")

    assert response.status_code == 200
    assert response.json() is None


async def test_reading_profile_generates_and_caches(member_user):
    book = await prisma.book.create(data=_book_payload())
    await prisma.loan.create(
        data={
            "bookId": book.id,
            "memberId": member_user.id,
            "dueDate": datetime.now(UTC) + timedelta(days=7),
            "createdById": member_user.id,
        }
    )
    fake_llm = SimpleNamespace(
        ainvoke=AsyncMock(return_value=SimpleNamespace(content=_FAKE_PROFILE_JSON))
    )

    # Two separate requests, like a real client would make — get_current_user re-fetches
    # the user from the DB on each real request, so re-fetching here (rather than reusing
    # the fixture's now-stale in-memory object) matches production behavior.
    with patch("app.modules.members.reading_profile.build_chat_llm", return_value=fake_llm):
        async with _client_as(member_user) as client:
            first = await client.get("/api/v1/members/me/reading-profile")
        refreshed = await prisma.user.find_unique(
            where={"id": member_user.id}, include={"role": True}
        )
        async with _client_as(refreshed) as client:
            second = await client.get("/api/v1/members/me/reading-profile")

    assert first.status_code == second.status_code == 200
    body = first.json()
    assert body["interests"] == ["Fiction", "Science"]
    assert body["difficulty"] == "Intermediate"
    # One loan -> activity count unchanged between the two requests -> one LLM call, not two.
    fake_llm.ainvoke.assert_awaited_once()

    stored = await prisma.user.find_unique(where={"id": member_user.id})
    assert stored.readingProfile["preference"] == "Practical"
    assert stored.readingProfileActivityCount == 1


async def test_reading_profile_regenerates_after_new_activity(member_user):
    book = await prisma.book.create(data=_book_payload())
    await prisma.loan.create(
        data={
            "bookId": book.id,
            "memberId": member_user.id,
            "dueDate": datetime.now(UTC) + timedelta(days=7),
            "createdById": member_user.id,
        }
    )
    fake_llm = SimpleNamespace(
        ainvoke=AsyncMock(return_value=SimpleNamespace(content=_FAKE_PROFILE_JSON))
    )
    with patch("app.modules.members.reading_profile.build_chat_llm", return_value=fake_llm):
        async with _client_as(member_user) as client:
            await client.get("/api/v1/members/me/reading-profile")
    fake_llm.ainvoke.assert_awaited_once()

    # New activity (a second loan) should trigger regeneration on the next fetch.
    other_book = await prisma.book.create(data=_book_payload())
    await prisma.loan.create(
        data={
            "bookId": other_book.id,
            "memberId": member_user.id,
            "dueDate": datetime.now(UTC) + timedelta(days=7),
            "createdById": member_user.id,
        }
    )
    refreshed = await prisma.user.find_unique(where={"id": member_user.id}, include={"role": True})
    with patch("app.modules.members.reading_profile.build_chat_llm", return_value=fake_llm):
        async with _client_as(refreshed) as client:
            await client.get("/api/v1/members/me/reading-profile")

    assert fake_llm.ainvoke.await_count == 2
    stored = await prisma.user.find_unique(where={"id": member_user.id})
    assert stored.readingProfileActivityCount == 2


async def test_reading_profile_keeps_stale_cache_when_llm_unavailable(member_user):
    book = await prisma.book.create(data=_book_payload())
    await prisma.loan.create(
        data={
            "bookId": book.id,
            "memberId": member_user.id,
            "dueDate": datetime.now(UTC) + timedelta(days=7),
            "createdById": member_user.id,
        }
    )
    fake_llm = SimpleNamespace(
        ainvoke=AsyncMock(return_value=SimpleNamespace(content=_FAKE_PROFILE_JSON))
    )
    with patch("app.modules.members.reading_profile.build_chat_llm", return_value=fake_llm):
        async with _client_as(member_user) as client:
            await client.get("/api/v1/members/me/reading-profile")

    other_book = await prisma.book.create(data=_book_payload())
    await prisma.loan.create(
        data={
            "bookId": other_book.id,
            "memberId": member_user.id,
            "dueDate": datetime.now(UTC) + timedelta(days=7),
            "createdById": member_user.id,
        }
    )
    refreshed = await prisma.user.find_unique(where={"id": member_user.id}, include={"role": True})
    failing_llm = SimpleNamespace(ainvoke=AsyncMock(side_effect=RuntimeError("connection refused")))
    with patch("app.modules.members.reading_profile.build_chat_llm", return_value=failing_llm):
        async with _client_as(refreshed) as client:
            response = await client.get("/api/v1/members/me/reading-profile")

    # Existing functionality keeps working: still 200 with the last known-good profile,
    # not an error, even though new activity couldn't be re-analyzed right now.
    assert response.status_code == 200
    assert response.json()["preference"] == "Practical"
