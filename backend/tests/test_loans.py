import asyncio
import os
import uuid
from datetime import UTC, datetime, timedelta

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

TEST_EMAIL_DOMAIN = "@loans-test.example.com"
TEST_BOOK_TITLE_PREFIX = "Loans Test Book"


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
    await prisma.loan.delete_many(where={"member": domain_filter})
    await prisma.notification.delete_many(where={"user": domain_filter})
    # Audit entries reference the actor with no cascade, so they have to go
    # before the users do (role changes, bans and fine settlement all log now).
    await prisma.auditlogentry.delete_many(
        where={"actor": {"email": {"endswith": TEST_EMAIL_DOMAIN}}}
    )
    await prisma.user.delete_many(where=domain_filter)
    await prisma.book.delete_many(where={"title": {"startswith": TEST_BOOK_TITLE_PREFIX}})
    await prisma.disconnect()


@pytest_asyncio.fixture
async def it_head_user():
    return await _make_user(Role.IT_HEAD)


@pytest_asyncio.fixture
async def member_user():
    return await _make_user(Role.MEMBER)


@pytest_asyncio.fixture
async def book():
    return await prisma.book.create(
        data={
            "title": f"{TEST_BOOK_TITLE_PREFIX} {uuid.uuid4().hex[:8]}",
            "author": "Author",
            "category": "Fiction",
            "totalCopies": 1,
        }
    )


def _client_as(user) -> AsyncClient:
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _anon_client() -> AsyncClient:
    app = create_app()
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_create_loan_requires_authentication():
    """Test Case 1: Create Loan Requires Authentication"""

    async with _anon_client() as client:
        response = await client.post(
            "/api/v1/loans", json={"book_id": str(uuid.uuid4()), "member_id": str(uuid.uuid4())}
        )

    print("\nCreate Loan Response:", response.status_code, response.text)

    assert response.status_code == 401


async def test_member_cannot_create_a_loan(member_user, book):
    """Test Case 2: Create Loan Forbidden (member role)"""

    async with _client_as(member_user) as client:
        response = await client.post(
            "/api/v1/loans", json={"book_id": book.id, "member_id": member_user.id}
        )

    print("\nCreate Loan Response:", response.status_code, response.text)

    assert response.status_code == 403


async def test_it_head_can_create_a_loan(it_head_user, member_user, book):
    """Test Case 8: Create Loan Success (as IT-Head)"""

    async with _client_as(it_head_user) as client:
        response = await client.post(
            "/api/v1/loans", json={"book_id": book.id, "member_id": member_user.id}
        )

    print("\nCreate Loan Response:", response.status_code, response.text)

    assert response.status_code == 201
    body = response.json()
    assert body["book_title"] == book.title
    assert body["member_name"] == member_user.fullName
    assert body["status"] == "active"
    assert body["days_late"] == 0
    assert body["fine_amount"] == 0


async def test_create_loan_for_missing_book_returns_404(it_head_user, member_user):
    """Test Case 4: Create Loan Missing Book"""

    async with _client_as(it_head_user) as client:
        response = await client.post(
            "/api/v1/loans", json={"book_id": str(uuid.uuid4()), "member_id": member_user.id}
        )

    print("\nCreate Loan Response:", response.status_code, response.text)

    assert response.status_code == 404


async def test_create_loan_rejects_when_all_copies_are_active(it_head_user, member_user, book):
    another_member = await _make_user(Role.MEMBER)
    async with _client_as(it_head_user) as client:
        first = await client.post(
            "/api/v1/loans", json={"book_id": book.id, "member_id": member_user.id}
        )
        second = await client.post(
            "/api/v1/loans", json={"book_id": book.id, "member_id": another_member.id}
        )

    assert first.status_code == 201
    assert second.status_code == 409


async def test_loan_history_paginates(it_head_user, member_user, book):
    async with _client_as(it_head_user) as client:
        await client.post("/api/v1/loans", json={"book_id": book.id, "member_id": member_user.id})
        response = await client.get("/api/v1/loans/history?page=1&page_size=1")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1
    assert body["page"] == 1
    assert body["page_size"] == 1
    assert len(body["items"]) == 1


async def test_overdue_loan_appears_in_fines_with_computed_fine(it_head_user, member_user, book):
    """Test Case 9: Overdue Loan Shows Computed Fine (₹50/day)"""

    overdue_loan = await prisma.loan.create(
        data={
            "bookId": book.id,
            "memberId": member_user.id,
            "dueDate": datetime.now(UTC) - timedelta(days=5),
            "createdById": it_head_user.id,
        }
    )
    async with _client_as(it_head_user) as client:
        response = await client.get("/api/v1/loans/fines")
    entry = next(row for row in response.json() if row["id"] == overdue_loan.id)
    print("\nLoans Fines Response:", response.status_code, entry)
    assert response.status_code == 200
    assert entry["status"] == "overdue"
    assert entry["days_late"] == 5
    assert entry["fine_amount"] == 250
    assert entry["fine_paid"] is False


async def test_returning_a_loan_marks_it_returned(it_head_user, member_user, book):
    async with _client_as(it_head_user) as client:
        created = await client.post(
            "/api/v1/loans", json={"book_id": book.id, "member_id": member_user.id}
        )
        response = await client.post(f"/api/v1/loans/{created.json()['id']}/return")

    assert response.status_code == 200
    assert response.json()["status"] == "returned"
    assert response.json()["returned_at"] is not None


async def test_returning_an_already_returned_loan_conflicts(it_head_user, member_user, book):
    async with _client_as(it_head_user) as client:
        created = await client.post(
            "/api/v1/loans", json={"book_id": book.id, "member_id": member_user.id}
        )
        loan_id = created.json()["id"]
        first = await client.post(f"/api/v1/loans/{loan_id}/return")
        second = await client.post(f"/api/v1/loans/{loan_id}/return")

    assert first.status_code == 200
    assert second.status_code == 409


async def test_mark_fine_paid_updates_the_flag(it_head_user, member_user, book):
    loan = await prisma.loan.create(
        data={
            "bookId": book.id,
            "memberId": member_user.id,
            "dueDate": datetime.now(UTC) - timedelta(days=3),
            "createdById": it_head_user.id,
        }
    )

    async with _client_as(it_head_user) as client:
        response = await client.post(f"/api/v1/loans/{loan.id}/mark-fine-paid")

    assert response.status_code == 200
    assert response.json()["fine_paid"] is True


async def test_paid_overdue_loan_no_longer_counts_as_outstanding(it_head_user, member_user, book):
    loan = await prisma.loan.create(
        data={
            "bookId": book.id,
            "memberId": member_user.id,
            "dueDate": datetime.now(UTC) - timedelta(days=4),
            "createdById": it_head_user.id,
        }
    )

    async with _client_as(it_head_user) as client:
        before = await client.get("/api/v1/loans/fines")
        entry_before = next(row for row in before.json() if row["id"] == loan.id)
        assert entry_before["fine_paid"] is False

        await client.post(f"/api/v1/loans/{loan.id}/mark-fine-paid")

        after = await client.get("/api/v1/loans/fines")
        entry_after = next(row for row in after.json() if row["id"] == loan.id)

    assert entry_after["fine_paid"] is True


async def test_send_reminder_creates_a_notification_for_the_borrower(
    it_head_user, member_user, book
):
    loan = await prisma.loan.create(
        data={
            "bookId": book.id,
            "memberId": member_user.id,
            "dueDate": datetime.now(UTC) - timedelta(days=2),
            "createdById": it_head_user.id,
        }
    )

    async with _client_as(it_head_user) as client:
        response = await client.post(f"/api/v1/loans/{loan.id}/remind")
    assert response.status_code == 204

    async with _client_as(member_user) as client:
        notifications = await client.get("/api/v1/notifications/me")

    assert any(n["type"] == "fine-reminder" for n in notifications.json())


async def test_send_reminder_emails_the_borrower(it_head_user, member_user, book, monkeypatch):
    from app.modules.loans import service as loans_service

    loan = await prisma.loan.create(
        data={
            "bookId": book.id,
            "memberId": member_user.id,
            "dueDate": datetime.now(UTC) + timedelta(days=1),
            "createdById": it_head_user.id,
        }
    )
    sent: list[tuple[str, str, str]] = []

    async def _capture(to, subject, body):
        sent.append((to, subject, body))

    monkeypatch.setattr(loans_service, "send_email_async", _capture)

    async with _client_as(it_head_user) as client:
        await client.post(f"/api/v1/loans/{loan.id}/remind")

    assert len(sent) == 1
    to, subject, body = sent[0]
    assert to == member_user.email
    assert "due" in subject.lower()
    assert book.title in body
    assert "overdue" not in body.lower()  # not yet due — different wording


async def test_due_soon_reminders_skip_loans_outside_the_window(
    it_head_user, member_user, book, monkeypatch
):
    from app.modules.loans import service as loans_service

    due_soon = await prisma.loan.create(
        data={
            "bookId": book.id,
            "memberId": member_user.id,
            "dueDate": datetime.now(UTC) + timedelta(days=1),
            "createdById": it_head_user.id,
        }
    )
    far_out_book = await prisma.book.create(
        data={"title": f"{TEST_BOOK_TITLE_PREFIX} far", "author": "Author", "category": "Fiction"}
    )
    due_far_out = await prisma.loan.create(
        data={
            "bookId": far_out_book.id,
            "memberId": member_user.id,
            "dueDate": datetime.now(UTC) + timedelta(days=10),
            "createdById": it_head_user.id,
        }
    )
    reminded_ids: list[str] = []

    async def _fake_send_reminder(loan_id: str) -> None:
        reminded_ids.append(loan_id)

    monkeypatch.setattr(loans_service, "send_reminder", _fake_send_reminder)

    await loans_service.send_due_soon_reminders()

    assert due_soon.id in reminded_ids
    assert due_far_out.id not in reminded_ids


async def test_due_soon_reminders_do_not_renudge_a_recently_reminded_loan(
    it_head_user, member_user, book, monkeypatch
):
    """The sweep also runs on startup, so without a cooldown every restart re-emailed
    everyone currently due soon (and piled up duplicate notifications)."""
    from app.modules.loans import service as loans_service

    loan = await prisma.loan.create(
        data={
            "bookId": book.id,
            "memberId": member_user.id,
            "dueDate": datetime.now(UTC) + timedelta(days=1),
            "createdById": it_head_user.id,
        }
    )
    sent: list[str] = []

    async def _capture(to, subject, body):
        sent.append(to)

    monkeypatch.setattr(loans_service, "send_email_async", _capture)

    await loans_service.send_due_soon_reminders()
    first_pass = len(sent)
    await loans_service.send_due_soon_reminders()

    assert first_pass >= 1
    # Second sweep is a no-op for this loan — it was just reminded.
    assert len(sent) == first_pass

    refreshed = await prisma.loan.find_unique(where={"id": loan.id})
    assert refreshed.lastRemindedAt is not None


async def test_concurrent_reminder_sweeps_send_only_once(
    it_head_user, member_user, book, monkeypatch
):
    from app.modules.loans import service as loans_service

    loan = await prisma.loan.create(
        data={
            "bookId": book.id,
            "memberId": member_user.id,
            "dueDate": datetime.now(UTC) + timedelta(days=1),
            "createdById": it_head_user.id,
        }
    )
    sent: list[str] = []

    async def _capture(loan_id: str) -> None:
        await asyncio.sleep(0.02)
        if loan_id == loan.id:
            sent.append(loan_id)

    monkeypatch.setattr(loans_service, "send_reminder", _capture)

    await asyncio.gather(
        loans_service.send_due_soon_reminders(),
        loans_service.send_due_soon_reminders(),
    )

    assert sent == [loan.id]


async def test_a_stale_reminder_lets_the_loan_be_nudged_again(
    it_head_user, member_user, book, monkeypatch
):
    from app.modules.loans import service as loans_service

    loan = await prisma.loan.create(
        data={
            "bookId": book.id,
            "memberId": member_user.id,
            "dueDate": datetime.now(UTC) + timedelta(days=1),
            "createdById": it_head_user.id,
            "lastRemindedAt": datetime.now(UTC) - timedelta(days=2),
        }
    )
    reminded_ids: list[str] = []

    async def _fake_send_reminder(loan_id: str) -> None:
        reminded_ids.append(loan_id)

    monkeypatch.setattr(loans_service, "send_reminder", _fake_send_reminder)

    await loans_service.send_due_soon_reminders()

    assert loan.id in reminded_ids
