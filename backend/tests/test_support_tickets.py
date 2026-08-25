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

TEST_EMAIL_DOMAIN = "@support-tickets-test.example.com"


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
    await prisma.supportticket.delete_many(where={"raisedBy": domain_filter})
    await prisma.user.delete_many(where=domain_filter)
    await prisma.disconnect()


@pytest_asyncio.fixture
async def member_user():
    return await _make_user(Role.MEMBER)


@pytest_asyncio.fixture
async def guardian_user():
    return await _make_user(Role.GUARDIAN)


@pytest_asyncio.fixture
async def admin_user():
    return await _make_user(Role.ADMIN)


@pytest_asyncio.fixture
async def manager_user():
    return await _make_user(Role.MANAGER)


@pytest_asyncio.fixture
async def it_head_user():
    return await _make_user(Role.IT_HEAD)


def _client_as(user) -> AsyncClient:
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _anon_client() -> AsyncClient:
    app = create_app()
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _create_ticket(user, **overrides) -> dict:
    payload = {"category": "payment", "description": "My payment failed but I was charged."}
    payload.update(overrides)
    async with _client_as(user) as client:
        response = await client.post("/api/v1/support-tickets", json=payload)
    return response


async def test_create_ticket_requires_authentication():
    async with _anon_client() as client:
        response = await client.post(
            "/api/v1/support-tickets",
            json={"category": "payment", "description": "x" * 15},
        )
    assert response.status_code == 401


async def test_staff_cannot_raise_a_ticket(admin_user, manager_user, it_head_user):
    for user in (admin_user, manager_user, it_head_user):
        response = await _create_ticket(user)
        assert response.status_code == 403


async def test_member_can_raise_a_ticket_with_a_member_category(member_user):
    response = await _create_ticket(
        member_user, category="seat_booking", description="My seat booking keeps failing."
    )
    assert response.status_code == 201
    body = response.json()
    assert body["category"] == "seat_booking"
    assert body["status"] == "open"
    assert body["raised_by_id"] == member_user.id
    assert body["raised_by_role"] == "member"


async def test_member_cannot_use_a_guardian_only_category(member_user):
    response = await _create_ticket(
        member_user, category="attendance", description="Attendance issue for my child."
    )
    assert response.status_code == 422


async def test_guardian_can_raise_a_ticket_with_a_guardian_category(guardian_user):
    response = await _create_ticket(
        guardian_user, category="attendance", description="My child wasn't marked present."
    )
    assert response.status_code == 201
    assert response.json()["category"] == "attendance"


async def test_guardian_cannot_use_a_member_only_category(guardian_user):
    response = await _create_ticket(
        guardian_user, category="book_reservation", description="Book reservation problem here."
    )
    assert response.status_code == 422


async def test_description_too_short_is_rejected(member_user):
    response = await _create_ticket(member_user, description="short")
    assert response.status_code == 422


async def test_description_too_long_is_rejected(member_user):
    response = await _create_ticket(member_user, description="x" * 501)
    assert response.status_code == 422


async def test_member_sees_own_ticket_in_history(member_user):
    created = await _create_ticket(member_user)
    async with _client_as(member_user) as client:
        response = await client.get("/api/v1/support-tickets/me")

    assert response.status_code == 200
    assert any(t["id"] == created.json()["id"] for t in response.json())


async def test_list_all_tickets_requires_staff_role(member_user, guardian_user):
    for user in (member_user, guardian_user):
        async with _client_as(user) as client:
            response = await client.get("/api/v1/support-tickets")
        assert response.status_code == 403


async def test_staff_can_list_all_tickets(admin_user, manager_user, it_head_user, member_user):
    created = await _create_ticket(member_user)

    for staff in (admin_user, manager_user, it_head_user):
        async with _client_as(staff) as client:
            response = await client.get("/api/v1/support-tickets")
        assert response.status_code == 200
        assert any(t["id"] == created.json()["id"] for t in response.json())


async def test_creating_a_ticket_notifies_staff(
    admin_user, manager_user, it_head_user, member_user
):
    await _create_ticket(member_user, description="Seat booking keeps double-booking my slot.")

    for staff in (admin_user, manager_user, it_head_user):
        async with _client_as(staff) as client:
            response = await client.get("/api/v1/notifications/me")
        assert any(
            n["type"] == "support-ticket" and member_user.fullName in n["message"]
            for n in response.json()
        )


async def test_staff_can_resolve_an_open_ticket(admin_user, member_user):
    created = await _create_ticket(member_user)

    async with _client_as(admin_user) as client:
        response = await client.post(
            f"/api/v1/support-tickets/{created.json()['id']}/resolve",
            json={"resolution_note": "Refunded the duplicate charge."},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "resolved"
    assert body["resolution_note"] == "Refunded the duplicate charge."
    assert body["resolved_by_name"] == admin_user.fullName


async def test_resolving_an_already_resolved_ticket_conflicts(admin_user, member_user):
    created = await _create_ticket(member_user)
    ticket_id = created.json()["id"]

    async with _client_as(admin_user) as client:
        first = await client.post(
            f"/api/v1/support-tickets/{ticket_id}/resolve", json={"resolution_note": "Fixed."}
        )
        second = await client.post(
            f"/api/v1/support-tickets/{ticket_id}/resolve", json={"resolution_note": "Fixed again."}
        )

    assert first.status_code == 200
    assert second.status_code == 409


async def test_resolving_notifies_the_raiser(admin_user, member_user):
    created = await _create_ticket(member_user)

    async with _client_as(admin_user) as client:
        await client.post(
            f"/api/v1/support-tickets/{created.json()['id']}/resolve",
            json={"resolution_note": "Fixed."},
        )

    async with _client_as(member_user) as client:
        response = await client.get("/api/v1/notifications/me")

    assert any(n["type"] == "support-ticket-resolved" for n in response.json())


async def test_raiser_can_confirm_a_resolved_ticket(admin_user, member_user):
    created = await _create_ticket(member_user)
    ticket_id = created.json()["id"]

    async with _client_as(admin_user) as client:
        await client.post(
            f"/api/v1/support-tickets/{ticket_id}/resolve", json={"resolution_note": "Fixed."}
        )

    async with _client_as(member_user) as client:
        response = await client.post(f"/api/v1/support-tickets/{ticket_id}/confirm")

    assert response.status_code == 200
    assert response.json()["status"] == "closed"


async def test_non_raiser_cannot_confirm_a_ticket(admin_user, member_user, guardian_user):
    created = await _create_ticket(member_user)
    ticket_id = created.json()["id"]

    async with _client_as(admin_user) as client:
        await client.post(
            f"/api/v1/support-tickets/{ticket_id}/resolve", json={"resolution_note": "Fixed."}
        )

    async with _client_as(guardian_user) as client:
        response = await client.post(f"/api/v1/support-tickets/{ticket_id}/confirm")

    assert response.status_code == 403


async def test_confirming_a_ticket_that_is_not_resolved_conflicts(member_user):
    created = await _create_ticket(member_user)

    async with _client_as(member_user) as client:
        response = await client.post(f"/api/v1/support-tickets/{created.json()['id']}/confirm")

    assert response.status_code == 409


async def test_raiser_can_reject_a_resolution_and_it_reopens(admin_user, member_user):
    created = await _create_ticket(member_user)
    ticket_id = created.json()["id"]

    async with _client_as(admin_user) as client:
        await client.post(
            f"/api/v1/support-tickets/{ticket_id}/resolve", json={"resolution_note": "Fixed."}
        )

    async with _client_as(member_user) as client:
        response = await client.post(f"/api/v1/support-tickets/{ticket_id}/reopen")

    assert response.status_code == 200
    assert response.json()["status"] == "open"

    async with _client_as(admin_user) as client:
        notifications = await client.get("/api/v1/notifications/me")
    assert any(n["type"] == "support-ticket-reopened" for n in notifications.json())
