import asyncio
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

os.environ.setdefault("DATABASE_URL", get_settings().database_url)

TEST_EMAIL_DOMAIN = "@permission-requests-test.example.com"


def _unique_email() -> str:
    return f"{uuid.uuid4().hex}{TEST_EMAIL_DOMAIN}"


async def _make_user(role_name: str):
    role = await member_repository.upsert_role(role_name)
    return await member_repository.create_member(
        email=_unique_email(),
        password_hash=None,
        full_name=f"Test {role_name.title()}",
        phone=None,
        avatar_url=None,
        role_id=role.id,
    )


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    await prisma.connect()
    yield
    domain_filter = {"email": {"endswith": TEST_EMAIL_DOMAIN}}
    await prisma.permissionrequest.delete_many(where={"requestedBy": domain_filter})
    # Audit entries reference the actor with no cascade, so they have to go
    # before the users do (role changes, bans and fine settlement all log now).
    await prisma.auditlogentry.delete_many(
        where={"actor": {"email": {"endswith": TEST_EMAIL_DOMAIN}}}
    )
    await prisma.user.delete_many(where=domain_filter)
    await prisma.disconnect()


@pytest_asyncio.fixture
async def it_head_user():
    return await _make_user(Role.IT_HEAD)


@pytest_asyncio.fixture
async def manager_user():
    return await _make_user(Role.MANAGER)


@pytest_asyncio.fixture
async def member_user():
    return await _make_user(Role.MEMBER)


def _client_as(user) -> AsyncClient:
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _file_request(manager_user, **overrides) -> dict:
    payload = {"permission": "Fine waiver approval", "reason": "Handles member disputes"}
    payload.update(overrides)
    async with _client_as(manager_user) as client:
        response = await client.post("/api/v1/permission-requests", json=payload)
    return response.json()


async def test_create_request_requires_authentication():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/permission-requests",
            json={"permission": "x", "reason": "y"},
        )
    assert response.status_code == 401


async def test_member_cannot_file_a_request(member_user):
    async with _client_as(member_user) as client:
        response = await client.post(
            "/api/v1/permission-requests", json={"permission": "x", "reason": "y"}
        )
    assert response.status_code == 403


async def test_manager_can_file_a_request(manager_user):
    body = await _file_request(manager_user)

    assert body["permission"] == "Fine waiver approval"
    assert body["status"] == "pending"
    assert body["requested_by_name"] == manager_user.fullName
    assert body["decided_at"] is None


async def test_list_requests_requires_it_head(manager_user):
    await _file_request(manager_user)

    async with _client_as(manager_user) as client:
        response = await client.get("/api/v1/permission-requests")
    assert response.status_code == 403


async def test_it_head_sees_pending_requests(it_head_user, manager_user):
    created = await _file_request(manager_user)

    async with _client_as(it_head_user) as client:
        response = await client.get("/api/v1/permission-requests")

    assert response.status_code == 200
    assert any(row["id"] == created["id"] for row in response.json())


async def test_it_head_can_grant_a_request(it_head_user, manager_user):
    created = await _file_request(manager_user)

    async with _client_as(it_head_user) as client:
        response = await client.post(f"/api/v1/permission-requests/{created['id']}/grant")

    assert response.status_code == 200
    assert response.json()["status"] == "granted"
    assert response.json()["decided_at"] is not None


async def test_it_head_can_deny_a_request(it_head_user, manager_user):
    created = await _file_request(manager_user)

    async with _client_as(it_head_user) as client:
        response = await client.post(f"/api/v1/permission-requests/{created['id']}/deny")

    assert response.status_code == 200
    assert response.json()["status"] == "denied"


async def test_approve_reject_are_the_canonical_verbs_grant_deny_alias_them(
    it_head_user, manager_user
):
    approved = await _file_request(manager_user)
    rejected = await _file_request(manager_user)

    async with _client_as(it_head_user) as client:
        approve_response = await client.post(
            f"/api/v1/permission-requests/{approved['id']}/approve"
        )
        reject_response = await client.post(f"/api/v1/permission-requests/{rejected['id']}/reject")

    assert approve_response.status_code == 200
    assert approve_response.json()["status"] == "granted"
    assert reject_response.status_code == 200
    assert reject_response.json()["status"] == "denied"


async def test_granting_removes_it_from_the_pending_list(it_head_user, manager_user):
    created = await _file_request(manager_user)

    async with _client_as(it_head_user) as client:
        await client.post(f"/api/v1/permission-requests/{created['id']}/grant")
        response = await client.get("/api/v1/permission-requests")

    assert not any(row["id"] == created["id"] for row in response.json())


async def test_deciding_an_already_decided_request_conflicts(it_head_user, manager_user):
    created = await _file_request(manager_user)

    async with _client_as(it_head_user) as client:
        first = await client.post(f"/api/v1/permission-requests/{created['id']}/grant")
        second = await client.post(f"/api/v1/permission-requests/{created['id']}/deny")

    assert first.status_code == 200
    assert second.status_code == 409


async def test_concurrent_opposite_permission_decisions_allow_only_one(it_head_user, manager_user):
    created = await _file_request(manager_user)

    async def decide(action: str):
        async with _client_as(it_head_user) as client:
            return await client.post(f"/api/v1/permission-requests/{created['id']}/{action}")

    responses = await asyncio.gather(decide("grant"), decide("deny"))

    assert sorted(response.status_code for response in responses) == [200, 409]


async def test_manager_cannot_decide_a_request(it_head_user, manager_user):
    created = await _file_request(manager_user)

    async with _client_as(manager_user) as client:
        response = await client.post(f"/api/v1/permission-requests/{created['id']}/grant")

    assert response.status_code == 403
