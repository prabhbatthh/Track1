import asyncio
import os
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ["APP_ENV"] = "test"

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.core.constants import Role
from app.db.prisma import prisma
from app.main import create_app
from app.modules.members import repository as member_repository

os.environ.setdefault("DATABASE_URL", get_settings().database_url)

TEST_EMAIL_DOMAIN = "@manager-test.example.com"
TEST_TITLE_MARKER = "MANAGER-TEST-"
TOMORROW = (datetime.now(UTC) + timedelta(days=1)).date().isoformat()


def _unique_email() -> str:
    return f"{uuid.uuid4().hex}{TEST_EMAIL_DOMAIN}"


def _book_payload(**overrides) -> dict:
    payload = {
        "title": f"{TEST_TITLE_MARKER}{uuid.uuid4().hex}",
        "author": "Test Author",
        "category": "Fiction",
        "total_copies": 1,
    }
    payload.update(overrides)
    return payload


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
    await prisma.libraryvisit.delete_many(where={"member": domain_filter})
    await prisma.guardianlink.delete_many(where={"guardian": domain_filter})
    await prisma.loan.delete_many(where={"member": domain_filter})
    await prisma.reservation.delete_many(where={"member": domain_filter})
    await prisma.seatbooking.delete_many(where={"member": domain_filter})
    await prisma.book.delete_many(where={"title": {"startswith": TEST_TITLE_MARKER}})
    # Audit entries reference the actor with no cascade, so they have to go
    # before the users do (role changes, bans and fine settlement all log now).
    await prisma.auditlogentry.delete_many(
        where={"actor": {"email": {"endswith": TEST_EMAIL_DOMAIN}}}
    )
    await prisma.user.delete_many(where=domain_filter)
    await prisma.disconnect()


@pytest_asyncio.fixture
async def manager_user():
    return await _make_user(Role.MANAGER)


@pytest_asyncio.fixture
async def member_user():
    return await _make_user(Role.MEMBER)


@pytest_asyncio.fixture
async def guardian_user():
    return await _make_user(Role.GUARDIAN)


def _client_as(user) -> AsyncClient:
    from app.api.deps import get_current_user

    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _create_book(manager_user, **overrides) -> str:
    async with _client_as(manager_user) as client:
        response = await client.post("/api/v1/books", json=_book_payload(**overrides))
    return response.json()["id"]


async def test_dashboard_requires_authentication():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/manager/dashboard")

    assert response.status_code == 401


async def test_member_cannot_view_dashboard(member_user):
    async with _client_as(member_user) as client:
        response = await client.get("/api/v1/manager/dashboard")

    assert response.status_code == 403


async def test_manager_can_view_dashboard_stats(manager_user):
    async with _client_as(manager_user) as client:
        response = await client.get("/api/v1/manager/dashboard")

    assert response.status_code == 200
    body = response.json()
    list_fields = {
        "library_activity",
        "member_activity",
        "seat_utilization",
        "overdue_fines",
        "revenue",
    }
    non_int_fields = list_fields | {"most_borrowed_books"}
    assert (
        set(body.keys())
        == {
            "seats_booked_today",
            "books_issued_today",
            "new_registrations_today",
            "pending_tasks",
        }
        | non_int_fields
    )
    int_fields = {k: v for k, v in body.items() if k not in non_int_fields}
    assert all(isinstance(value, int) for value in int_fields.values())
    assert all(isinstance(body[field], list) for field in list_fields)
    assert isinstance(body["most_borrowed_books"], dict)

    activity = body["library_activity"]
    assert len(activity) == 7
    for day in activity:
        assert set(day.keys()) == {"date", "issued", "returned"}
        assert isinstance(day["issued"], int)
        assert isinstance(day["returned"], int)
    # Oldest first, ending on today.
    assert activity[-1]["date"] == datetime.now(UTC).date().isoformat()

    most_borrowed = body["most_borrowed_books"]
    assert set(most_borrowed.keys()) == {"this_month", "last_3_months", "last_6_months"}
    for period in most_borrowed.values():
        assert len(period) <= 25
        counts = [book["count"] for book in period]
        assert counts == sorted(counts, reverse=True)  # most-borrowed first
        for book in period:
            assert set(book.keys()) == {"book_id", "title", "count"}
            assert book["count"] > 0

    member_activity = body["member_activity"]
    assert len(member_activity) == 6
    for month in member_activity:
        assert set(month.keys()) == {"month", "new_members", "active_members"}

    seat_utilization = body["seat_utilization"]
    assert len(seat_utilization) == 12  # OPEN_HOURS = range(9, 21)
    for hour in seat_utilization:
        assert set(hour.keys()) == {"hour", "percent"}
        assert 0 <= hour["percent"] <= 100

    overdue_fines = body["overdue_fines"]
    assert len(overdue_fines) == 3
    for month in overdue_fines:
        assert set(month.keys()) == {"month", "overdue_books", "fines_generated", "fines_collected"}

    revenue = body["revenue"]
    assert len(revenue) == 6
    for month in revenue:
        assert set(month.keys()) == {"month", "total"}


async def test_dashboard_counts_todays_new_registrations(manager_user):
    async with _client_as(manager_user) as client:
        before = await client.get("/api/v1/manager/dashboard")
        await _make_user(Role.MEMBER)
        after = await client.get("/api/v1/manager/dashboard")

    assert after.json()["new_registrations_today"] == before.json()["new_registrations_today"] + 1


async def test_dashboard_counts_todays_issued_loans(manager_user, member_user):
    book_id = await _create_book(manager_user)

    async with _client_as(manager_user) as client:
        before = await client.get("/api/v1/manager/dashboard")
        await client.post(
            "/api/v1/manager/loans",
            json={"member_id": member_user.id, "book_id": book_id, "duration_days": 3},
        )
        after = await client.get("/api/v1/manager/dashboard")

    assert after.json()["books_issued_today"] == before.json()["books_issued_today"] + 1


async def test_dashboard_counts_pending_reservations_as_pending_tasks(manager_user, member_user):
    book_id = await _create_book(manager_user)

    async with _client_as(manager_user) as client:
        before = await client.get("/api/v1/manager/dashboard")

    async with _client_as(member_user) as client:
        await client.post("/api/v1/reservations", json={"book_id": book_id})

    async with _client_as(manager_user) as client:
        after = await client.get("/api/v1/manager/dashboard")

    assert after.json()["pending_tasks"] == before.json()["pending_tasks"] + 1


async def test_manager_can_book_a_seat_for_a_member(manager_user, member_user):
    async with _client_as(manager_user) as client:
        response = await client.post(
            "/api/v1/manager/seat-bookings",
            json={"member_id": member_user.id, "seat_label": "A1", "date": TOMORROW, "hour": 10},
        )

    assert response.status_code == 201
    body = response.json()
    assert body["seat_label"] == "A1"
    assert body["date"] == TOMORROW
    assert body["hour"] == 10


async def test_member_cannot_book_a_seat_for_another_member(manager_user, member_user):
    async with _client_as(member_user) as client:
        response = await client.post(
            "/api/v1/manager/seat-bookings",
            json={"member_id": member_user.id, "seat_label": "A2", "date": TOMORROW, "hour": 10},
        )

    assert response.status_code == 403


async def test_booking_a_seat_twice_for_the_same_slot_conflicts(manager_user, member_user):
    async with _client_as(manager_user) as client:
        await client.post(
            "/api/v1/manager/seat-bookings",
            json={"member_id": member_user.id, "seat_label": "A3", "date": TOMORROW, "hour": 11},
        )
        response = await client.post(
            "/api/v1/manager/seat-bookings",
            json={"member_id": member_user.id, "seat_label": "A3", "date": TOMORROW, "hour": 11},
        )

    assert response.status_code == 409


async def test_booking_a_seat_for_missing_member_returns_404(manager_user):
    async with _client_as(manager_user) as client:
        response = await client.post(
            "/api/v1/manager/seat-bookings",
            json={
                "member_id": str(uuid.uuid4()),
                "seat_label": "A4",
                "date": TOMORROW,
                "hour": 12,
            },
        )

    assert response.status_code == 404


async def test_manager_can_issue_a_book_for_a_member(manager_user, member_user):
    book_id = await _create_book(manager_user)

    async with _client_as(manager_user) as client:
        response = await client.post(
            "/api/v1/manager/loans",
            json={"member_id": member_user.id, "book_id": book_id, "duration_days": 7},
        )

    assert response.status_code == 201
    body = response.json()
    assert body["book_id"] == book_id
    assert body["status"] == "active"


async def test_issuing_rejects_a_duration_outside_the_allowed_choices(manager_user, member_user):
    book_id = await _create_book(manager_user)

    async with _client_as(manager_user) as client:
        response = await client.post(
            "/api/v1/manager/loans",
            json={"member_id": member_user.id, "book_id": book_id, "duration_days": 4},
        )

    assert response.status_code == 422


async def test_issuing_a_book_for_missing_member_returns_404(manager_user):
    book_id = await _create_book(manager_user)

    async with _client_as(manager_user) as client:
        response = await client.post(
            "/api/v1/manager/loans",
            json={"member_id": str(uuid.uuid4()), "book_id": book_id, "duration_days": 3},
        )

    assert response.status_code == 404


async def _request_reservation(member_user, book_id: str) -> str:
    async with _client_as(member_user) as client:
        response = await client.post("/api/v1/reservations", json={"book_id": book_id})
    return response.json()["id"]


async def test_pending_reservations_requires_manager(member_user):
    async with _client_as(member_user) as client:
        response = await client.get("/api/v1/manager/reservations/pending")

    assert response.status_code == 403


async def test_manager_sees_a_pending_reservation_request(manager_user, member_user):
    book_id = await _create_book(manager_user)
    reservation_id = await _request_reservation(member_user, book_id)

    async with _client_as(manager_user) as client:
        response = await client.get("/api/v1/manager/reservations/pending")

    assert response.status_code == 200
    entry = next(row for row in response.json() if row["id"] == reservation_id)
    assert entry["book_id"] == book_id
    assert entry["member_id"] == member_user.id
    assert entry["member_name"] == member_user.fullName


async def test_approving_a_reservation_creates_a_loan_with_the_chosen_duration(
    manager_user, member_user
):
    book_id = await _create_book(manager_user)
    reservation_id = await _request_reservation(member_user, book_id)

    async with _client_as(manager_user) as client:
        response = await client.post(
            f"/api/v1/manager/reservations/{reservation_id}/approve",
            json={"duration_days": 5},
        )
        pending_after = await client.get("/api/v1/manager/reservations/pending")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "approved"
    assert body["due_date"] is not None
    approved_due = datetime.fromisoformat(body["due_date"].replace("Z", "+00:00"))
    assert 4 <= (approved_due - datetime.now(UTC)).days <= 5
    assert not any(row["id"] == reservation_id for row in pending_after.json())


async def test_approving_rejects_an_out_of_range_duration(manager_user, member_user):
    book_id = await _create_book(manager_user)
    reservation_id = await _request_reservation(member_user, book_id)

    async with _client_as(manager_user) as client:
        response = await client.post(
            f"/api/v1/manager/reservations/{reservation_id}/approve",
            json={"duration_days": 1},
        )

    assert response.status_code == 422


async def test_approving_when_no_copies_remain_conflicts(manager_user, member_user):
    book_id = await _create_book(manager_user, total_copies=1)
    other_member = await _make_user(Role.MEMBER)
    reservation_id = await _request_reservation(member_user, book_id)

    async with _client_as(manager_user) as client:
        # Direct-issue the only copy out from under the pending request.
        await client.post(
            "/api/v1/manager/loans",
            json={"member_id": other_member.id, "book_id": book_id, "duration_days": 3},
        )
        response = await client.post(
            f"/api/v1/manager/reservations/{reservation_id}/approve",
            json={"duration_days": 3},
        )

    assert response.status_code == 409


async def test_concurrent_approvals_cannot_issue_the_same_copy_twice(manager_user, member_user):
    other_manager = await _make_user(Role.MANAGER)
    other_member = await _make_user(Role.MEMBER)
    book_id = await _create_book(manager_user, total_copies=1)
    first_id = await _request_reservation(member_user, book_id)
    second_id = await _request_reservation(other_member, book_id)

    async def approve(manager, reservation_id):
        async with _client_as(manager) as client:
            return await client.post(
                f"/api/v1/manager/reservations/{reservation_id}/approve",
                json={"duration_days": 3},
            )

    responses = await asyncio.gather(
        approve(manager_user, first_id), approve(other_manager, second_id)
    )
    assert sorted(response.status_code for response in responses) == [200, 409]
    assert await prisma.loan.count(where={"bookId": book_id, "returnedAt": None}) == 1


async def test_approving_notifies_the_requesting_member(manager_user, member_user):
    book_id = await _create_book(manager_user)
    reservation_id = await _request_reservation(member_user, book_id)

    async with _client_as(manager_user) as client:
        await client.post(
            f"/api/v1/manager/reservations/{reservation_id}/approve",
            json={"duration_days": 3},
        )

    async with _client_as(member_user) as client:
        notifications = await client.get("/api/v1/notifications/me")

    assert any(n["type"] == "reservation-approved" for n in notifications.json())


async def test_rejecting_a_reservation_notifies_the_member_and_leaves_it_out_of_the_queue(
    manager_user, member_user
):
    book_id = await _create_book(manager_user)
    reservation_id = await _request_reservation(member_user, book_id)

    async with _client_as(manager_user) as client:
        response = await client.post(f"/api/v1/manager/reservations/{reservation_id}/reject")
        pending_after = await client.get("/api/v1/manager/reservations/pending")

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"
    assert not any(row["id"] == reservation_id for row in pending_after.json())

    async with _client_as(member_user) as client:
        notifications = await client.get("/api/v1/notifications/me")

    assert any(n["type"] == "reservation-rejected" for n in notifications.json())


async def test_approving_an_already_decided_reservation_is_not_found(manager_user, member_user):
    book_id = await _create_book(manager_user)
    reservation_id = await _request_reservation(member_user, book_id)

    async with _client_as(manager_user) as client:
        await client.post(f"/api/v1/manager/reservations/{reservation_id}/reject")
        response = await client.post(
            f"/api/v1/manager/reservations/{reservation_id}/approve",
            json={"duration_days": 3},
        )

    assert response.status_code == 404


async def test_manager_can_link_a_guardian_by_email(manager_user, member_user, guardian_user):
    async with _client_as(manager_user) as client:
        response = await client.post(
            "/api/v1/manager/guardian-links",
            json={"student_email": member_user.email, "guardian_email": guardian_user.email},
        )

    assert response.status_code == 204


async def test_linking_a_guardian_with_unknown_email_returns_404(manager_user, member_user):
    async with _client_as(manager_user) as client:
        response = await client.post(
            "/api/v1/manager/guardian-links",
            json={"student_email": member_user.email, "guardian_email": _unique_email()},
        )

    assert response.status_code == 404


async def test_linking_a_second_guardian_to_the_same_member_conflicts(
    manager_user, member_user, guardian_user
):
    other_guardian = await _make_user(Role.GUARDIAN)

    async with _client_as(manager_user) as client:
        await client.post(
            "/api/v1/manager/guardian-links",
            json={"student_email": member_user.email, "guardian_email": guardian_user.email},
        )
        response = await client.post(
            "/api/v1/manager/guardian-links",
            json={"student_email": member_user.email, "guardian_email": other_guardian.email},
        )

    assert response.status_code == 409


async def test_books_endpoint_requires_authentication():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/manager/books")

    assert response.status_code == 401


async def test_member_cannot_view_book_availability(member_user):
    async with _client_as(member_user) as client:
        response = await client.get("/api/v1/manager/books")

    assert response.status_code == 403


async def test_book_with_free_copies_is_available(manager_user):
    book_id = await _create_book(manager_user, total_copies=2)

    async with _client_as(manager_user) as client:
        response = await client.get("/api/v1/manager/books", params={"search": TEST_TITLE_MARKER})

    assert response.status_code == 200
    entry = next(item for item in response.json()["items"] if item["id"] == book_id)
    assert entry["total_copies"] == 2
    assert entry["available_copies"] == 2
    assert entry["is_available"] is True
    assert entry["expected_available_at"] is None


async def test_fully_loaned_book_reports_earliest_due_date_as_expected_available(
    manager_user, member_user
):
    book_id = await _create_book(manager_user, total_copies=1)
    # Postgres truncates timestamp precision below milliseconds, so seed with
    # microsecond=0 to make the round-tripped value compare equal exactly.
    due_date = (datetime.now(UTC) + timedelta(days=5)).replace(microsecond=0)
    await prisma.loan.create(
        data={
            "bookId": book_id,
            "memberId": member_user.id,
            "dueDate": due_date,
            "createdById": manager_user.id,
        }
    )

    async with _client_as(manager_user) as client:
        response = await client.get("/api/v1/manager/books", params={"search": TEST_TITLE_MARKER})

    entry = next(item for item in response.json()["items"] if item["id"] == book_id)
    assert entry["available_copies"] == 0
    assert entry["is_available"] is False
    assert entry["expected_available_at"] == due_date.isoformat().replace("+00:00", "Z")


async def test_book_availability_picks_the_earliest_due_date_among_active_loans(
    manager_user, member_user
):
    book_id = await _create_book(manager_user, total_copies=1)
    other_member = await _make_user(Role.MEMBER)
    later_due = (datetime.now(UTC) + timedelta(days=10)).replace(microsecond=0)
    sooner_due = (datetime.now(UTC) + timedelta(days=2)).replace(microsecond=0)
    await prisma.loan.create(
        data={
            "bookId": book_id,
            "memberId": member_user.id,
            "dueDate": later_due,
            "createdById": manager_user.id,
        }
    )
    await prisma.loan.create(
        data={
            "bookId": book_id,
            "memberId": other_member.id,
            "dueDate": sooner_due,
            "createdById": manager_user.id,
        }
    )

    async with _client_as(manager_user) as client:
        response = await client.get("/api/v1/manager/books", params={"search": TEST_TITLE_MARKER})

    entry = next(item for item in response.json()["items"] if item["id"] == book_id)
    assert entry["expected_available_at"] == sooner_due.isoformat().replace("+00:00", "Z")


async def test_returned_loans_do_not_count_against_availability(manager_user, member_user):
    book_id = await _create_book(manager_user, total_copies=1)
    await prisma.loan.create(
        data={
            "bookId": book_id,
            "memberId": member_user.id,
            "dueDate": datetime.now(UTC) - timedelta(days=1),
            "returnedAt": datetime.now(UTC),
            "createdById": manager_user.id,
        }
    )

    async with _client_as(manager_user) as client:
        response = await client.get("/api/v1/manager/books", params={"search": TEST_TITLE_MARKER})

    entry = next(item for item in response.json()["items"] if item["id"] == book_id)
    assert entry["available_copies"] == 1
    assert entry["is_available"] is True
    assert entry["expected_available_at"] is None


async def test_book_availability_search_matches_title_or_author(manager_user):
    unique_marker = uuid.uuid4().hex[:8]
    await _create_book(
        manager_user, title=f"{TEST_TITLE_MARKER}{unique_marker}", author="Unmatched Author"
    )

    async with _client_as(manager_user) as client:
        response = await client.get("/api/v1/manager/books", params={"search": unique_marker})

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert unique_marker in body["items"][0]["title"]


async def test_rejecting_an_already_approved_reservation_does_not_undo_the_loan(
    manager_user, member_user
):
    """Reject used to be an unconditional write with no status guard and no lock.

    Approve takes an advisory lock and creates a Loan; reject took neither, so the two
    could interleave and leave the row 'rejected' while the book was already issued.
    """
    book_id = await _create_book(manager_user)
    reservation_id = await _request_reservation(member_user, book_id)

    async with _client_as(manager_user) as client:
        approved = await client.post(
            f"/api/v1/manager/reservations/{reservation_id}/approve",
            json={"duration_days": 3},
        )
        assert approved.status_code == 200

        rejected = await client.post(f"/api/v1/manager/reservations/{reservation_id}/reject")

    # The decision already made stands, and the caller is told rather than silently winning.
    assert rejected.status_code in (404, 409)

    reservation = await prisma.reservation.find_unique(where={"id": reservation_id})
    assert reservation is not None
    assert reservation.status == "approved"
    assert reservation.loanId is not None


async def test_concurrent_approve_and_reject_leave_one_consistent_outcome(
    manager_user, member_user
):
    book_id = await _create_book(manager_user)
    reservation_id = await _request_reservation(member_user, book_id)

    async def approve():
        async with _client_as(manager_user) as client:
            return await client.post(
                f"/api/v1/manager/reservations/{reservation_id}/approve",
                json={"duration_days": 3},
            )

    async def reject():
        async with _client_as(manager_user) as client:
            return await client.post(f"/api/v1/manager/reservations/{reservation_id}/reject")

    approve_response, reject_response = await asyncio.gather(
        approve(), reject(), return_exceptions=True
    )

    statuses = [
        r.status_code for r in (approve_response, reject_response) if hasattr(r, "status_code")
    ]
    # Exactly one decision may succeed.
    assert statuses.count(200) == 1

    reservation = await prisma.reservation.find_unique(where={"id": reservation_id})
    assert reservation is not None
    assert reservation.status in ("approved", "rejected")
    # A rejected reservation must never carry a loan.
    if reservation.status == "rejected":
        assert reservation.loanId is None


async def test_demand_forecast_requires_manager(member_user):
    async with _client_as(member_user) as client:
        response = await client.get("/api/v1/manager/demand-forecast")

    assert response.status_code == 403


async def test_demand_forecast_flags_new_activity_as_high_demand(manager_user):
    """The dev DB carries months of seeded catalog-wide activity, so a single fresh
    book's signal can rank outside DEMAND_RESULT_LIMIT even when correctly scored high
    — the aggregation queries themselves are exercised for real (book_id, count shape),
    but the counts are mocked down to just this one book so the response is
    deterministic regardless of what else is trending in seeded data."""
    book_id = await _create_book(manager_user, total_copies=5)

    with (
        patch(
            "app.modules.manager.service.repository.count_loans_by_book_in_windows",
            AsyncMock(return_value={book_id: (2, 0)}),
        ),
        patch(
            "app.modules.manager.service.repository.count_reservations_by_book_in_windows",
            AsyncMock(return_value={}),
        ),
        patch(
            "app.modules.manager.service.reservations_repository.list_pending",
            AsyncMock(return_value=[]),
        ),
    ):
        async with _client_as(manager_user) as client:
            response = await client.get("/api/v1/manager/demand-forecast")

    assert response.status_code == 200
    items = response.json()
    assert len(items) == 1
    assert items[0]["book_id"] == book_id
    assert items[0]["demand_level"] == "high"
    assert items[0]["recent_activity"] == 2
    assert items[0]["prior_activity"] == 0
    assert items[0]["change_pct"] is None


async def test_demand_forecast_ignores_books_with_no_recent_activity(manager_user):
    book_id = await _create_book(manager_user)

    async with _client_as(manager_user) as client:
        response = await client.get("/api/v1/manager/demand-forecast")

    assert response.status_code == 200
    assert all(item["book_id"] != book_id for item in response.json())


async def test_late_return_risk_requires_manager(member_user):
    async with _client_as(member_user) as client:
        response = await client.get("/api/v1/manager/late-return-risk")

    assert response.status_code == 403


async def test_late_return_risk_flags_overdue_loan_with_bad_history(manager_user, member_user):
    book_id = await _create_book(manager_user, total_copies=3)
    other_book_id = await _create_book(manager_user, total_copies=3)

    # A past loan this member returned late, to build a bad personal track record.
    await prisma.loan.create(
        data={
            "bookId": other_book_id,
            "memberId": member_user.id,
            "borrowedAt": datetime.now(UTC) - timedelta(days=30),
            "dueDate": datetime.now(UTC) - timedelta(days=20),
            "returnedAt": datetime.now(UTC) - timedelta(days=10),
            "createdById": manager_user.id,
        }
    )

    overdue_loan = await prisma.loan.create(
        data={
            "bookId": book_id,
            "memberId": member_user.id,
            "dueDate": datetime.now(UTC) - timedelta(days=3),
            "createdById": manager_user.id,
        }
    )

    async with _client_as(manager_user) as client:
        response = await client.get("/api/v1/manager/late-return-risk")

    assert response.status_code == 200
    items = response.json()
    matching = next((item for item in items if item["loan_id"] == overdue_loan.id), None)
    assert matching is not None
    assert matching["is_overdue"] is True
    assert matching["days_overdue"] == 3
    assert matching["risk_level"] == "high"


async def test_late_return_risk_excludes_returned_loans(manager_user, member_user):
    book_id = await _create_book(manager_user)
    returned_loan = await prisma.loan.create(
        data={
            "bookId": book_id,
            "memberId": member_user.id,
            "dueDate": datetime.now(UTC) - timedelta(days=5),
            "returnedAt": datetime.now(UTC) - timedelta(days=1),
            "createdById": manager_user.id,
        }
    )

    async with _client_as(manager_user) as client:
        response = await client.get("/api/v1/manager/late-return-risk")

    assert response.status_code == 200
    assert all(item["loan_id"] != returned_loan.id for item in response.json())


async def _create_visit(member_user, manager_user, *, checked_in_at, checked_out_at=None):
    return await prisma.libraryvisit.create(
        data={
            "memberId": member_user.id,
            "recordedById": manager_user.id,
            "checkedInAt": checked_in_at,
            "checkedOutAt": checked_out_at,
        }
    )


async def test_footfall_requires_authentication():
    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://test"
    ) as client:
        response = await client.get("/api/v1/manager/footfall")
    assert response.status_code == 401


async def test_member_can_view_footfall(member_user):
    async with _client_as(member_user) as client:
        response = await client.get("/api/v1/manager/footfall")
    assert response.status_code == 200


async def test_footfall_counts_visits_by_day_and_hour(manager_user, member_user):
    today = datetime.now(UTC).replace(hour=10, minute=0, second=0, microsecond=0)
    yesterday = today - timedelta(days=1)
    await _create_visit(member_user, manager_user, checked_in_at=today)
    await _create_visit(member_user, manager_user, checked_in_at=today.replace(hour=11))
    await _create_visit(member_user, manager_user, checked_in_at=yesterday)

    async with _client_as(manager_user) as client:
        response = await client.get("/api/v1/manager/footfall", params={"range": "7d"})

    assert response.status_code == 200
    body = response.json()
    assert body["range"] == "7d"
    assert len(body["daily"]) == 7
    by_date = {row["date"]: row["visits"] for row in body["daily"]}
    assert by_date[today.date().isoformat()] >= 2
    assert by_date[yesterday.date().isoformat()] >= 1

    by_hour = {row["hour"]: row["visits"] for row in body["peak_hours"]}
    assert len(body["peak_hours"]) == 24
    assert by_hour[10] >= 1
    assert by_hour[11] >= 1


async def test_footfall_average_duration_ignores_still_open_visits(manager_user):
    """Mocked to an exact, controlled visit list — asserting an exact average against
    real DB writes would be flaky if any other real visit exists in the same 7-day
    window (same reasoning as the empty-range test above)."""
    now = datetime.now(UTC)
    closed_visit = SimpleNamespace(
        checkedInAt=now - timedelta(minutes=30), checkedOutAt=now
    )
    # Still checked in — no checkedOutAt — must not count as a zero-length visit.
    open_visit = SimpleNamespace(checkedInAt=now, checkedOutAt=None)

    with patch(
        "app.modules.manager.service.visits_repository.list_check_ins_between",
        AsyncMock(return_value=[closed_visit, open_visit]),
    ):
        async with _client_as(manager_user) as client:
            response = await client.get("/api/v1/manager/footfall", params={"range": "7d"})

    assert response.status_code == 200
    assert response.json()["average_visit_minutes"] == 30.0


async def test_footfall_handles_an_empty_range_honestly(manager_user):
    """The dev DB may carry real visits from other tests/manual use within the same 7
    days, so asserting "empty" against live data would be flaky — mocked down to a
    genuinely empty window instead, same reasoning as the demand-forecast test above."""
    with patch(
        "app.modules.manager.service.visits_repository.list_check_ins_between",
        AsyncMock(return_value=[]),
    ):
        async with _client_as(manager_user) as client:
            response = await client.get("/api/v1/manager/footfall", params={"range": "7d"})

    assert response.status_code == 200
    body = response.json()
    assert all(row["visits"] == 0 for row in body["daily"])
    assert all(row["visits"] == 0 for row in body["peak_hours"])
    # No fabricated average/busiest-day when there's genuinely no data to compute from.
    assert body["average_visit_minutes"] is None
    assert body["busiest_day"] is None
    assert body["quietest_day"] is None
