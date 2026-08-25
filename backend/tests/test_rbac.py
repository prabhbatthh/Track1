"""
Cross-cutting role-guard matrix — one place that proves require_role() actually
gates a representative endpoint per role tier, instead of relying on the (real,
but scattered) 403 case buried in each feature's own test file.

Each row: (method, path, a role that should pass the guard, a role that shouldn't).
"""

import os
import uuid

os.environ["APP_ENV"] = "test"

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.constants import Role
from app.db.prisma import prisma
from app.main import create_app
from app.modules.members import repository as member_repository

os.environ.setdefault("DATABASE_URL", get_settings().database_url)

TEST_EMAIL_DOMAIN = "@rbac-test.example.com"

ENDPOINTS = [
    ("GET", "/api/v1/admin/dashboard", Role.ADMIN, Role.MEMBER),
    ("GET", "/api/v1/manager/dashboard", Role.MANAGER, Role.MEMBER),
    ("GET", "/api/v1/it-head/dashboard", Role.IT_HEAD, Role.MEMBER),
    ("GET", "/api/v1/guardian/children", Role.GUARDIAN, Role.MEMBER),
    ("GET", "/api/v1/book-records", Role.IT_HEAD, Role.MANAGER),
    ("GET", "/api/v1/coupons", Role.ADMIN, Role.MANAGER),
    ("GET", "/api/v1/members", Role.ADMIN, Role.MEMBER),
]
ENDPOINT_IDS = [path for _, path, _, _ in ENDPOINTS]


def _unique_email() -> str:
    return f"{uuid.uuid4().hex}{TEST_EMAIL_DOMAIN}"


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    await prisma.connect()
    yield
    # Audit entries reference the actor with no cascade, so they have to go
    # before the users do (role changes, bans and fine settlement all log now).
    await prisma.auditlogentry.delete_many(
        where={"actor": {"email": {"endswith": TEST_EMAIL_DOMAIN}}}
    )
    await prisma.user.delete_many(where={"email": {"endswith": TEST_EMAIL_DOMAIN}})
    await prisma.disconnect()


async def _make_user(role_name: str):
    role = await member_repository.upsert_role(role_name)
    return await member_repository.create_member(
        email=_unique_email(),
        password_hash=None,
        full_name=f"RBAC {role_name.title()}",
        phone=None,
        avatar_url=None,
        role_id=role.id,
    )


def _client_as(user) -> AsyncClient:
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _anon_client() -> AsyncClient:
    app = create_app()
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.parametrize("method,path,allowed_role,denied_role", ENDPOINTS, ids=ENDPOINT_IDS)
async def test_requires_authentication(method, path, allowed_role, denied_role):
    """Test Case 1: Requires Authentication"""

    async with _anon_client() as client:
        response = await client.request(method, path)

    print(f"\n{method} {path} Response:", response.status_code, response.text)

    assert response.status_code == 401


@pytest.mark.parametrize("method,path,allowed_role,denied_role", ENDPOINTS, ids=ENDPOINT_IDS)
async def test_rejects_the_wrong_role(method, path, allowed_role, denied_role):
    """Test Case 2: Rejects the Wrong Role"""

    user = await _make_user(denied_role)
    async with _client_as(user) as client:
        response = await client.request(method, path)

    print(f"\n{method} {path} Response:", response.status_code, response.text)

    assert response.status_code == 403


@pytest.mark.parametrize("method,path,allowed_role,denied_role", ENDPOINTS, ids=ENDPOINT_IDS)
async def test_allows_the_correct_role(method, path, allowed_role, denied_role):
    """Test Case 3: Allows the Correct Role"""

    user = await _make_user(allowed_role)
    async with _client_as(user) as client:
        response = await client.request(method, path)

    print(f"\n{method} {path} Response:", response.status_code, response.text)

    assert response.status_code not in (401, 403)
