"""Cross-module integration tests.

Unlike the per-module test files, these don't override `get_current_user` or seed
state directly through repositories — every actor logs in for real over HTTP and
carries a genuine JWT through the whole journey, the same way a browser session
would. Each test exercises several modules in one continuous flow so a regression
in how they hand data to each other (not just within one module) gets caught.
"""

import os
import uuid
from datetime import UTC, datetime, timedelta

os.environ["APP_ENV"] = "test"

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.core.constants import Role
from app.core.security import hash_password
from app.db.prisma import prisma
from app.main import create_app
from app.modules.members import repository
from app.modules.payments import service as payments_service

os.environ.setdefault("DATABASE_URL", get_settings().database_url)

TEST_EMAIL_DOMAIN = "@journey-test.example.com"
TEST_PLAN_ID_PREFIX = "jy-"
TEST_BOOK_TITLE_PREFIX = "Journey Test Book"


def _unique_email() -> str:
    return f"{uuid.uuid4().hex}{TEST_EMAIL_DOMAIN}"


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    await prisma.connect()
    yield
    domain_filter = {"email": {"endswith": TEST_EMAIL_DOMAIN}}
    await prisma.loan.delete_many(where={"member": domain_filter})
    await prisma.notification.delete_many(where={"user": domain_filter})
    await prisma.payment.delete_many(where={"user": domain_filter})
    await prisma.auditlogentry.delete_many(where={"actor": domain_filter})
    await prisma.user.delete_many(where=domain_filter)
    await prisma.book.delete_many(where={"title": {"startswith": TEST_BOOK_TITLE_PREFIX}})
    await prisma.pricingplan.delete_many(where={"planId": {"startswith": TEST_PLAN_ID_PREFIX}})
    await prisma.disconnect()


@pytest_asyncio.fixture
async def client():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


@pytest_asyncio.fixture
async def staff_user():
    """A manager who both gets pay-at-library notifications and can issue loans,
    created directly since staff accounts come from an admin, not self-signup."""
    role = await repository.upsert_role(Role.MANAGER)
    return await repository.create_member(
        email=_unique_email(),
        password_hash=hash_password("Password123!"),
        full_name="Front Desk Staff",
        phone=None,
        avatar_url=None,
        role_id=role.id,
    )


@pytest_asyncio.fixture
async def admin_user():
    role = await repository.upsert_role(Role.ADMIN)
    return await repository.create_member(
        email=_unique_email(),
        password_hash=hash_password("Password123!"),
        full_name="Journey Admin",
        phone=None,
        avatar_url=None,
        role_id=role.id,
    )


class _FakeOrderResource:
    def __init__(self):
        self.created: dict | None = None

    def create(self, data: dict) -> dict:
        self.created = data
        return {"id": "order_journey123", "amount": data["amount"], "notes": data["notes"]}

    def fetch(self, order_id: str) -> dict:
        assert self.created is not None
        return {"id": order_id, "amount": self.created["amount"], "notes": self.created["notes"]}


class _FakeUtility:
    def verify_payment_signature(self, params: dict) -> bool:
        return True


class _FakeRazorpayClient:
    def __init__(self):
        self.order = _FakeOrderResource()
        self.utility = _FakeUtility()


async def _register(client: AsyncClient, *, full_name: str) -> tuple[dict, str]:
    email = _unique_email()
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": full_name},
    )
    assert response.status_code == 201
    body = response.json()
    return body["user"], body["access_token"]


async def _login_headers(client: AsyncClient, email: str, password: str = "Password123!") -> dict:
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def test_registration_through_razorpay_payment_activates_membership_and_is_visible_to_admin(
    client, admin_user, monkeypatch
):
    fake_client = _FakeRazorpayClient()
    monkeypatch.setattr(payments_service, "_get_client", lambda: fake_client)

    user, access_token = await _register(client, full_name="New Journey Member")
    member_headers = {"Authorization": f"Bearer {access_token}"}

    plans_response = await client.get("/api/v1/pricing-plans")
    assert plans_response.status_code == 200

    plan_record = await prisma.pricingplan.create(
        data={
            "planId": f"{TEST_PLAN_ID_PREFIX}{uuid.uuid4().hex[:6]}",
            "months": 1,
            "price": 499,
            "savePercent": 0,
        }
    )
    try:
        order_response = await client.post(
            "/api/v1/payments/razorpay/order",
            json={"amount": plan_record.price, "label": "1 Month — ₹499", "plan_months": 1},
            headers=member_headers,
        )
        assert order_response.status_code == 201
        order = order_response.json()

        verify_response = await client.post(
            "/api/v1/payments/razorpay/verify",
            json={
                "razorpay_order_id": order["order_id"],
                "razorpay_payment_id": "pay_journey123",
                "razorpay_signature": "sig_journey123",
            },
            headers=member_headers,
        )
        assert verify_response.status_code == 200
        assert verify_response.json()["status"] == "success"

        membership_response = await client.get(
            "/api/v1/payments/me/membership", headers=member_headers
        )
        assert membership_response.status_code == 200
        assert membership_response.json()["is_active"] is True

        admin_headers = await _login_headers(client, admin_user.email)
        admin_members = await client.get("/api/v1/admin/members", headers=admin_headers)
        assert admin_members.status_code == 200
        member_row = next(row for row in admin_members.json()["items"] if row["id"] == user["id"])
        assert member_row["plan_is_active"] is True
        assert member_row["last_payment_amount"] == 499

        admin_payments = await client.get("/api/v1/admin/payments", headers=admin_headers)
        assert admin_payments.status_code == 200
        assert any(row["member_id"] == user["id"] for row in admin_payments.json()["items"])
    finally:
        await prisma.pricingplan.delete(where={"id": plan_record.id})


async def test_pay_at_library_notifies_staff_then_a_recorded_payment_and_loan_both_track_the_member(
    client, staff_user
):
    user, access_token = await _register(client, full_name="Walk-in Then Borrower")
    member_headers = {"Authorization": f"Bearer {access_token}"}

    # The member asks to pay in cash at the desk — this only pings staff; it's the
    # member's own follow-up POST /payments below that actually records the payment.
    pay_at_library_response = await client.post(
        "/api/v1/payments/pay-at-library",
        json={"amount": 1, "label": "Client text is ignored", "plan_months": 1},
        headers=member_headers,
    )
    assert pay_at_library_response.status_code == 204

    staff_headers = await _login_headers(client, staff_user.email)
    staff_notifications = await client.get("/api/v1/notifications/me", headers=staff_headers)
    assert any(
        n["type"] == "payment-pending" and user["full_name"] in n["message"]
        for n in staff_notifications.json()
    )

    payment_response = await client.post(
        "/api/v1/payments",
        json={"amount": 499, "label": "1 Month — ₹499", "plan_months": 1},
        headers=member_headers,
    )
    assert payment_response.status_code == 201

    membership_response = await client.get("/api/v1/payments/me/membership", headers=member_headers)
    assert membership_response.json()["is_active"] is True

    book = await prisma.book.create(
        data={
            "title": f"{TEST_BOOK_TITLE_PREFIX} {uuid.uuid4().hex[:8]}",
            "author": "Author",
            "category": "Fiction",
            "totalCopies": 1,
        }
    )
    staff_headers = await _login_headers(client, staff_user.email)

    loan_response = await client.post(
        "/api/v1/loans",
        json={"book_id": book.id, "member_id": user["id"]},
        headers=staff_headers,
    )
    assert loan_response.status_code == 201
    loan_id = loan_response.json()["id"]

    my_loans_response = await client.get("/api/v1/loans/me", headers=member_headers)
    assert my_loans_response.status_code == 200
    my_loan = next(row for row in my_loans_response.json() if row["id"] == loan_id)
    assert my_loan["book_title"] == book.title
    assert my_loan["status"] == "active"

    return_response = await client.post(f"/api/v1/loans/{loan_id}/return", headers=staff_headers)
    assert return_response.status_code == 200

    my_loans_after_return = await client.get("/api/v1/loans/me", headers=member_headers)
    returned_loan = next(row for row in my_loans_after_return.json() if row["id"] == loan_id)
    assert returned_loan["status"] == "returned"


async def _overdue_loan(member_id: str, staff_id: str, *, days_late: int):
    """A loan already past due, so LoanOut computes a fine of days_late * ₹50."""
    book = await prisma.book.create(
        data={
            "title": f"{TEST_BOOK_TITLE_PREFIX} {uuid.uuid4().hex[:8]}",
            "author": "Author",
            "category": "Fiction",
        }
    )
    return await prisma.loan.create(
        data={
            "bookId": book.id,
            "memberId": member_id,
            "dueDate": datetime.now(UTC) - timedelta(days=days_late),
            "createdById": staff_id,
        }
    )


async def test_paying_a_fine_clears_it_so_it_stops_showing_as_owed(client, staff_user):
    """The member dashboard/guardian card/IT-Head queue all derive "fine owed" from
    loan.fine_paid, so a recorded fine payment has to flip that or the fine shows as
    outstanding forever."""
    user, access_token = await _register(client, full_name="Fine Payer")
    member_headers = {"Authorization": f"Bearer {access_token}"}
    loan = await _overdue_loan(user["id"], staff_user.id, days_late=4)

    before = await client.get("/api/v1/loans/me", headers=member_headers)
    owed = next(row for row in before.json() if row["id"] == loan.id)
    assert owed["fine_amount"] == 200
    assert owed["fine_paid"] is False

    payment = await client.post(
        "/api/v1/payments",
        json={"amount": 200, "label": "Fine owed: ₹200"},
        headers=member_headers,
    )
    assert payment.status_code == 201

    after = await client.get("/api/v1/loans/me", headers=member_headers)
    settled = next(row for row in after.json() if row["id"] == loan.id)
    assert settled["fine_paid"] is True

    # And it's gone from the staff-facing outstanding-fines total too.
    staff_headers = await _login_headers(client, staff_user.email)
    fines = await client.get("/api/v1/loans/fines", headers=staff_headers)
    entry = next(row for row in fines.json() if row["id"] == loan.id)
    assert entry["fine_paid"] is True


async def test_paying_a_fine_through_razorpay_also_clears_it(client, staff_user, monkeypatch):
    fake_client = _FakeRazorpayClient()
    monkeypatch.setattr(payments_service, "_get_client", lambda: fake_client)

    user, access_token = await _register(client, full_name="Razorpay Fine Payer")
    member_headers = {"Authorization": f"Bearer {access_token}"}
    loan = await _overdue_loan(user["id"], staff_user.id, days_late=2)

    order = await client.post(
        "/api/v1/payments/razorpay/order",
        json={"amount": 100, "label": "Fine owed: ₹100"},
        headers=member_headers,
    )
    assert order.status_code == 201

    verify = await client.post(
        "/api/v1/payments/razorpay/verify",
        json={
            "razorpay_order_id": order.json()["order_id"],
            "razorpay_payment_id": "pay_fine123",
            "razorpay_signature": "sig_fine123",
        },
        headers=member_headers,
    )
    assert verify.status_code == 200

    after = await client.get("/api/v1/loans/me", headers=member_headers)
    assert next(row for row in after.json() if row["id"] == loan.id)["fine_paid"] is True


async def test_a_membership_payment_does_not_clear_outstanding_fines(client, staff_user):
    """Buying a plan is not paying a fine — only non-plan payments settle fines."""
    user, access_token = await _register(client, full_name="Plan Buyer With Fine")
    member_headers = {"Authorization": f"Bearer {access_token}"}
    loan = await _overdue_loan(user["id"], staff_user.id, days_late=3)

    payment = await client.post(
        "/api/v1/payments",
        json={"amount": 499, "label": "1 Month — ₹499", "plan_months": 1},
        headers=member_headers,
    )
    assert payment.status_code == 201

    after = await client.get("/api/v1/loans/me", headers=member_headers)
    assert next(row for row in after.json() if row["id"] == loan.id)["fine_paid"] is False


async def test_paying_less_than_a_fine_leaves_it_outstanding(client, staff_user):
    """A short payment must not wipe a larger fine — otherwise ₹1 clears ₹200."""
    user, access_token = await _register(client, full_name="Short Payer")
    member_headers = {"Authorization": f"Bearer {access_token}"}
    loan = await _overdue_loan(user["id"], staff_user.id, days_late=4)  # ₹200 owed

    payment = await client.post(
        "/api/v1/payments",
        json={"amount": 1, "label": "Fine owed: ₹200"},
        headers=member_headers,
    )
    assert payment.status_code == 201

    after = await client.get("/api/v1/loans/me", headers=member_headers)
    assert next(row for row in after.json() if row["id"] == loan.id)["fine_paid"] is False


async def test_unpaid_member_cannot_reach_staff_only_endpoints_after_their_own_login(client):
    """A member's real login token must not carry staff privileges into loans/admin —
    guards them across modules, not just within one router's own tests."""
    _, access_token = await _register(client, full_name="Should Stay A Member")
    member_headers = {"Authorization": f"Bearer {access_token}"}

    loans_list = await client.get("/api/v1/loans", headers=member_headers)
    assert loans_list.status_code == 403

    admin_members = await client.get("/api/v1/admin/members", headers=member_headers)
    assert admin_members.status_code == 403
