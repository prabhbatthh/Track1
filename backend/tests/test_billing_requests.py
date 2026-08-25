import asyncio
import os
import uuid

os.environ["APP_ENV"] = "test"

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.core.constants import Role
from app.db.prisma import prisma
from app.main import create_app
from app.modules.members import repository as member_repository

os.environ.setdefault("DATABASE_URL", get_settings().database_url)

TEST_EMAIL_DOMAIN = "@billing-requests-test.example.com"


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
    await prisma.auditlogentry.delete_many(where={"actor": domain_filter})
    await prisma.notification.delete_many(where={"user": domain_filter})
    await prisma.billingrequest.delete_many(where={"member": domain_filter})
    await prisma.user.delete_many(where=domain_filter)
    await prisma.disconnect()


@pytest_asyncio.fixture
async def member_user():
    return await _make_user(Role.MEMBER)


@pytest_asyncio.fixture
async def manager_user():
    return await _make_user(Role.MANAGER)


@pytest_asyncio.fixture
async def admin_user():
    return await _make_user(Role.ADMIN)


def _client_as(user) -> AsyncClient:
    from app.api.deps import get_current_user

    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _file_request(manager_user, member_user, **overrides) -> dict:
    payload = {
        "member_id": member_user.id,
        "type": "refund",
        "amount": 300,
        "reason": "Duplicate event payment",
    }
    payload.update(overrides)
    async with _client_as(manager_user) as client:
        response = await client.post("/api/v1/billing-requests", json=payload)
    return response.json()


async def test_create_request_requires_authentication():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/billing-requests",
            json={"member_id": str(uuid.uuid4()), "type": "refund", "amount": 100, "reason": "x"},
        )

    assert response.status_code == 401


async def test_member_cannot_file_a_request(member_user):
    async with _client_as(member_user) as client:
        response = await client.post(
            "/api/v1/billing-requests",
            json={
                "member_id": member_user.id,
                "type": "refund",
                "amount": 100,
                "reason": "x",
            },
        )

    assert response.status_code == 403


async def test_admin_cannot_file_a_request(admin_user, member_user):
    async with _client_as(admin_user) as client:
        response = await client.post(
            "/api/v1/billing-requests",
            json={
                "member_id": member_user.id,
                "type": "refund",
                "amount": 100,
                "reason": "x",
            },
        )

    assert response.status_code == 403


async def test_manager_can_file_a_request_on_behalf_of_a_member(manager_user, member_user):
    body = await _file_request(manager_user, member_user, type="fee_waiver", amount=750)

    assert body["type"] == "fee_waiver"
    assert body["amount"] == 750
    assert body["status"] == "pending"
    assert body["member_id"] == member_user.id
    assert body["member_name"] == member_user.fullName
    assert body["created_by_name"] == manager_user.fullName


async def test_filing_a_request_notifies_admins(admin_user, manager_user, member_user):
    await _file_request(manager_user, member_user, type="refund", amount=300)

    async with _client_as(admin_user) as client:
        response = await client.get("/api/v1/notifications/me")

    assert response.status_code == 200
    notification = next(n for n in response.json() if n["type"] == "pending-request")
    assert manager_user.fullName in notification["message"]
    assert member_user.fullName in notification["message"]
    assert "₹300" in notification["message"]
    assert notification["read"] is False


async def test_filing_a_request_does_not_notify_non_admins(manager_user, member_user):
    await _file_request(manager_user, member_user)

    async with _client_as(manager_user) as client:
        response = await client.get("/api/v1/notifications/me")

    assert response.status_code == 200
    assert not any(n["type"] == "pending-request" for n in response.json())


async def test_waiving_a_fine_directly_does_not_notify_admins(admin_user, member_user):
    async with _client_as(admin_user) as client:
        await client.post(
            "/api/v1/billing-requests/waive-fine",
            json={"member_id": member_user.id, "amount": 150, "reason": "Late return grace"},
        )
        response = await client.get("/api/v1/notifications/me")

    assert response.status_code == 200
    assert not any(n["type"] == "pending-request" for n in response.json())


async def test_file_request_for_missing_member_returns_404(manager_user):
    async with _client_as(manager_user) as client:
        response = await client.post(
            "/api/v1/billing-requests",
            json={
                "member_id": str(uuid.uuid4()),
                "type": "refund",
                "amount": 100,
                "reason": "x",
            },
        )

    assert response.status_code == 404


async def test_list_requests_requires_admin(manager_user, member_user):
    await _file_request(manager_user, member_user)

    async with _client_as(manager_user) as client:
        response = await client.get("/api/v1/billing-requests")

    assert response.status_code == 403


async def test_admin_sees_pending_requests(admin_user, manager_user, member_user):
    created = await _file_request(manager_user, member_user)

    async with _client_as(admin_user) as client:
        response = await client.get("/api/v1/billing-requests")

    assert response.status_code == 200
    assert any(row["id"] == created["id"] for row in response.json())


async def test_admin_can_approve_a_request(admin_user, manager_user, member_user):
    created = await _file_request(manager_user, member_user)

    async with _client_as(admin_user) as client:
        response = await client.post(f"/api/v1/billing-requests/{created['id']}/approve")

    assert response.status_code == 200
    assert response.json()["status"] == "approved"
    assert response.json()["decided_at"] is not None


async def test_admin_can_reject_a_request(admin_user, manager_user, member_user):
    created = await _file_request(manager_user, member_user)

    async with _client_as(admin_user) as client:
        response = await client.post(f"/api/v1/billing-requests/{created['id']}/reject")

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"


async def test_concurrent_opposite_billing_decisions_allow_only_one(
    admin_user, manager_user, member_user
):
    created = await _file_request(manager_user, member_user)

    async def decide(action: str):
        async with _client_as(admin_user) as client:
            return await client.post(f"/api/v1/billing-requests/{created['id']}/{action}")

    responses = await asyncio.gather(decide("approve"), decide("reject"))

    assert sorted(response.status_code for response in responses) == [200, 409]
    audits = await prisma.auditlogentry.find_many(where={"actorId": admin_user.id})
    assert len(audits) == 1


async def test_approving_removes_it_from_the_pending_list(admin_user, manager_user, member_user):
    created = await _file_request(manager_user, member_user)

    async with _client_as(admin_user) as client:
        await client.post(f"/api/v1/billing-requests/{created['id']}/approve")
        response = await client.get("/api/v1/billing-requests")

    assert not any(row["id"] == created["id"] for row in response.json())


async def test_deciding_an_already_decided_request_conflicts(admin_user, manager_user, member_user):
    created = await _file_request(manager_user, member_user)

    async with _client_as(admin_user) as client:
        first = await client.post(f"/api/v1/billing-requests/{created['id']}/approve")
        second = await client.post(f"/api/v1/billing-requests/{created['id']}/reject")

    assert first.status_code == 200
    assert second.status_code == 409


async def test_manager_cannot_decide_a_request(admin_user, manager_user, member_user):
    created = await _file_request(manager_user, member_user)

    async with _client_as(manager_user) as client:
        response = await client.post(f"/api/v1/billing-requests/{created['id']}/approve")

    assert response.status_code == 403


async def test_waive_fine_requires_authentication():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/billing-requests/waive-fine",
            json={"member_id": str(uuid.uuid4()), "amount": 100, "reason": "x"},
        )

    assert response.status_code == 401


async def test_manager_cannot_waive_a_fine_directly(manager_user, member_user):
    async with _client_as(manager_user) as client:
        response = await client.post(
            "/api/v1/billing-requests/waive-fine",
            json={"member_id": member_user.id, "amount": 100, "reason": "x"},
        )

    assert response.status_code == 403


async def test_member_cannot_waive_a_fine_directly(member_user):
    async with _client_as(member_user) as client:
        response = await client.post(
            "/api/v1/billing-requests/waive-fine",
            json={"member_id": member_user.id, "amount": 100, "reason": "x"},
        )

    assert response.status_code == 403


async def test_admin_can_waive_a_fine_directly(admin_user, member_user):
    async with _client_as(admin_user) as client:
        response = await client.post(
            "/api/v1/billing-requests/waive-fine",
            json={"member_id": member_user.id, "amount": 150, "reason": "Late return grace"},
        )

    assert response.status_code == 201
    body = response.json()
    assert body["type"] == "fee_waiver"
    assert body["status"] == "approved"
    assert body["amount"] == 150
    assert body["member_id"] == member_user.id
    assert body["created_by_name"] == admin_user.fullName
    assert body["decided_at"] is not None


async def test_waived_fine_never_appears_in_the_pending_list(admin_user, member_user):
    async with _client_as(admin_user) as client:
        created = await client.post(
            "/api/v1/billing-requests/waive-fine",
            json={"member_id": member_user.id, "amount": 150, "reason": "Late return grace"},
        )
        response = await client.get("/api/v1/billing-requests")

    assert not any(row["id"] == created.json()["id"] for row in response.json())


async def test_waive_fine_for_missing_member_returns_404(admin_user):
    async with _client_as(admin_user) as client:
        response = await client.post(
            "/api/v1/billing-requests/waive-fine",
            json={"member_id": str(uuid.uuid4()), "amount": 100, "reason": "x"},
        )

    assert response.status_code == 404
