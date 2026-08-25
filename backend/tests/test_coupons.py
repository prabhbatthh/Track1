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

TEST_EMAIL_DOMAIN = "@coupons-test.example.com"


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
    await prisma.coupon.delete_many(where={"createdBy": domain_filter})
    await prisma.user.delete_many(where=domain_filter)
    await prisma.disconnect()


@pytest_asyncio.fixture
async def admin_user():
    return await _make_user(Role.ADMIN)


@pytest_asyncio.fixture
async def member_user():
    return await _make_user(Role.MEMBER)


def _client_as(user) -> AsyncClient:
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _anon_client() -> AsyncClient:
    app = create_app()
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _generate_coupon(admin_user, discount_percent=20, max_uses=2) -> dict:
    async with _client_as(admin_user) as client:
        response = await client.post(
            "/api/v1/coupons",
            json={"discount_percent": discount_percent, "max_uses": max_uses},
        )
    return response.json()


async def test_generate_coupon_requires_authentication():
    async with _anon_client() as client:
        response = await client.post(
            "/api/v1/coupons", json={"discount_percent": 10, "max_uses": 5}
        )
    assert response.status_code == 401


async def test_member_cannot_generate_a_coupon(member_user):
    async with _client_as(member_user) as client:
        response = await client.post(
            "/api/v1/coupons", json={"discount_percent": 10, "max_uses": 5}
        )
    assert response.status_code == 403


async def test_admin_can_generate_a_coupon(admin_user):
    coupon = await _generate_coupon(admin_user, discount_percent=15, max_uses=3)

    assert coupon["discount_percent"] == 15
    assert coupon["max_uses"] == 3
    assert coupon["uses_count"] == 0
    assert len(coupon["code"]) == 8


async def test_generate_coupon_rejects_out_of_range_discount(admin_user):
    async with _client_as(admin_user) as client:
        response = await client.post("/api/v1/coupons", json={"discount_percent": 0, "max_uses": 5})
    assert response.status_code == 422

    async with _client_as(admin_user) as client:
        response = await client.post(
            "/api/v1/coupons", json={"discount_percent": 101, "max_uses": 5}
        )
    assert response.status_code == 422


async def test_generate_coupon_rejects_non_positive_max_uses(admin_user):
    async with _client_as(admin_user) as client:
        response = await client.post(
            "/api/v1/coupons", json={"discount_percent": 10, "max_uses": 0}
        )
    assert response.status_code == 422


async def test_member_cannot_list_coupons(member_user):
    async with _client_as(member_user) as client:
        response = await client.get("/api/v1/coupons")
    assert response.status_code == 403


async def test_admin_sees_generated_coupons_in_the_list(admin_user):
    coupon = await _generate_coupon(admin_user)

    async with _client_as(admin_user) as client:
        response = await client.get("/api/v1/coupons")

    assert response.status_code == 200
    assert any(c["code"] == coupon["code"] for c in response.json())


async def test_validate_coupon_requires_authentication():
    async with _anon_client() as client:
        response = await client.get("/api/v1/coupons/ANYCODE/validate")
    assert response.status_code == 401


async def test_validate_unknown_coupon_returns_404(member_user):
    async with _client_as(member_user) as client:
        response = await client.get("/api/v1/coupons/DOESNOTEXIST/validate")
    assert response.status_code == 404


async def test_validate_a_valid_coupon_succeeds_without_consuming_a_use(admin_user, member_user):
    coupon = await _generate_coupon(admin_user, discount_percent=25, max_uses=1)

    async with _client_as(member_user) as client:
        response = await client.get(f"/api/v1/coupons/{coupon['code']}/validate")

    assert response.status_code == 200
    assert response.json()["discount_percent"] == 25

    async with _client_as(admin_user) as client:
        listed = await client.get("/api/v1/coupons")
    updated = next(c for c in listed.json() if c["code"] == coupon["code"])
    assert updated["uses_count"] == 0


async def test_validate_is_case_insensitive(admin_user, member_user):
    coupon = await _generate_coupon(admin_user)

    async with _client_as(member_user) as client:
        response = await client.get(f"/api/v1/coupons/{coupon['code'].lower()}/validate")

    assert response.status_code == 200
