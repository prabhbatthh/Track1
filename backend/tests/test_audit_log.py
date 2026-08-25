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

TEST_EMAIL_DOMAIN = "@audit-log-test.example.com"


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
    await prisma.expense.delete_many(where={"loggedBy": domain_filter})
    await prisma.billingrequest.delete_many(where={"member": domain_filter})
    await prisma.user.delete_many(where=domain_filter)
    await prisma.disconnect()


@pytest_asyncio.fixture
async def admin_user():
    return await _make_user(Role.ADMIN)


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


async def _get_audit_log(user) -> list[dict]:
    async with _client_as(user) as client:
        response = await client.get("/api/v1/admin/audit-log")
    assert response.status_code == 200
    return response.json()["items"]


def _find(entries: list[dict], action: str, amount: int) -> dict:
    return next(e for e in entries if e["action"] == action and e["params"]["amount"] == amount)


async def _file_billing_request(manager_user, member_user, **overrides) -> dict:
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


async def test_audit_log_requires_authentication():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/admin/audit-log")
    assert response.status_code == 401


async def test_audit_log_forbidden_for_member(member_user):
    async with _client_as(member_user) as client:
        response = await client.get("/api/v1/admin/audit-log")
    assert response.status_code == 403


async def test_logging_an_expense_creates_an_entry(admin_user):
    async with _client_as(admin_user) as client:
        response = await client.post(
            "/api/v1/admin/expenses", json={"category": "marketing", "amount": 120}
        )
    assert response.status_code == 201

    entries = await _get_audit_log(admin_user)
    entry = _find(entries, "expenseApproved", 120)
    assert entry["params"]["category"] == "marketing"
    assert entry["actor_id"] == admin_user.id
    assert entry["actor_name"] == admin_user.fullName
    assert entry["actor_role"] == "admin"


async def test_approving_a_refund_request_creates_a_refund_issued_entry(
    admin_user, manager_user, member_user
):
    created = await _file_billing_request(manager_user, member_user, type="refund", amount=300)

    async with _client_as(admin_user) as client:
        response = await client.post(f"/api/v1/billing-requests/{created['id']}/approve")
    assert response.status_code == 200

    entries = await _get_audit_log(admin_user)
    entry = _find(entries, "refundIssued", 300)
    assert entry["params"]["memberName"] == member_user.fullName
    assert entry["actor_id"] == admin_user.id


async def test_rejecting_a_fee_waiver_request_creates_a_rejected_entry(
    admin_user, manager_user, member_user
):
    created = await _file_billing_request(manager_user, member_user, type="fee_waiver", amount=20)

    async with _client_as(admin_user) as client:
        response = await client.post(f"/api/v1/billing-requests/{created['id']}/reject")
    assert response.status_code == 200

    entries = await _get_audit_log(admin_user)
    entry = _find(entries, "feeWaiverRejected", 20)
    assert entry["params"]["memberName"] == member_user.fullName


async def test_audit_log_paginates(admin_user):
    async with _client_as(admin_user) as client:
        await client.post("/api/v1/admin/expenses", json={"category": "utilities", "amount": 1})
        await client.post("/api/v1/admin/expenses", json={"category": "utilities", "amount": 2})
        response = await client.get("/api/v1/admin/audit-log?page=1&page_size=1")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 2
    assert body["page"] == 1
    assert body["page_size"] == 1
    assert len(body["items"]) == 1


async def test_audit_log_is_ordered_most_recent_first(admin_user):
    async with _client_as(admin_user) as client:
        await client.post("/api/v1/admin/expenses", json={"category": "utilities", "amount": 5})
        await client.post("/api/v1/admin/expenses", json={"category": "utilities", "amount": 6})

    entries = await _get_audit_log(admin_user)
    timestamps = [e["created_at"] for e in entries]
    assert timestamps == sorted(timestamps, reverse=True)
