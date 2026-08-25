import os
import uuid
from datetime import UTC, datetime, timedelta

os.environ["APP_ENV"] = "test"

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from prisma.types import BookWhereInput, UserWhereInput

from app.core.config import get_settings
from app.core.constants import Role
from app.db.prisma import prisma
from app.main import create_app
from app.modules.members import repository as member_repository

os.environ.setdefault("DATABASE_URL", get_settings().database_url)

TEST_EMAIL_DOMAIN = "@leaderboard-test.example.com"
TEST_TITLE_MARKER = "LEADERBOARD-TEST-"


def _unique_email() -> str:
    return f"{uuid.uuid4().hex}{TEST_EMAIL_DOMAIN}"


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


async def _make_book():
    return await prisma.book.create(
        data={
            "title": f"{TEST_TITLE_MARKER}{uuid.uuid4().hex[:8]}",
            "author": "Author",
            "category": "Fiction",
        }
    )


async def _complete(member_id: str, book_id: str):
    await prisma.readingprogress.create(
        data={
            "memberId": member_id,
            "bookId": book_id,
            "status": "completed",
            "percentComplete": 100,
        }
    )


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    await prisma.connect()
    yield
    book_filter: BookWhereInput = {"title": {"startswith": TEST_TITLE_MARKER}}
    user_filter: UserWhereInput = {"email": {"endswith": TEST_EMAIL_DOMAIN}}
    await prisma.loan.delete_many(where={"book": book_filter})  # type: ignore
    await prisma.review.delete_many(where={"book": book_filter})  # type: ignore
    await prisma.readingprogress.delete_many(where={"book": book_filter})  # type: ignore
    await prisma.user.delete_many(where=user_filter)
    await prisma.book.delete_many(where=book_filter)
    await prisma.disconnect()


def _client_as(user) -> AsyncClient:
    from app.api.deps import get_current_user

    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_leaderboard_requires_authentication():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/leaderboard")

    assert response.status_code == 401


async def test_leaderboard_ranks_by_score_and_flags_current_user():
    top_participant = await _make_user(Role.MEMBER)
    book_heavy_reader = await _make_user(Role.MEMBER)
    non_member = await _make_user(Role.GUARDIAN)
    books = [await _make_book() for _ in range(10)]

    # book_heavy_reader completes 9 books (900 pts)
    for i in range(9):
        await _complete(book_heavy_reader.id, books[i].id)

    # top_participant completes 8 books (800 pts) + 5 reviews (125 pts)
    # + 3 on-time returns (45 pts) = 970 pts
    for i in range(8):
        await _complete(top_participant.id, books[i].id)
    for i in range(5):
        await prisma.review.create(
            data={
                "memberId": top_participant.id,
                "bookId": books[i].id,
                "rating": 5,
                "comment": "Great book!",
            }
        )
    now = datetime.now(UTC)
    for i in range(3):
        await prisma.loan.create(
            data={
                "memberId": top_participant.id,
                "bookId": books[i].id,
                "createdById": top_participant.id,
                "borrowedAt": now - timedelta(days=5),
                "dueDate": now + timedelta(days=5),
                "returnedAt": now - timedelta(days=1),
            }
        )

    await _complete(non_member.id, books[0].id)  # not a member — must be excluded

    async with _client_as(book_heavy_reader) as client:
        response = await client.get("/api/v1/leaderboard")

    assert response.status_code == 200
    body = response.json()
    ids = [entry["member_id"] for entry in body]
    assert non_member.id not in ids

    # top_participant (970 pts) ranks above book_heavy_reader (900 pts)
    assert ids.index(top_participant.id) < ids.index(book_heavy_reader.id)

    top_entry = next(e for e in body if e["member_id"] == top_participant.id)
    assert top_entry["books_completed"] == 8
    assert top_entry["reviews_count"] == 5
    assert top_entry["score"] == 970
    assert top_entry["is_current_user"] is False

    # rank is the 1-based position in the returned board. Asserted relative to this
    # entry's own position rather than as a hard-coded 1: the board spans every member
    # in the database, so on a developer machine with demo data seeded these fixtures
    # are legitimately outranked and a literal `== 1` only ever passed on an empty DB.
    assert top_entry["rank"] == ids.index(top_participant.id) + 1

    # reading_champion belongs to rank 1 and nobody else — the rule the old assertion
    # was really checking, now verified wherever rank 1 happens to land.
    champion = next(e for e in body if e["rank"] == 1)
    assert "reading_champion" in champion["badges"]
    assert all("reading_champion" not in e["badges"] for e in body if e["rank"] != 1)

    own_entry = next(e for e in body if e["member_id"] == book_heavy_reader.id)
    assert own_entry["books_completed"] == 9
    assert own_entry["score"] == 900
    assert own_entry["is_current_user"] is True
