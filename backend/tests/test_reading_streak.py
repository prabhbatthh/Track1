import os
import uuid
from datetime import UTC, datetime, timedelta

os.environ["APP_ENV"] = "test"

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.core.constants import Role
from app.core.security import hash_password
from app.db.prisma import prisma
from app.main import create_app
from app.modules.members import repository
from app.modules.members.service import compute_streaks

os.environ.setdefault("DATABASE_URL", get_settings().database_url)

TEST_EMAIL_DOMAIN = "@reading-streak-test.example.com"


def _unique_email() -> str:
    return f"{uuid.uuid4().hex}{TEST_EMAIL_DOMAIN}"


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    await prisma.connect()
    yield
    await prisma.loginactivity.delete_many(
        where={"member": {"email": {"endswith": TEST_EMAIL_DOMAIN}}}
    )
    await prisma.user.delete_many(where={"email": {"endswith": TEST_EMAIL_DOMAIN}})
    await prisma.disconnect()


@pytest_asyncio.fixture
async def member_user():
    role = await repository.upsert_role(Role.MEMBER)
    return await repository.create_member(
        email=_unique_email(),
        password_hash=hash_password("Password123!"),
        full_name="Streak Tester",
        phone=None,
        avatar_url=None,
        role_id=role.id,
    )


@pytest_asyncio.fixture
async def client():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


async def _login(client: AsyncClient, user) -> str:
    response = await client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": "Password123!"}
    )
    return response.json()["access_token"]


async def _login_on(member_id: str, days_ago: int) -> None:
    day = datetime.now(UTC) - timedelta(days=days_ago)
    day = datetime(day.year, day.month, day.day, tzinfo=UTC)
    await prisma.loginactivity.upsert(
        where={"memberId_date": {"memberId": member_id, "date": day}},
        data={"create": {"memberId": member_id, "date": day}, "update": {}},
    )


async def test_reading_streak_requires_authentication(client):
    response = await client.get("/api/v1/members/me/reading-streak")

    assert response.status_code == 401


async def test_registering_counts_as_day_one_of_streak(client):
    email = _unique_email()
    register_response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "Fresh Signup"},
    )
    token = register_response.json()["access_token"]

    response = await client.get(
        "/api/v1/members/me/reading-streak", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["current_streak_days"] == 1
    assert body["longest_streak_days"] == 1


async def test_streak_counts_consecutive_days_ending_today(client, member_user):
    for days_ago in range(4):
        await _login_on(member_user.id, days_ago)
    token = await _login(client, member_user)

    response = await client.get(
        "/api/v1/members/me/reading-streak", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    body = response.json()
    # 4 seeded days (today, -1, -2, -3) plus today's real login from _login() (idempotent).
    assert body["current_streak_days"] == 4
    assert body["longest_streak_days"] == 4


async def test_streak_resets_after_a_gap(client, member_user):
    await _login_on(member_user.id, 5)
    await _login_on(member_user.id, 4)
    # gap: no login on day -3, -2, -1
    await _login_on(member_user.id, 0)

    response = await client.get(
        "/api/v1/members/me/reading-streak",
        headers={"Authorization": f"Bearer {await _login(client, member_user)}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["current_streak_days"] == 1
    assert body["longest_streak_days"] == 2


def testcompute_streaks_empty_set_returns_zeros():
    assert compute_streaks(set()) == (0, 0)


def testcompute_streaks_allows_grace_for_missing_today():
    today = datetime.now(UTC).date()
    yesterday = today - timedelta(days=1)
    day_before = today - timedelta(days=2)

    current, longest = compute_streaks({yesterday, day_before})

    assert current == 2
    assert longest == 2


def testcompute_streaks_breaks_after_two_day_gap():
    today = datetime.now(UTC).date()
    old_day = today - timedelta(days=5)

    current, longest = compute_streaks({today, old_day})

    assert current == 1
    assert longest == 1
