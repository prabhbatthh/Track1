import os
import uuid

os.environ["APP_ENV"] = "test"

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.constants import Role
from app.db.prisma import prisma
from app.main import create_app
from app.modules.members import repository as member_repository
from app.modules.notifications import service as notifications_service

os.environ.setdefault("DATABASE_URL", get_settings().database_url)

TEST_EMAIL_DOMAIN = "@notifications-test.example.com"


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


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    await prisma.connect()
    yield
    domain_filter = {"email": {"endswith": TEST_EMAIL_DOMAIN}}
    await prisma.notification.delete_many(where={"user": domain_filter})
    await prisma.user.delete_many(where=domain_filter)
    await prisma.disconnect()


@pytest_asyncio.fixture
async def member_user():
    return await _make_user(Role.MEMBER)


@pytest_asyncio.fixture
async def other_member():
    return await _make_user(Role.MEMBER)


def _client_as(user) -> AsyncClient:
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _anon_client() -> AsyncClient:
    app = create_app()
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_list_my_notifications_requires_authentication():
    async with _anon_client() as client:
        response = await client.get("/api/v1/notifications/me")
    assert response.status_code == 401


async def test_mark_as_read_requires_authentication():
    async with _anon_client() as client:
        response = await client.post(f"/api/v1/notifications/{uuid.uuid4()}/read")
    assert response.status_code == 401


async def test_member_sees_only_their_own_notifications(member_user, other_member):
    await notifications_service.create_notification(member_user.id, "announcement", "For me")
    await notifications_service.create_notification(other_member.id, "announcement", "Not for me")

    async with _client_as(member_user) as client:
        response = await client.get("/api/v1/notifications/me")

    assert response.status_code == 200
    messages = [n["message"] for n in response.json()]
    assert "For me" in messages
    assert "Not for me" not in messages


async def test_mark_as_read_updates_the_notification(member_user):
    created = await notifications_service.create_notification(
        member_user.id, "announcement", "Please read me"
    )
    assert created.read is False

    async with _client_as(member_user) as client:
        response = await client.post(f"/api/v1/notifications/{created.id}/read")

    assert response.status_code == 200
    assert response.json()["read"] is True


async def test_cannot_mark_another_members_notification_as_read(member_user, other_member):
    created = await notifications_service.create_notification(
        other_member.id, "announcement", "Someone else's notification"
    )

    async with _client_as(member_user) as client:
        response = await client.post(f"/api/v1/notifications/{created.id}/read")

    assert response.status_code == 403


async def test_mark_all_as_read_requires_authentication():
    async with _anon_client() as client:
        response = await client.post("/api/v1/notifications/read-all")
    assert response.status_code == 401


async def test_mark_all_as_read_marks_every_unread_notification(member_user):
    await notifications_service.create_notification(member_user.id, "announcement", "First")
    await notifications_service.create_notification(member_user.id, "announcement", "Second")

    async with _client_as(member_user) as client:
        response = await client.post("/api/v1/notifications/read-all")

    assert response.status_code == 200
    body = response.json()
    assert len(body) >= 2
    assert all(n["read"] for n in body)


async def test_mark_all_as_read_does_not_touch_other_members_notifications(
    member_user, other_member
):
    await notifications_service.create_notification(member_user.id, "announcement", "Mine")
    other_created = await notifications_service.create_notification(
        other_member.id, "announcement", "Not mine"
    )

    async with _client_as(member_user) as client:
        await client.post("/api/v1/notifications/read-all")

    async with _client_as(other_member) as client:
        response = await client.get("/api/v1/notifications/me")

    other_notification = next(n for n in response.json() if n["id"] == other_created.id)
    assert other_notification["read"] is False
