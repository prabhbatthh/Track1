import os
from unittest.mock import AsyncMock, patch
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

os.environ["APP_ENV"] = "test"

from app.core.config import get_settings
from app.core.security import create_access_token
from app.db.prisma import prisma
from app.main import create_app

os.environ.setdefault("DATABASE_URL", get_settings().database_url)

app = create_app()


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    """Ensure Prisma database is connected during tests module."""
    if not prisma.is_connected():
        await prisma.connect()
    yield
    if prisma.is_connected():
        await prisma.disconnect()


async def get_test_user_and_token():
    """Find or create an active test user and return user object & bearer token."""
    user = await prisma.user.find_first(where={"deletedAt": None, "isActive": True})
    if not user:
        role = await prisma.role.find_first(where={"name": "member"})
        user = await prisma.user.create(
            data={
                "email": "catalog_test_user@example.com",
                "fullName": "Catalog Test User",
                "passwordHash": "hashed_password",
                "roleId": role.id if role else "member_role_id",
                "isActive": True,
            }
        )
    token = create_access_token(user.id)
    return user, token


@pytest.mark.asyncio
async def test_get_agent_catalog_unauthenticated():
    """Test public GET /api/v1/agent/catalog returns machine-readable products for AI agents."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/agent/catalog")
        assert response.status_code == 200
        data = response.json()

        assert "merchant" in data
        assert data["merchant"]["name"] == "Community Library Platform"
        assert "membership_plans" in data
        assert len(data["membership_plans"]) >= 4
        assert "catalog" in data
        assert "active_coupons" in data
        assert "meta" in data
        assert data["meta"]["schema_version"] == "1.0-agentic"


@pytest.mark.asyncio
async def test_get_agent_catalog_authenticated():
    """Test authenticated member query to GET /api/v1/agent/catalog returns catalog items."""
    user, token = await get_test_user_and_token()
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/agent/catalog", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data["membership_plans"]) >= 4


@pytest.mark.asyncio
async def test_get_agent_catalog_prices_and_durations():
    """Test that catalog prices and durations match server-authoritative database plans."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/agent/catalog")
        assert response.status_code == 200
        data = response.json()

        plans = data["membership_plans"]
        months_map = {item["months"]: item for item in plans}

        assert 1 in months_map
        assert 3 in months_map
        assert 6 in months_map
        assert 12 in months_map

        assert months_map[1]["price"] == 999
        assert months_map[3]["price"] == 2697
        assert months_map[6]["price"] == 4915
        assert months_map[12]["price"] == 8991


@pytest.mark.asyncio
async def test_get_agent_catalog_item_structure_and_no_leakage():
    """Test that catalog items contain structured AI buyer metadata without internal secrets."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/agent/catalog")
        assert response.status_code == 200
        data = response.json()

        first_plan = data["membership_plans"][0]

        # Verify structured metadata required for AI shopping agent
        assert "id" in first_plan
        assert "plan_id" in first_plan
        assert "name" in first_plan
        assert "description" in first_plan
        assert "price" in first_plan
        assert first_plan["currency"] == "INR"
        assert "months" in first_plan
        assert "eligibility" in first_plan
        assert first_plan["eligibility"]["requires_auth"] is True
        assert "benefits" in first_plan
        assert isinstance(first_plan["benefits"], list)
        assert "purchase_action" in first_plan
        assert first_plan["purchase_action"]["method"] == "POST"

        # Verify NO private/internal data leaks
        response_text = response.text
        assert "passwordHash" not in response_text
        assert "secret" not in response_text
        assert "user_id" not in response_text
        assert "deletedAt" not in response_text


@pytest.mark.asyncio
async def test_get_agent_catalog_empty_catalog():
    """Test that empty database catalog returns 200 OK with total_plans: 0 and empty lists."""
    mock_plan_actions = AsyncMock()
    mock_plan_actions.find_many.return_value = []

    mock_book_actions = AsyncMock()
    mock_book_actions.find_many.return_value = []
    mock_book_actions.count.return_value = 0

    mock_coupon_actions = AsyncMock()
    mock_coupon_actions.find_many.return_value = []

    with patch("app.modules.agent.service.prisma.pricingplan", mock_plan_actions), \
         patch("app.modules.agent.service.prisma.book", mock_book_actions), \
         patch("app.modules.agent.service.prisma.coupon", mock_coupon_actions):

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/agent/catalog")
            assert response.status_code == 200
            data = response.json()
            assert data["meta"]["total_plans"] == 0
            assert data["membership_plans"] == []


@pytest.mark.asyncio
async def test_get_agent_catalog_read_only():
    """Test that GET /api/v1/agent/catalog is strictly read-only and creates zero database orders or logs."""
    payment_count_before = await prisma.payment.count()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/agent/catalog")
        assert response.status_code == 200

    payment_count_after = await prisma.payment.count()
    assert payment_count_after == payment_count_before
