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

TEST_EMAIL_DOMAIN = "@library-reviews-test.example.com"


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
    await prisma.auditlogentry.delete_many(where={"actor": domain_filter})
    await prisma.libraryreview.delete_many(where={"member": domain_filter})
    await prisma.user.delete_many(where=domain_filter)
    await prisma.disconnect()


@pytest_asyncio.fixture
async def member_user():
    return await _make_user(Role.MEMBER)


@pytest_asyncio.fixture
async def admin_user():
    return await _make_user(Role.ADMIN)


def _client_as(user) -> AsyncClient:
    from app.api.deps import get_current_user

    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_member_submits_review_pending_and_hidden_from_public_list(member_user):
    async with _client_as(member_user) as client:
        create = await client.post(
            "/api/v1/library-reviews", json={"rating": 5, "comment": "Loved the seat booking!"}
        )
        assert create.status_code == 201
        assert create.json()["status"] == "pending"

        approved = await client.get("/api/v1/library-reviews/approved")
        assert approved.status_code == 200
        assert create.json()["id"] not in [r["id"] for r in approved.json()]


async def test_member_cannot_list_pending_or_decide(member_user):
    async with _client_as(member_user) as client:
        listed = await client.get("/api/v1/library-reviews")
        assert listed.status_code == 403

        create = await client.post(
            "/api/v1/library-reviews", json={"rating": 4, "comment": "Great quiet study rooms."}
        )
        review_id = create.json()["id"]
        decide = await client.post(f"/api/v1/library-reviews/{review_id}/approve")
        assert decide.status_code == 403


async def test_admin_approve_makes_review_public(member_user, admin_user):
    async with _client_as(member_user) as client:
        create = await client.post(
            "/api/v1/library-reviews", json={"rating": 5, "comment": "Fantastic collection."}
        )
    review_id = create.json()["id"]

    async with _client_as(admin_user) as client:
        pending = await client.get("/api/v1/library-reviews")
        assert review_id in [r["id"] for r in pending.json()]

        approve = await client.post(f"/api/v1/library-reviews/{review_id}/approve")
        assert approve.status_code == 200
        assert approve.json()["status"] == "approved"

        # Already decided — deciding again conflicts rather than double-processing.
        again = await client.post(f"/api/v1/library-reviews/{review_id}/approve")
        assert again.status_code == 409

    async with _client_as(member_user) as client:
        approved = await client.get("/api/v1/library-reviews/approved")
        assert review_id in [r["id"] for r in approved.json()]


async def test_admin_reject_keeps_review_off_public_list(member_user, admin_user):
    async with _client_as(member_user) as client:
        create = await client.post(
            "/api/v1/library-reviews", json={"rating": 1, "comment": "Not happy with the noise."}
        )
    review_id = create.json()["id"]

    async with _client_as(admin_user) as client:
        reject = await client.post(f"/api/v1/library-reviews/{review_id}/reject")
        assert reject.status_code == 200
        assert reject.json()["status"] == "rejected"

    async with _client_as(member_user) as client:
        approved = await client.get("/api/v1/library-reviews/approved")
        assert review_id not in [r["id"] for r in approved.json()]
