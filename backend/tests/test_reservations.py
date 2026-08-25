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

TEST_EMAIL_DOMAIN = "@reservations-test.example.com"
TEST_TITLE_MARKER = "RESERVATIONS-TEST-"


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
    await prisma.reservation.delete_many(where={"member": domain_filter})
    await prisma.loan.delete_many(where={"member": domain_filter})
    await prisma.book.delete_many(where={"title": {"startswith": TEST_TITLE_MARKER}})
    await prisma.user.delete_many(where=domain_filter)
    await prisma.disconnect()


@pytest_asyncio.fixture
async def member_user():
    return await _make_user(Role.MEMBER)


@pytest_asyncio.fixture
async def librarian_user():
    return await _make_user(Role.LIBRARIAN)


def _client_as(user) -> AsyncClient:
    from app.api.deps import get_current_user

    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _create_book(librarian_user, **overrides) -> str:
    async with _client_as(librarian_user) as client:
        response = await client.post("/api/v1/books", json=_book_payload(**overrides))
    return response.json()["id"]


async def test_reserve_book_requires_authentication():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/reservations", json={"book_id": str(uuid.uuid4())})

    assert response.status_code == 401


async def test_reserve_available_book_is_pending_and_does_not_hold_a_copy(
    member_user, librarian_user
):
    book_id = await _create_book(librarian_user, total_copies=1)

    async with _client_as(member_user) as client:
        response = await client.post("/api/v1/reservations", json={"book_id": book_id})
        book_after = await client.get(f"/api/v1/books/{book_id}")
        notifications = await client.get("/api/v1/notifications/me")

    assert response.status_code == 201
    body = response.json()
    assert body["book_id"] == book_id
    assert body["status"] == "pending"
    assert body["due_date"] is None
    # Requesting to borrow doesn't hold a physical copy — only manager approval does.
    assert book_after.json()["total_copies"] == 1
    assert book_after.json()["available"] is True
    assert any(n["type"] == "reservation-requested" for n in notifications.json())


async def test_unavailable_book_accepts_a_waitlist_reservation(member_user, librarian_user):
    book_id = await _create_book(librarian_user, total_copies=0)

    async with _client_as(member_user) as client:
        response = await client.post("/api/v1/reservations", json={"book_id": book_id})

    assert response.status_code == 201
    assert response.json()["status"] == "pending"
    assert response.json()["queue_position"] == 1


async def test_reserve_joins_waitlist_once_all_copies_are_on_loan(member_user, librarian_user):
    manager = await _make_user(Role.MANAGER)
    book_id = await _create_book(librarian_user, total_copies=1)
    other_member = await _make_user(Role.MEMBER)

    async with _client_as(manager) as client:
        await client.post("/api/v1/loans", json={"book_id": book_id, "member_id": other_member.id})

    async with _client_as(member_user) as client:
        response = await client.post("/api/v1/reservations", json={"book_id": book_id})

    assert response.status_code == 201
    assert response.json()["status"] == "pending"
    assert response.json()["queue_position"] == 1


async def test_list_my_reservations_excludes_cancelled_ones(member_user, librarian_user):
    book_id = await _create_book(librarian_user, total_copies=1)

    async with _client_as(member_user) as client:
        created = await client.post("/api/v1/reservations", json={"book_id": book_id})
        reservation_id = created.json()["id"]
        listed_before = await client.get("/api/v1/reservations/me")

        await client.delete(f"/api/v1/reservations/{reservation_id}")
        listed_after = await client.get("/api/v1/reservations/me")

    assert any(r["id"] == reservation_id for r in listed_before.json())
    assert all(r["id"] != reservation_id for r in listed_after.json())


async def test_cancel_pending_reservation_leaves_total_copies_untouched(
    member_user, librarian_user
):
    book_id = await _create_book(librarian_user, total_copies=1)

    async with _client_as(member_user) as client:
        created = await client.post("/api/v1/reservations", json={"book_id": book_id})
        reservation_id = created.json()["id"]

        cancel_response = await client.delete(f"/api/v1/reservations/{reservation_id}")
        book_after = await client.get(f"/api/v1/books/{book_id}")

    assert cancel_response.status_code == 204
    assert book_after.json()["total_copies"] == 1
    assert book_after.json()["available"] is True


async def test_cancel_reservation_twice_is_not_found(member_user, librarian_user):
    book_id = await _create_book(librarian_user, total_copies=1)

    async with _client_as(member_user) as client:
        created = await client.post("/api/v1/reservations", json={"book_id": book_id})
        reservation_id = created.json()["id"]

        await client.delete(f"/api/v1/reservations/{reservation_id}")
        second_cancel = await client.delete(f"/api/v1/reservations/{reservation_id}")

    assert second_cancel.status_code == 404


async def test_cancel_another_members_reservation_is_not_found(member_user, librarian_user):
    other_member = await _make_user(Role.MEMBER)
    book_id = await _create_book(librarian_user, total_copies=1)

    async with _client_as(member_user) as client:
        created = await client.post("/api/v1/reservations", json={"book_id": book_id})
        reservation_id = created.json()["id"]

    async with _client_as(other_member) as client:
        response = await client.delete(f"/api/v1/reservations/{reservation_id}")

    assert response.status_code == 404


async def test_first_in_line_is_position_one_with_zero_day_eta(member_user, librarian_user):
    book_id = await _create_book(librarian_user, total_copies=1)

    async with _client_as(member_user) as client:
        created = await client.post("/api/v1/reservations", json={"book_id": book_id})

    assert created.json()["queue_position"] == 1
    assert created.json()["eta_days"] == 0


async def test_second_in_line_has_unknown_eta_before_any_copy_is_loaned_out(
    member_user, librarian_user
):
    other_member = await _make_user(Role.MEMBER)
    book_id = await _create_book(librarian_user, total_copies=1)

    async with _client_as(other_member) as client:
        await client.post("/api/v1/reservations", json={"book_id": book_id})

    async with _client_as(member_user) as client:
        second = await client.post("/api/v1/reservations", json={"book_id": book_id})

    # 1 copy, 2 pending requests, but nobody has actually borrowed it yet (only manager
    # approval creates a loan) — there's no due date to count down from.
    assert second.json()["queue_position"] == 2
    assert second.json()["eta_days"] is None


async def test_second_in_line_eta_matches_the_active_loans_due_date(member_user, librarian_user):
    manager = await _make_user(Role.MANAGER)
    other_member = await _make_user(Role.MEMBER)
    book_id = await _create_book(librarian_user, total_copies=2)

    async with _client_as(manager) as client:
        await client.post("/api/v1/loans", json={"book_id": book_id, "member_id": other_member.id})

    third_member = await _make_user(Role.MEMBER)
    async with _client_as(third_member) as client:
        await client.post("/api/v1/reservations", json={"book_id": book_id})

    async with _client_as(member_user) as client:
        second = await client.post("/api/v1/reservations", json={"book_id": book_id})

    # 2 copies, 1 on loan (14-day period) -> 1 available now, 2 pending requests.
    # First request gets the free copy now; second has to wait for the loan's due date.
    assert second.json()["queue_position"] == 2
    assert second.json()["eta_days"] == 14


# --- One active reservation per member per book -------------------------------------
# A member shouldn't be able to stack requests for the same book (two queue slots for
# one reader), but once their copy is nearly due they can queue the next borrow.


async def _approve(manager, reservation_id: str, *, duration_days: int = 10) -> None:
    async with _client_as(manager) as client:
        response = await client.post(
            f"/api/v1/manager/reservations/{reservation_id}/approve",
            json={"duration_days": duration_days},
        )
    assert response.status_code == 200


async def test_reserving_the_same_book_twice_conflicts(member_user, librarian_user):
    book_id = await _create_book(librarian_user, total_copies=2)

    async with _client_as(member_user) as client:
        first = await client.post("/api/v1/reservations", json={"book_id": book_id})
        second = await client.post("/api/v1/reservations", json={"book_id": book_id})

    assert first.status_code == 201
    # 2 copies and none on loan, so availability isn't what's rejecting this.
    assert second.status_code == 409
    assert second.json()["detail"] == "You already have this book reserved or on loan"


async def test_concurrent_duplicate_reservations_create_only_one(member_user, librarian_user):
    book_id = await _create_book(librarian_user, total_copies=2)

    async def reserve():
        async with _client_as(member_user) as client:
            return await client.post("/api/v1/reservations", json={"book_id": book_id})

    responses = await asyncio.gather(reserve(), reserve())

    assert sorted(response.status_code for response in responses) == [201, 409]
    saved = await prisma.reservation.count(
        where={"memberId": member_user.id, "bookId": book_id, "status": "pending"}
    )
    assert saved == 1


async def test_another_member_can_still_reserve_the_same_book(member_user, librarian_user):
    """The limit is per member — it must not block the shared queue."""
    book_id = await _create_book(librarian_user, total_copies=2)
    other_member = await _make_user(Role.MEMBER)

    async with _client_as(member_user) as client:
        await client.post("/api/v1/reservations", json={"book_id": book_id})

    async with _client_as(other_member) as client:
        response = await client.post("/api/v1/reservations", json={"book_id": book_id})

    assert response.status_code == 201


async def test_cannot_reserve_a_book_the_member_still_has_on_loan(member_user, librarian_user):
    manager = await _make_user(Role.MANAGER)
    book_id = await _create_book(librarian_user, total_copies=2)

    async with _client_as(member_user) as client:
        created = await client.post("/api/v1/reservations", json={"book_id": book_id})
    await _approve(manager, created.json()["id"], duration_days=10)

    async with _client_as(member_user) as client:
        response = await client.post("/api/v1/reservations", json={"book_id": book_id})

    assert response.status_code == 409
    assert response.json()["detail"] == "You already have this book reserved or on loan"


async def test_can_reserve_again_once_the_loan_is_near_its_due_date(member_user, librarian_user):
    manager = await _make_user(Role.MANAGER)
    book_id = await _create_book(librarian_user, total_copies=2)

    async with _client_as(member_user) as client:
        created = await client.post("/api/v1/reservations", json={"book_id": book_id})
    await _approve(manager, created.json()["id"], duration_days=10)

    # Pull the due date inside the due-soon window the reminder job uses.
    loan = await prisma.loan.find_first(
        where={"memberId": member_user.id, "bookId": book_id, "returnedAt": None}
    )
    await prisma.loan.update(
        where={"id": loan.id}, data={"dueDate": datetime.now(UTC) + timedelta(days=1)}
    )

    async with _client_as(member_user) as client:
        response = await client.post("/api/v1/reservations", json={"book_id": book_id})

    assert response.status_code == 201


async def test_can_reserve_again_after_returning_the_book(member_user, librarian_user):
    """The reservation row stays "approved" after a return, so status alone must not block."""
    manager = await _make_user(Role.MANAGER)
    book_id = await _create_book(librarian_user, total_copies=2)

    async with _client_as(member_user) as client:
        created = await client.post("/api/v1/reservations", json={"book_id": book_id})
    await _approve(manager, created.json()["id"], duration_days=10)

    loan = await prisma.loan.find_first(
        where={"memberId": member_user.id, "bookId": book_id, "returnedAt": None}
    )
    async with _client_as(manager) as client:
        returned = await client.post(f"/api/v1/loans/{loan.id}/return")
    assert returned.status_code == 200

    async with _client_as(member_user) as client:
        response = await client.post("/api/v1/reservations", json={"book_id": book_id})

    assert response.status_code == 201


async def test_cancelling_a_request_frees_the_member_to_reserve_again(member_user, librarian_user):
    book_id = await _create_book(librarian_user, total_copies=2)

    async with _client_as(member_user) as client:
        created = await client.post("/api/v1/reservations", json={"book_id": book_id})
        await client.delete(f"/api/v1/reservations/{created.json()['id']}")
        response = await client.post("/api/v1/reservations", json={"book_id": book_id})

    assert response.status_code == 201
