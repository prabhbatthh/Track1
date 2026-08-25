import os
import uuid
from datetime import UTC, datetime

os.environ["APP_ENV"] = "test"

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.core.constants import Role
from app.db.prisma import prisma
from app.main import create_app
from app.modules.members import repository as member_repository

os.environ.setdefault("DATABASE_URL", get_settings().database_url)

TEST_EMAIL_DOMAIN = "@it-head-test.example.com"


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
    await prisma.user.delete_many(where={"email": {"endswith": TEST_EMAIL_DOMAIN}})
    await prisma.disconnect()


@pytest_asyncio.fixture
async def it_head_user():
    return await _make_user(Role.IT_HEAD)


@pytest_asyncio.fixture
async def member_user():
    return await _make_user(Role.MEMBER)


def _client_as(user) -> AsyncClient:
    from app.api.deps import get_current_user

    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_dashboard_requires_authentication():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/it-head/dashboard")

    assert response.status_code == 401


async def test_member_cannot_view_dashboard(member_user):
    async with _client_as(member_user) as client:
        response = await client.get("/api/v1/it-head/dashboard")

    assert response.status_code == 403


def _assert_trend_shape(trend: dict) -> None:
    assert set(trend.keys()) == {"direction", "percent"}
    assert trend["direction"] in ("up", "down")
    assert trend["percent"] >= 0


async def test_it_head_can_view_dashboard(it_head_user):
    async with _client_as(it_head_user) as client:
        response = await client.get("/api/v1/it-head/dashboard")

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {
        "stats",
        "fee_status",
        "fee_collections",
        "issue_resolution",
        "system_activity",
        "system_activity_summary",
        "access_by_role",
        "alerts",
    }

    stats = body["stats"]
    assert set(stats.keys()) == {
        "active_members",
        "active_members_trend",
        "open_issues",
        "open_issues_delta",
        "pending_permissions",
        "pending_permissions_delta",
        "fees_outstanding",
        "fees_outstanding_trend",
        "late_fines_outstanding",
        "late_fines_outstanding_trend",
    }
    for key in ("active_members_trend", "fees_outstanding_trend", "late_fines_outstanding_trend"):
        _assert_trend_shape(stats[key])
    assert stats["active_members"] >= 1  # this test's own it_head_user + seeded members
    assert stats["fees_outstanding"] >= 0
    assert stats["late_fines_outstanding"] >= 0

    fee_status = body["fee_status"]
    assert isinstance(fee_status, list)
    for entry in fee_status:
        assert set(entry.keys()) == {"member_id", "member_name", "amount_due", "status", "due_date"}
        assert entry["status"] in ("paid", "due", "overdue")
        if entry["status"] == "paid":
            assert entry["amount_due"] == 0
        else:
            assert entry["amount_due"] > 0

    fee_collections = body["fee_collections"]
    assert len(fee_collections) == 6
    for month in fee_collections:
        assert set(month.keys()) == {"month", "collected", "pending"}
        assert month["collected"] >= 0
        assert month["pending"] >= 0
    # Most recent bucket is the current month, and every "pending" figure it reports is
    # the same live calculation fees_outstanding reports for right now.
    assert fee_collections[-1]["pending"] == stats["fees_outstanding"]

    issue_resolution = body["issue_resolution"]
    assert len(issue_resolution) == 6
    for month in issue_resolution:
        assert set(month.keys()) == {"month", "resolved", "open", "other"}

    system_activity = body["system_activity"]
    assert len(system_activity) == 7
    for day in system_activity:
        assert set(day.keys()) == {"date", "logins", "access_changes", "permissions_updated"}
        assert day["logins"] >= 0
    assert system_activity[-1]["date"] == datetime.now(UTC).date().isoformat()

    summary = body["system_activity_summary"]
    assert set(summary.keys()) == {
        "logins_total",
        "logins_trend",
        "access_changes_total",
        "access_changes_trend",
        "permissions_updated_total",
        "permissions_updated_trend",
    }
    assert summary["logins_total"] == sum(d["logins"] for d in system_activity)
    for key in ("logins_trend", "access_changes_trend", "permissions_updated_trend"):
        _assert_trend_shape(summary[key])

    access_by_role = body["access_by_role"]
    assert isinstance(access_by_role, list)
    roles_seen = {entry["role"] for entry in access_by_role}
    assert Role.MEMBER.value in roles_seen
    assert Role.IT_HEAD.value in roles_seen  # this test's own it_head_user
    total_percent = sum(entry["percent"] for entry in access_by_role)
    assert 95 <= total_percent <= 105  # rounding per-entry can drift a couple points

    alerts = body["alerts"]
    assert len(alerts) == 4
    for alert in alerts:
        assert set(alert.keys()) == {"id", "severity", "title", "description"}
        assert alert["severity"] in ("critical", "warning", "info", "success")
