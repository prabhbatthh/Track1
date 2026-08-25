import os
import uuid

os.environ["APP_ENV"] = "test"

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.core.constants import Role
from app.core.security import hash_password
from app.db.prisma import prisma
from app.main import create_app
from app.modules.members import repository

os.environ.setdefault("DATABASE_URL", get_settings().database_url)

TEST_EMAIL_DOMAIN = "@reading-goal-test.example.com"


def _unique_email() -> str:
    return f"{uuid.uuid4().hex}{TEST_EMAIL_DOMAIN}"


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    await prisma.connect()
    yield
    await prisma.readingprogress.delete_many(
        where={"member": {"email": {"endswith": TEST_EMAIL_DOMAIN}}}
    )
    await prisma.readinggoal.delete_many(
        where={"member": {"email": {"endswith": TEST_EMAIL_DOMAIN}}}
    )
    await prisma.book.delete_many(where={"title": {"startswith": "Reading Goal Test Book"}})
    await prisma.user.delete_many(where={"email": {"endswith": TEST_EMAIL_DOMAIN}})
    await prisma.disconnect()


@pytest_asyncio.fixture
async def client():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


@pytest_asyncio.fixture
async def member_user():
    role = await repository.upsert_role(Role.MEMBER)
    return await repository.create_member(
        email=_unique_email(),
        password_hash=hash_password("Password123!"),
        full_name="Goal Setter",
        phone=None,
        avatar_url=None,
        role_id=role.id,
    )


async def _login(client: AsyncClient, user) -> str:
    response = await client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": "Password123!"}
    )
    return response.json()["access_token"]


async def test_reading_goal_requires_authentication(client):
    response = await client.get("/api/v1/members/me/reading-goal")

    assert response.status_code == 401


async def test_reading_goal_is_null_before_it_is_set(client, member_user):
    token = await _login(client, member_user)

    response = await client.get(
        "/api/v1/members/me/reading-goal", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    assert response.json() is None


async def test_set_reading_goal_returns_zero_progress_initially(client, member_user):
    token = await _login(client, member_user)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.put(
        "/api/v1/members/me/reading-goal",
        json={"yearly_goal": 24, "monthly_goal": 2},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["yearly_goal"] == 24
    assert body["monthly_goal"] == 2
    assert body["books_completed_this_year"] == 0
    assert body["books_completed_this_month"] == 0


async def test_set_reading_goal_rejects_non_positive_values(client, member_user):
    token = await _login(client, member_user)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.put(
        "/api/v1/members/me/reading-goal",
        json={"yearly_goal": 0, "monthly_goal": 2},
        headers=headers,
    )

    assert response.status_code == 422


async def test_set_reading_goal_rejects_non_integer_values(client, member_user):
    token = await _login(client, member_user)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.put(
        "/api/v1/members/me/reading-goal",
        json={"yearly_goal": 12.5, "monthly_goal": 2},
        headers=headers,
    )

    assert response.status_code == 422


async def test_reading_goal_upsert_updates_existing_row(client, member_user):
    token = await _login(client, member_user)
    headers = {"Authorization": f"Bearer {token}"}

    await client.put(
        "/api/v1/members/me/reading-goal",
        json={"yearly_goal": 24, "monthly_goal": 2},
        headers=headers,
    )
    second = await client.put(
        "/api/v1/members/me/reading-goal",
        json={"yearly_goal": 36, "monthly_goal": 3},
        headers=headers,
    )

    assert second.status_code == 200
    assert second.json()["yearly_goal"] == 36
    assert second.json()["monthly_goal"] == 3

    saved_goal_count = await prisma.readinggoal.count(where={"memberId": member_user.id})
    assert saved_goal_count == 1


async def test_reading_goal_counts_completed_books_this_year_and_month(client, member_user):
    token = await _login(client, member_user)
    headers = {"Authorization": f"Bearer {token}"}

    book = await prisma.book.create(
        data={"title": "Reading Goal Test Book", "author": "Test Author", "category": "Fiction"}
    )
    await client.put(
        "/api/v1/members/me/reading-progress",
        json={"book_id": book.id, "status": "completed", "percent_complete": 100},
        headers=headers,
    )
    await client.put(
        "/api/v1/members/me/reading-goal",
        json={"yearly_goal": 24, "monthly_goal": 2},
        headers=headers,
    )

    response = await client.get("/api/v1/members/me/reading-goal", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["books_completed_this_year"] == 1
    assert body["books_completed_this_month"] == 1
