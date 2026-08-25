import os
import pytest
from httpx import ASGITransport, AsyncClient

os.environ["APP_ENV"] = "test"

from app.db.prisma import prisma
from app.main import create_app

app = create_app()


@pytest.mark.asyncio
async def test_get_agent_catalog():
    """Test fetching machine-readable agent catalog."""
    if not prisma.is_connected():
        await prisma.connect()
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/api/v1/agent/catalog")
            assert response.status_code == 200
            data = response.json()

            assert "merchant" in data
            assert "membership_plans" in data
            assert "catalog" in data
            assert "active_coupons" in data
            assert "meta" in data

            assert data["merchant"]["name"] == "Community Library Platform"
            assert data["meta"]["schema_version"] == "1.0-agentic"
            assert isinstance(data["membership_plans"], list)
            assert isinstance(data["catalog"], list)
    finally:
        if prisma.is_connected():
            await prisma.disconnect()
