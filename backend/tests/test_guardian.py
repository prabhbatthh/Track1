# pyright: reportAttributeAccessIssue=false
# pyright: reportGeneralTypeIssues=false
# pyright: reportOptionalMemberAccess=false

import os
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

os.environ["APP_ENV"] = "test"

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from prisma.models import User

from app.core.config import get_settings
from app.core.constants import Role
from app.core.security import hash_password
from app.db.prisma import prisma
from app.main import create_app
from app.modules.members import repository

os.environ.setdefault("DATABASE_URL", get_settings().database_url)

TEST_EMAIL_DOMAIN = "@guardian-test.example.com"


def _unique_email() -> str:
    return f"{uuid.uuid4().hex}{TEST_EMAIL_DOMAIN}"


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    db: Any = prisma
    await db.connect()
    yield
    domain_filter = {"email": {"endswith": TEST_EMAIL_DOMAIN}}
    await db.readingprogress.delete_many(where={"member": domain_filter})
    await db.guardianlink.delete_many(where={"member": domain_filter})
    await db.loan.delete_many(where={"member": domain_filter})
    await db.payment.delete_many(where={"user": domain_filter})
    await db.notification.delete_many(where={"user": domain_filter})
    await db.seatbooking.delete_many(where={"member": domain_filter})
    await db.seatnotifyrequest.delete_many(where={"member": domain_filter})
    await db.libraryvisit.delete_many(where={"member": domain_filter})
    await db.book.delete_many(where={"title": {"startswith": "Guardian Test Book"}})
    await db.user.delete_many(where=domain_filter)
    await db.disconnect()


@pytest_asyncio.fixture
async def client():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


async def _make_user(role_name: str) -> User:
    role = await repository.upsert_role(role_name)
    return await repository.create_member(
        email=_unique_email(),
        password_hash=hash_password("Password123!"),
        full_name=f"{role_name.title()} User",
        phone=None,
        avatar_url=None,
        role_id=role.id,
    )


async def _login(client: AsyncClient, user: User) -> str:
    response = await client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": "Password123!"}
    )
    return response.json()["access_token"]


async def test_link_child_to_guardian_success(client):
    """Test Case 1: Link Child to Guardian Success"""
    admin = await _make_user(Role.ADMIN)
    guardian = await _make_user(Role.GUARDIAN)
    member = await _make_user(Role.MEMBER)
    admin_token = await _login(client, admin)
    response = await client.post(
        "/api/v1/guardian/links",
        json={"guardian_id": guardian.id, "member_id": member.id},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    print("\nLink Child Response:", response.status_code, response.text)

    assert response.status_code == 201
    link = await prisma.guardianlink.find_first(where={"memberId": member.id})
    assert link is not None
    assert link.guardianId == guardian.id


async def test_member_cannot_have_two_guardians(client):
    """Test Case 2: Link Child Already Has a Guardian"""

    admin = await _make_user(Role.ADMIN)
    guardian_one = await _make_user(Role.GUARDIAN)
    guardian_two = await _make_user(Role.GUARDIAN)
    member = await _make_user(Role.MEMBER)
    admin_token = await _login(client, admin)
    headers = {"Authorization": f"Bearer {admin_token}"}

    first = await client.post(
        "/api/v1/guardian/links",
        json={"guardian_id": guardian_one.id, "member_id": member.id},
        headers=headers,
    )
    assert first.status_code == 201
    second = await client.post(
        "/api/v1/guardian/links",
        json={"guardian_id": guardian_two.id, "member_id": member.id},
        headers=headers,
    )
    print("\nLink Child Response:", second.status_code, second.text)
    assert second.status_code == 409


async def test_link_rejects_non_guardian_parent_role(client):
    admin = await _make_user(Role.ADMIN)
    non_guardian = await _make_user(Role.MEMBER)
    child = await _make_user(Role.MEMBER)
    admin_token = await _login(client, admin)

    response = await client.post(
        "/api/v1/guardian/links",
        json={"guardian_id": non_guardian.id, "member_id": child.id},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 422
    assert await prisma.guardianlink.find_first(where={"memberId": child.id}) is None


async def test_link_rejects_non_member_child_role(client):
    admin = await _make_user(Role.ADMIN)
    guardian = await _make_user(Role.GUARDIAN)
    staff_child = await _make_user(Role.MANAGER)
    admin_token = await _login(client, admin)

    response = await client.post(
        "/api/v1/guardian/links",
        json={"guardian_id": guardian.id, "member_id": staff_child.id},
        headers={"Authorization": f"Bearer {admin_token}"},
    )

    assert response.status_code == 422


async def test_link_rejects_inactive_guardian_or_child(client):
    admin = await _make_user(Role.ADMIN)
    guardian = await _make_user(Role.GUARDIAN)
    child = await _make_user(Role.MEMBER)
    admin_token = await _login(client, admin)
    await repository.update_member(guardian.id, {"isActive": False})

    guardian_response = await client.post(
        "/api/v1/guardian/links",
        json={"guardian_id": guardian.id, "member_id": child.id},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert guardian_response.status_code == 422

    await repository.update_member(guardian.id, {"isActive": True})
    await repository.update_member(child.id, {"isActive": False})
    child_response = await client.post(
        "/api/v1/guardian/links",
        json={"guardian_id": guardian.id, "member_id": child.id},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert child_response.status_code == 422


async def test_guardian_sees_linked_member_reading_progress(client):
    """Test Case 3: List Children Success"""
    admin = await _make_user(Role.ADMIN)
    guardian = await _make_user(Role.GUARDIAN)
    member = await _make_user(Role.MEMBER)
    admin_token = await _login(client, admin)
    await client.post(
        "/api/v1/guardian/links",
        json={"guardian_id": guardian.id, "member_id": member.id},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    book = await prisma.book.create(
        data={"title": "Guardian Test Book", "author": "Test Author", "category": "Fiction"}
    )
    member_token = await _login(client, member)
    await client.put(
        "/api/v1/members/me/reading-progress",
        json={"book_id": book.id, "status": "reading", "percent_complete": 40},
        headers={"Authorization": f"Bearer {member_token}"},
    )
    guardian_token = await _login(client, guardian)
    response = await client.get(
        "/api/v1/guardian/children", headers={"Authorization": f"Bearer {guardian_token}"}
    )
    print("\nList Children Response:", response.status_code, response.text)
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == member.id
    assert len(body[0]["currently_reading"]) == 1
    assert body[0]["currently_reading"][0]["book_title"] == "Guardian Test Book"
    assert body[0]["currently_reading"][0]["percent_complete"] == 40
    assert body[0]["completed"] == []


async def test_guardian_children_requires_guardian_role(client):
    """Test Case 4: List Children Requires Guardian Role"""

    member = await _make_user(Role.MEMBER)
    token = await _login(client, member)

    response = await client.get(
        "/api/v1/guardian/children", headers={"Authorization": f"Bearer {token}"}
    )

    print("\nList Children Response:", response.status_code, response.text)

    assert response.status_code == 403


async def _link(client, admin_token, guardian, member):
    await client.post(
        "/api/v1/guardian/links",
        json={"guardian_id": guardian.id, "member_id": member.id},
        headers={"Authorization": f"Bearer {admin_token}"},
    )


async def test_pay_child_fines_creates_cash_request_without_settling(client):
    admin = await _make_user(Role.ADMIN)
    guardian = await _make_user(Role.GUARDIAN)
    child = await _make_user(Role.MEMBER)
    manager = await _make_user(Role.MANAGER)
    admin_token = await _login(client, admin)
    await _link(client, admin_token, guardian, child)
    book = await prisma.book.create(
        data={"title": "Guardian Test Book Fines", "author": "A", "category": "Fiction"}
    )
    loan = await prisma.loan.create(
        data={
            "bookId": book.id,
            "memberId": child.id,
            "dueDate": datetime.now(UTC) - timedelta(days=3),
            "createdById": admin.id,
        }
    )
    guardian_token = await _login(client, guardian)
    children_before = await client.get(
        "/api/v1/guardian/children", headers={"Authorization": f"Bearer {guardian_token}"}
    )
    child_out = next(c for c in children_before.json() if c["id"] == child.id)
    assert child_out["outstanding_fine"] > 0
    assert child_out["fine_book_title"] == "Guardian Test Book Fines"
    response = await client.post(
        f"/api/v1/guardian/children/{child.id}/pay-fines",
        headers={"Authorization": f"Bearer {guardian_token}"},
    )
    print("\nPay Child Fines Response:", response.status_code, response.text)
    assert response.status_code == 204
    updated_loan = await prisma.loan.find_unique(where={"id": loan.id})
    assert updated_loan is not None
    assert updated_loan.finePaid is False
    assert await prisma.payment.find_first(where={"userId": child.id}) is None
    notification = await prisma.notification.find_first(
        where={"userId": manager.id, "type": "payment-pending"},
        order={"createdAt": "desc"},
    )
    assert notification is not None
    assert child.fullName in notification.message
    children_after = await client.get(
        "/api/v1/guardian/children", headers={"Authorization": f"Bearer {guardian_token}"}
    )
    child_out_after = next(c for c in children_after.json() if c["id"] == child.id)
    assert child_out_after["outstanding_fine"] == child_out["outstanding_fine"]


async def test_pay_child_fines_with_no_fines_returns_400(client):
    """Test Case 6: Pay Child Fines No Fines Owed"""

    admin = await _make_user(Role.ADMIN)
    guardian = await _make_user(Role.GUARDIAN)
    child = await _make_user(Role.MEMBER)
    admin_token = await _login(client, admin)
    await _link(client, admin_token, guardian, child)
    guardian_token = await _login(client, guardian)

    response = await client.post(
        f"/api/v1/guardian/children/{child.id}/pay-fines",
        headers={"Authorization": f"Bearer {guardian_token}"},
    )
    print("\nPay Child Fines Response:", response.status_code, response.text)

    assert response.status_code == 400


async def test_pay_child_fines_rejects_unlinked_child(client):
    """Test Case 7: Pay Child Fines Unlinked Child"""

    guardian = await _make_user(Role.GUARDIAN)
    stranger = await _make_user(Role.MEMBER)
    guardian_token = await _login(client, guardian)

    response = await client.post(
        f"/api/v1/guardian/children/{stranger.id}/pay-fines",
        headers={"Authorization": f"Bearer {guardian_token}"},
    )

    print("\nPay Child Fines Response:", response.status_code, response.text)

    assert response.status_code == 403


async def test_renew_child_subscription_creates_cash_request_without_membership(client):

    admin = await _make_user(Role.ADMIN)
    guardian = await _make_user(Role.GUARDIAN)
    child = await _make_user(Role.MEMBER)
    manager = await _make_user(Role.MANAGER)
    admin_token = await _login(client, admin)
    await _link(client, admin_token, guardian, child)
    guardian_token = await _login(client, guardian)
    response = await client.post(
        f"/api/v1/guardian/children/{child.id}/renew",
        headers={"Authorization": f"Bearer {guardian_token}"},
    )
    print("\nRenew Subscription Response:", response.status_code, response.text)
    assert response.status_code == 204
    payment = await prisma.payment.find_first(where={"userId": child.id, "planMonths": 1})
    assert payment is None
    plan = await prisma.pricingplan.find_unique(where={"planId": "1m"})
    assert plan is not None
    notification = await prisma.notification.find_first(
        where={"userId": manager.id, "type": "payment-pending"},
        order={"createdAt": "desc"},
    )
    assert notification is not None
    assert child.fullName in notification.message
    assert str(plan.price) in notification.message


async def test_book_seat_for_child(client):
    """Test Case 9: Book Seat for Child Success"""

    admin = await _make_user(Role.ADMIN)
    guardian = await _make_user(Role.GUARDIAN)
    child = await _make_user(Role.MEMBER)
    admin_token = await _login(client, admin)
    await _link(client, admin_token, guardian, child)
    guardian_token = await _login(client, guardian)

    tomorrow = (datetime.now(UTC) + timedelta(days=1)).date()
    response = await client.post(
        f"/api/v1/guardian/children/{child.id}/seat-bookings",
        json={"seat_label": "A1", "date": tomorrow.isoformat(), "hour": 10},
        headers={"Authorization": f"Bearer {guardian_token}"},
    )

    print("\nBook Seat Response:", response.status_code, response.text)

    assert response.status_code == 201
    booking = await prisma.seatbooking.find_first(where={"memberId": child.id})
    assert booking is not None
    assert booking.seatLabel == "A1"


async def test_guardian_sees_seat_booked_for_child_persist_across_login_session(client):
    """Test guardian child seat booking persistence and identification across sessions."""
    admin = await _make_user(Role.ADMIN)
    guardian = await _make_user(Role.GUARDIAN)
    child = await _make_user(Role.MEMBER)
    other_member = await _make_user(Role.MEMBER)

    admin_token = await _login(client, admin)
    await _link(client, admin_token, guardian, child)

    guardian_token1 = await _login(client, guardian)
    tomorrow = (datetime.now(UTC) + timedelta(days=1)).date()

    # Guardian books seat D1 for child
    booked_res = await client.post(
        f"/api/v1/guardian/children/{child.id}/seat-bookings",
        json={"seat_label": "D1", "date": tomorrow.isoformat(), "hour": 11},
        headers={"Authorization": f"Bearer {guardian_token1}"},
    )
    assert booked_res.status_code == 201
    booking_id = booked_res.json()["id"]

    # Guardian logs out / simulates new session by logging in again
    guardian_token2 = await _login(client, guardian)

    # Schedule viewed by Guardian after new login session
    schedule_res = await client.get(
        "/api/v1/seat-booking/schedule",
        params={"date": tomorrow.isoformat(), "hour": 11},
        headers={"Authorization": f"Bearer {guardian_token2}"},
    )
    assert schedule_res.status_code == 200
    seats = schedule_res.json()["seats"]
    seat_d1 = next(s for s in seats if s["seat_label"] == "D1")
    assert seat_d1["status"] == "booked_for_child"
    assert seat_d1["booked_for_child_id"] == child.id
    assert seat_d1["booked_for_child_name"] == child.fullName
    assert seat_d1["booking_id"] == booking_id

    # Schedule viewed by another member (non-guardian)
    other_token = await _login(client, other_member)
    other_schedule = await client.get(
        "/api/v1/seat-booking/schedule",
        params={"date": tomorrow.isoformat(), "hour": 11},
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert other_schedule.status_code == 200
    other_seat_d1 = next(s for s in other_schedule.json()["seats"] if s["seat_label"] == "D1")
    assert other_seat_d1["status"] == "reserved"
    assert other_seat_d1["booked_for_child_id"] is None

    # Guardian cancels child's booking
    cancel_res = await client.delete(
        f"/api/v1/seat-booking/{booking_id}",
        headers={"Authorization": f"Bearer {guardian_token2}"},
    )
    assert cancel_res.status_code == 204

    # Verify seat D1 is available again
    freed_schedule = await client.get(
        "/api/v1/seat-booking/schedule",
        params={"date": tomorrow.isoformat(), "hour": 11},
        headers={"Authorization": f"Bearer {guardian_token2}"},
    )
    freed_seat_d1 = next(s for s in freed_schedule.json()["seats"] if s["seat_label"] == "D1")
    assert freed_seat_d1["status"] == "available"


async def test_guardian_multiple_children_shows_correct_child_names_on_seats(client):
    """Test that multiple linked children's bookings show their respective child names."""
    admin = await _make_user(Role.ADMIN)
    guardian = await _make_user(Role.GUARDIAN)
    child_a = await _make_user(Role.MEMBER)
    child_b = await _make_user(Role.MEMBER)

    admin_token = await _login(client, admin)
    await _link(client, admin_token, guardian, child_a)
    await _link(client, admin_token, guardian, child_b)

    guardian_token = await _login(client, guardian)
    tomorrow = (datetime.now(UTC) + timedelta(days=1)).date()

    res_a = await client.post(
        f"/api/v1/guardian/children/{child_a.id}/seat-bookings",
        json={"seat_label": "D2", "date": tomorrow.isoformat(), "hour": 12},
        headers={"Authorization": f"Bearer {guardian_token}"},
    )
    assert res_a.status_code == 201

    res_b = await client.post(
        f"/api/v1/guardian/children/{child_b.id}/seat-bookings",
        json={"seat_label": "D3", "date": tomorrow.isoformat(), "hour": 12},
        headers={"Authorization": f"Bearer {guardian_token}"},
    )
    assert res_b.status_code == 201

    schedule_res = await client.get(
        "/api/v1/seat-booking/schedule",
        params={"date": tomorrow.isoformat(), "hour": 12},
        headers={"Authorization": f"Bearer {guardian_token}"},
    )
    assert schedule_res.status_code == 200
    seats = schedule_res.json()["seats"]

    seat_d2 = next(s for s in seats if s["seat_label"] == "D2")
    assert seat_d2["status"] == "booked_for_child"
    assert seat_d2["booked_for_child_id"] == child_a.id
    assert seat_d2["booked_for_child_name"] == child_a.fullName

    seat_d3 = next(s for s in seats if s["seat_label"] == "D3")
    assert seat_d3["status"] == "booked_for_child"
    assert seat_d3["booked_for_child_id"] == child_b.id
    assert seat_d3["booked_for_child_name"] == child_b.fullName


async def test_child_notified_and_identifies_guardian_booking(client):
    """Test child receives notification and sees guardian name when booked by guardian."""
    admin = await _make_user(Role.ADMIN)
    guardian = await _make_user(Role.GUARDIAN)
    child = await _make_user(Role.MEMBER)

    admin_token = await _login(client, admin)
    await _link(client, admin_token, guardian, child)

    guardian_token = await _login(client, guardian)
    tomorrow = (datetime.now(UTC) + timedelta(days=1)).date()

    # Guardian books seat D4 for child
    res = await client.post(
        f"/api/v1/guardian/children/{child.id}/seat-bookings",
        json={"seat_label": "D4", "date": tomorrow.isoformat(), "hour": 14},
        headers={"Authorization": f"Bearer {guardian_token}"},
    )
    assert res.status_code == 201

    # Child logs in
    child_token = await _login(client, child)

    # Child checks notifications
    notif_res = await client.get(
        "/api/v1/notifications/me",
        headers={"Authorization": f"Bearer {child_token}"},
    )
    assert notif_res.status_code == 200
    guardian_notifs = [n for n in notif_res.json() if n["type"] == "seat-booked-by-guardian"]
    assert len(guardian_notifs) >= 1
    assert guardian.fullName in guardian_notifs[0]["message"]
    assert "D4" in guardian_notifs[0]["message"]

    # Child views schedule for slot
    sched_res = await client.get(
        "/api/v1/seat-booking/schedule",
        params={"date": tomorrow.isoformat(), "hour": 14},
        headers={"Authorization": f"Bearer {child_token}"},
    )
    assert sched_res.status_code == 200
    seat_d4 = next(s for s in sched_res.json()["seats"] if s["seat_label"] == "D4")
    assert seat_d4["status"] == "booked_by_me"
    assert seat_d4["booked_by_guardian_id"] == guardian.id
    assert seat_d4["booked_by_guardian_name"] == guardian.fullName


async def test_seat_booking_for_child_rejects_unlinked_child(client):
    guardian = await _make_user(Role.GUARDIAN)
    stranger = await _make_user(Role.MEMBER)
    guardian_token = await _login(client, guardian)

    tomorrow = (datetime.now(UTC) + timedelta(days=1)).date()
    response = await client.post(
        f"/api/v1/guardian/children/{stranger.id}/seat-bookings",
        json={"seat_label": "A2", "date": tomorrow.isoformat(), "hour": 10},
        headers={"Authorization": f"Bearer {guardian_token}"},
    )

    assert response.status_code == 403


async def test_guardian_can_list_child_payments(client):
    admin = await _make_user(Role.ADMIN)
    guardian = await _make_user(Role.GUARDIAN)
    child = await _make_user(Role.MEMBER)
    admin_token = await _login(client, admin)
    await _link(client, admin_token, guardian, child)
    guardian_token = await _login(client, guardian)

    plan = await prisma.pricingplan.find_unique(where={"planId": "1m"})
    if plan is None:
        plan = await prisma.pricingplan.create(data={"planId": "1m", "price": 1000, "months": 1})
    assert plan is not None
    await prisma.payment.create(
        data={
            "userId": child.id,
            "amount": plan.price,
            "label": f"1 Month — ₹{plan.price}",
            "planMonths": 1,
        }
    )

    response = await client.get(
        f"/api/v1/guardian/children/{child.id}/payments",
        headers={"Authorization": f"Bearer {guardian_token}"},
    )

    print("\nList Child Payments Response:", response.status_code, response.text)

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["label"] == f"1 Month — ₹{plan.price}"
    assert body[0]["amount"] == plan.price


async def test_listing_payments_for_unlinked_child_is_403(client):
    guardian = await _make_user(Role.GUARDIAN)
    stranger = await _make_user(Role.MEMBER)
    guardian_token = await _login(client, guardian)

    response = await client.get(
        f"/api/v1/guardian/children/{stranger.id}/payments",
        headers={"Authorization": f"Bearer {guardian_token}"},
    )

    assert response.status_code == 403


async def test_member_self_link_and_unlink_guardian(client):
    guardian = await _make_user(Role.GUARDIAN)
    member = await _make_user(Role.MEMBER)
    member_token = await _login(client, member)

    # Link guardian
    res = await client.post(
        "/api/v1/guardian/my-guardian",
        json={"guardian_email": guardian.email},
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["email"] == guardian.email
    assert data["full_name"] == guardian.fullName

    # Get my guardian
    res_get = await client.get(
        "/api/v1/guardian/my-guardian",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert res_get.status_code == 200
    assert res_get.json()["email"] == guardian.email

    # Unlink guardian
    res_del = await client.delete(
        "/api/v1/guardian/my-guardian",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert res_del.status_code == 204

    # Verify unlinked
    res_get2 = await client.get(
        "/api/v1/guardian/my-guardian",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert res_get2.status_code == 200
    assert res_get2.json() is None
