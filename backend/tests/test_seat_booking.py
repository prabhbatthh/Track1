import asyncio
import os
import uuid
from datetime import UTC, datetime, timedelta

os.environ["APP_ENV"] = "test"

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.core.constants import Role
from app.db.prisma import prisma
from app.main import create_app
from app.modules.members import repository as member_repository

os.environ.setdefault("DATABASE_URL", get_settings().database_url)

TEST_EMAIL_DOMAIN = "@seat-booking-test.example.com"
TOMORROW = (datetime.now(UTC) + timedelta(days=1)).date().isoformat()
DAY_AFTER_MAX = (datetime.now(UTC) + timedelta(days=3)).date().isoformat()
YESTERDAY = (datetime.now(UTC) - timedelta(days=1)).date().isoformat()


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
    await prisma.seatnotifyrequest.delete_many(where={"member": domain_filter})
    await prisma.seatbooking.delete_many(where={"member": domain_filter})
    await prisma.user.delete_many(where=domain_filter)
    await prisma.disconnect()


@pytest_asyncio.fixture
async def member_user():
    return await _make_user(Role.MEMBER)


@pytest_asyncio.fixture
async def other_member_user():
    return await _make_user(Role.MEMBER)


def _client_as(user) -> AsyncClient:
    from app.api.deps import get_current_user

    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _seat_label(prefix: str) -> str:
    # A distinct seat per test (still a real layout label) so tests can run in
    # any order without colliding with each other's bookings for the same slot.
    return prefix


async def test_availability_summary_is_public_and_has_the_right_shape():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/seat-booking/availability")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 32
    assert body["available"] + body["booked"] == 32


async def test_availability_summary_reflects_a_booking_for_the_current_hour(member_user):
    # ponytail: a hardcoded seat label (the previous version booked "D8" unconditionally)
    # flakes against this suite's live dev database — real seed/demo activity can already
    # occupy that exact seat at "the current hour" by the time this runs. Ask the real
    # schedule which seat is actually free right now instead of guessing one.
    now = datetime.now(UTC)
    await prisma.seatbooking.delete_many(
        where={"date": datetime(now.year, now.month, now.day, tzinfo=UTC), "hour": now.hour}
    )
    async with _client_as(member_user) as client:
        before = await client.get("/api/v1/seat-booking/availability")
        schedule = await client.get(
            "/api/v1/seat-booking/schedule",
            params={"date": now.date().isoformat(), "hour": now.hour},
        )
        free_seat = next(s for s in schedule.json()["seats"] if s["status"] == "available")
        created = await client.post(
            "/api/v1/seat-booking",
            json={
                "seat_label": free_seat["seat_label"],
                "date": now.date().isoformat(),
                "hour": now.hour,
            },
        )
        after = await client.get("/api/v1/seat-booking/availability")
    assert created.status_code == 201
    assert after.json()["booked"] == before.json()["booked"] + 1
    assert after.json()["available"] == before.json()["available"] - 1


async def test_get_schedule_requires_authentication():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(
            "/api/v1/seat-booking/schedule", params={"date": TOMORROW, "hour": 10}
        )
    assert response.status_code == 401


async def test_schedule_has_the_right_shape(member_user):
    async with _client_as(member_user) as client:
        response = await client.get(
            "/api/v1/seat-booking/schedule", params={"date": TOMORROW, "hour": 1}
        )
    assert response.status_code == 200
    body = response.json()
    assert len(body["seats"]) == 32
    assert {seat["status"] for seat in body["seats"]} <= {
        "available",
        "reserved",
        "booked_by_me",
        "booked_for_child",
    }
    # Not "all seats are available" — this suite runs against the same live dev
    # database real manual testing uses, so a seat can legitimately already be
    # booked by someone else. C1 is untouched by every other test in this file,
    # so it's a reasonable (if not airtight) stand-in for "a fresh seat".
    seat_c1 = next(s for s in body["seats"] if s["seat_label"] == "C1")
    assert seat_c1["status"] == "available"


async def test_book_seat_then_schedule_shows_booked_by_me(member_user):
    async with _client_as(member_user) as client:
        created = await client.post(
            "/api/v1/seat-booking",
            json={"seat_label": "A1", "date": TOMORROW, "hour": 2},
        )
        assert created.status_code == 201
        assert created.json()["seat_label"] == "A1"

        schedule = await client.get(
            "/api/v1/seat-booking/schedule", params={"date": TOMORROW, "hour": 2}
        )
        notifications = await client.get("/api/v1/notifications/me")
    seat_a1 = next(s for s in schedule.json()["seats"] if s["seat_label"] == "A1")
    assert seat_a1["status"] == "booked_by_me"
    assert seat_a1["booking_id"] == created.json()["id"]
    assert any(n["type"] == "seat-booked" for n in notifications.json())


async def test_schedule_shows_reserved_for_other_users_booking(member_user, other_member_user):
    async with _client_as(member_user) as client:
        await client.post(
            "/api/v1/seat-booking",
            json={"seat_label": "A2", "date": TOMORROW, "hour": 3},
        )

    async with _client_as(other_member_user) as client:
        schedule = await client.get(
            "/api/v1/seat-booking/schedule", params={"date": TOMORROW, "hour": 3}
        )
    seat_a2 = next(s for s in schedule.json()["seats"] if s["seat_label"] == "A2")
    assert seat_a2["status"] == "reserved"
    assert seat_a2["booking_id"] is None


async def test_same_member_cannot_book_two_seats_in_same_slot(member_user):
    async with _client_as(member_user) as client:
        first = await client.post(
            "/api/v1/seat-booking",
            json={"seat_label": "A7", "date": TOMORROW, "hour": 13},
        )
        second = await client.post(
            "/api/v1/seat-booking",
            json={"seat_label": "A8", "date": TOMORROW, "hour": 13},
        )
    assert first.status_code == 201
    assert second.status_code == 409

    # Once they cancel the first, they should be free to book a different seat
    # in that same slot again.
    async with _client_as(member_user) as client:
        await client.delete(f"/api/v1/seat-booking/{first.json()['id']}")
        third = await client.post(
            "/api/v1/seat-booking",
            json={"seat_label": "A8", "date": TOMORROW, "hour": 13},
        )
    assert third.status_code == 201


async def test_concurrent_different_seats_allow_only_one_booking(member_user):
    async def book(seat_label: str):
        async with _client_as(member_user) as client:
            return await client.post(
                "/api/v1/seat-booking",
                json={"seat_label": seat_label, "date": TOMORROW, "hour": 14},
            )

    responses = await asyncio.gather(book("C7"), book("C8"))

    assert sorted(response.status_code for response in responses) == [201, 409]
    bookings = await prisma.seatbooking.find_many(where={"memberId": member_user.id, "hour": 14})
    assert len(bookings) == 1


async def test_double_booking_same_slot_conflicts(member_user, other_member_user):
    async with _client_as(member_user) as client:
        first = await client.post(
            "/api/v1/seat-booking",
            json={"seat_label": "A3", "date": TOMORROW, "hour": 4},
        )
    assert first.status_code == 201

    async with _client_as(other_member_user) as client:
        second = await client.post(
            "/api/v1/seat-booking",
            json={"seat_label": "A3", "date": TOMORROW, "hour": 4},
        )
    assert second.status_code == 409


async def test_book_invalid_seat_label_rejected(member_user):
    async with _client_as(member_user) as client:
        response = await client.post(
            "/api/v1/seat-booking",
            json={"seat_label": "Z9", "date": TOMORROW, "hour": 5},
        )
    assert response.status_code == 422


async def test_book_past_date_rejected(member_user):
    async with _client_as(member_user) as client:
        response = await client.post(
            "/api/v1/seat-booking",
            json={"seat_label": "A4", "date": YESTERDAY, "hour": 5},
        )
    assert response.status_code == 400


async def test_book_beyond_max_days_ahead_rejected(member_user):
    async with _client_as(member_user) as client:
        response = await client.post(
            "/api/v1/seat-booking",
            json={"seat_label": "A5", "date": DAY_AFTER_MAX, "hour": 5},
        )
    assert response.status_code == 400


async def test_book_past_hour_today_rejected(member_user):
    from unittest.mock import patch

    now = datetime.now(UTC)
    fixed_today = now.date().isoformat()
    fixed_now = datetime(now.year, now.month, now.day, 14, 30, tzinfo=UTC)

    await prisma.seatbooking.delete_many(
        where={"date": datetime(now.year, now.month, now.day, tzinfo=UTC), "hour": 15}
    )

    with patch("app.modules.seat_booking.service._now", lambda: fixed_now):
        async with _client_as(member_user) as client:
            past_hour = await client.post(
                "/api/v1/seat-booking",
                json={"seat_label": "D7", "date": fixed_today, "hour": 10},
            )
            future_hour = await client.post(
                "/api/v1/seat-booking",
                json={"seat_label": "D7", "date": fixed_today, "hour": 15},
            )
    assert past_hour.status_code == 400
    assert future_hour.status_code == 201


async def test_list_my_bookings_includes_created_booking(member_user):
    async with _client_as(member_user) as client:
        created = await client.post(
            "/api/v1/seat-booking",
            json={"seat_label": "B1", "date": TOMORROW, "hour": 6},
        )
        listed = await client.get("/api/v1/seat-booking/me")
    ids = [b["id"] for b in listed.json()]
    assert created.json()["id"] in ids


async def test_cancel_booking_by_non_owner_forbidden(member_user, other_member_user):
    async with _client_as(member_user) as client:
        created = await client.post(
            "/api/v1/seat-booking",
            json={"seat_label": "B2", "date": TOMORROW, "hour": 7},
        )
    async with _client_as(other_member_user) as client:
        response = await client.delete(f"/api/v1/seat-booking/{created.json()['id']}")
    assert response.status_code == 403


async def test_cancel_booking_frees_the_slot(member_user):
    async with _client_as(member_user) as client:
        created = await client.post(
            "/api/v1/seat-booking",
            json={"seat_label": "B3", "date": TOMORROW, "hour": 8},
        )
        cancelled = await client.delete(f"/api/v1/seat-booking/{created.json()['id']}")
        schedule = await client.get(
            "/api/v1/seat-booking/schedule", params={"date": TOMORROW, "hour": 8}
        )
    assert cancelled.status_code == 204
    seat_b3 = next(s for s in schedule.json()["seats"] if s["seat_label"] == "B3")
    assert seat_b3["status"] == "available"


async def test_notify_request_rejected_when_seat_available(member_user):
    async with _client_as(member_user) as client:
        response = await client.post(
            "/api/v1/seat-booking/notify",
            json={"seat_label": "B4", "date": TOMORROW, "hour": 9},
        )
    assert response.status_code == 400


async def test_notify_request_rejected_for_own_booking(member_user):
    async with _client_as(member_user) as client:
        await client.post(
            "/api/v1/seat-booking",
            json={"seat_label": "B5", "date": TOMORROW, "hour": 10},
        )
        response = await client.post(
            "/api/v1/seat-booking/notify",
            json={"seat_label": "B5", "date": TOMORROW, "hour": 10},
        )
    assert response.status_code == 400


async def test_notify_request_fulfilled_on_cancellation(member_user, other_member_user):
    async with _client_as(member_user) as client:
        created = await client.post(
            "/api/v1/seat-booking",
            json={"seat_label": "B6", "date": TOMORROW, "hour": 11},
        )
    assert created.status_code == 201

    async with _client_as(other_member_user) as client:
        notify = await client.post(
            "/api/v1/seat-booking/notify",
            json={"seat_label": "B6", "date": TOMORROW, "hour": 11},
        )
    assert notify.status_code == 204

    async with _client_as(member_user) as client:
        cancelled = await client.delete(f"/api/v1/seat-booking/{created.json()['id']}")
    assert cancelled.status_code == 204

    async with _client_as(other_member_user) as client:
        notifications = await client.get("/api/v1/notifications/me")
    matching = [n for n in notifications.json() if n["type"] == "seat-available"]
    assert len(matching) == 1
    assert "B6" in matching[0]["message"]
    assert matching[0]["read"] is False


async def test_mark_notification_as_read_and_forbidden_for_others(member_user, other_member_user):
    async with _client_as(member_user) as client:
        created = await client.post(
            "/api/v1/seat-booking",
            json={"seat_label": "B7", "date": TOMORROW, "hour": 12},
        )
    async with _client_as(other_member_user) as client:
        await client.post(
            "/api/v1/seat-booking/notify",
            json={"seat_label": "B7", "date": TOMORROW, "hour": 12},
        )
    async with _client_as(member_user) as client:
        await client.delete(f"/api/v1/seat-booking/{created.json()['id']}")

    async with _client_as(other_member_user) as client:
        notifications = await client.get("/api/v1/notifications/me")
    notification_id = notifications.json()[0]["id"]

    async with _client_as(member_user) as client:
        forbidden = await client.post(f"/api/v1/notifications/{notification_id}/read")
    assert forbidden.status_code == 403

    async with _client_as(other_member_user) as client:
        marked = await client.post(f"/api/v1/notifications/{notification_id}/read")
    assert marked.status_code == 200
    assert marked.json()["read"] is True
