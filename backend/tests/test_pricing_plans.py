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

TEST_EMAIL_DOMAIN = "@pricing-plans-test.example.com"
TEST_PLAN_ID_PREFIX = "tp-"


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
    await prisma.auditlogentry.delete_many(where={"actor": domain_filter})
    await prisma.user.delete_many(where=domain_filter)
    await prisma.pricingplan.delete_many(where={"planId": {"startswith": TEST_PLAN_ID_PREFIX}})
    await prisma.disconnect()


@pytest_asyncio.fixture
async def admin_user():
    return await _make_user(Role.ADMIN)


@pytest_asyncio.fixture
async def member_user():
    return await _make_user(Role.MEMBER)


@pytest_asyncio.fixture
async def test_plan():
    plan = await prisma.pricingplan.create(
        data={
            "planId": f"{TEST_PLAN_ID_PREFIX}{uuid.uuid4().hex[:6]}",
            "months": 1,
            "price": 100,
            "savePercent": 0,
        }
    )
    yield plan
    await prisma.pricingplan.delete(where={"id": plan.id})


def _client_as(user) -> AsyncClient:
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _anon_client() -> AsyncClient:
    app = create_app()
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_list_plans_is_public(test_plan):
    """Test Case 1: List Plans Success (public)"""

    async with _anon_client() as client:
        response = await client.get("/api/v1/pricing-plans")

    print("\nList Plans Response:", response.status_code, response.text)

    assert response.status_code == 200
    body = response.json()
    assert any(plan["id"] == test_plan.id for plan in body)


async def test_list_plans_is_ordered_by_months_ascending(test_plan):
    """Test Case 2: List Plans Ordered by Months"""

    async with _anon_client() as client:
        response = await client.get("/api/v1/pricing-plans")

    months = [plan["months"] for plan in response.json()]

    print("\nList Plans Response:", response.status_code, months)

    assert months == sorted(months)


async def test_update_plan_requires_authentication(test_plan):
    """Test Case 3: Update Plan Requires Authentication"""

    async with _anon_client() as client:
        response = await client.patch(
            f"/api/v1/pricing-plans/{test_plan.id}", json={"price": 200, "save_percent": 5}
        )

    print("\nUpdate Plan Response:", response.status_code, response.text)

    assert response.status_code == 401


async def test_member_cannot_update_a_plan(member_user, test_plan):
    """Test Case 4: Update Plan Forbidden (member role)"""

    async with _client_as(member_user) as client:
        response = await client.patch(
            f"/api/v1/pricing-plans/{test_plan.id}", json={"price": 200, "save_percent": 5}
        )

    print("\nUpdate Plan Response:", response.status_code, response.text)

    assert response.status_code == 403


async def test_admin_can_update_a_plan(admin_user, test_plan):
    async with _client_as(admin_user) as client:
        response = await client.patch(
            f"/api/v1/pricing-plans/{test_plan.id}", json={"price": 799, "save_percent": 15}
        )

    assert response.status_code == 200
    body = response.json()
    assert body["price"] == 799
    assert body["save_percent"] == 15
    assert body["plan_id"] == test_plan.planId


async def test_update_plan_rejects_non_positive_price(admin_user, test_plan):
    async with _client_as(admin_user) as client:
        response = await client.patch(
            f"/api/v1/pricing-plans/{test_plan.id}", json={"price": 0, "save_percent": 5}
        )
    assert response.status_code == 422


async def test_update_plan_rejects_out_of_range_save_percent(admin_user, test_plan):
    async with _client_as(admin_user) as client:
        response = await client.patch(
            f"/api/v1/pricing-plans/{test_plan.id}", json={"price": 500, "save_percent": 101}
        )
    assert response.status_code == 422


async def test_update_unknown_plan_returns_404(admin_user):
    async with _client_as(admin_user) as client:
        response = await client.patch(
            f"/api/v1/pricing-plans/{uuid.uuid4()}", json={"price": 500, "save_percent": 5}
        )
    assert response.status_code == 404
