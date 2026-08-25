import os
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

os.environ["APP_ENV"] = "test"

import pytest_asyncio
import razorpay
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.core.constants import Role
from app.core.security import hash_password
from app.db.prisma import prisma
from app.main import create_app
from app.modules.members import repository
from app.modules.payments import service as payments_service

os.environ.setdefault("DATABASE_URL", get_settings().database_url)

TEST_EMAIL_DOMAIN = "@payments-test.example.com"


def _unique_email() -> str:
    return f"{uuid.uuid4().hex}{TEST_EMAIL_DOMAIN}"


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    await prisma.connect()
    yield
    domain_filter = {"email": {"endswith": TEST_EMAIL_DOMAIN}}
    await prisma.payment.delete_many(where={"user": domain_filter})
    await prisma.auditlogentry.delete_many(where={"actor": domain_filter})
    await prisma.coupon.delete_many(where={"createdBy": domain_filter})
    await prisma.user.delete_many(where=domain_filter)
    await prisma.disconnect()


@pytest_asyncio.fixture
async def member_user():
    role = await repository.upsert_role(Role.MEMBER)
    return await repository.create_member(
        email=_unique_email(),
        password_hash=hash_password("Password123!"),
        full_name="Payer",
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
        full_name="Coupon Admin",
        phone=None,
        avatar_url=None,
        role_id=role.id,
    )


@pytest_asyncio.fixture
async def client():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


async def test_create_payment_requires_authentication(client):
    response = await client.post("/api/v1/payments", json={"amount": 499, "label": "1 Month"})

    assert response.status_code == 401


async def test_create_payment_records_it_for_the_current_user(client, member_user):
    login = await client.post(
        "/api/v1/auth/login", json={"email": member_user.email, "password": "Password123!"}
    )
    token = login.json()["access_token"]

    response = await client.post(
        "/api/v1/payments",
        json={"amount": 499, "label": "1 Month — ₹499"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["amount"] == 499
    assert body["label"] == "1 Month — ₹499"
    assert body["status"] == "success"


async def test_direct_payment_recording_is_disabled_outside_tests(client, member_user, monkeypatch):
    login = await client.post(
        "/api/v1/auth/login", json={"email": member_user.email, "password": "Password123!"}
    )
    settings = get_settings()
    monkeypatch.setattr(settings, "app_env", "production")

    response = await client.post(
        "/api/v1/payments",
        json={"amount": 1, "label": "Forged", "plan_months": 120},
        headers={"Authorization": f"Bearer {login.json()['access_token']}"},
    )

    assert response.status_code == 404


async def test_create_payment_rejects_non_positive_amount(client, member_user):
    login = await client.post(
        "/api/v1/auth/login", json={"email": member_user.email, "password": "Password123!"}
    )
    token = login.json()["access_token"]

    response = await client.post(
        "/api/v1/payments",
        json={"amount": 0, "label": "Free?"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 422


async def test_list_my_payments_requires_authentication(client):
    response = await client.get("/api/v1/payments/me")

    assert response.status_code == 401


async def test_list_my_payments_returns_only_the_caller_s_own_payments(
    client, member_user, admin_user
):
    """Test Case: Payment List Returns Only Own Payments"""

    member_headers = await _login(client, member_user)
    admin_headers = await _login(client, admin_user)

    await client.post(
        "/api/v1/payments", json={"amount": 499, "label": "1 Month"}, headers=member_headers
    )
    await client.post(
        "/api/v1/payments", json={"amount": 999, "label": "3 Months"}, headers=admin_headers
    )
    response = await client.get("/api/v1/payments/me", headers=member_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["amount"] == 499
    assert body["items"][0]["label"] == "1 Month"


async def test_list_my_payments_orders_newest_first(client, member_user):
    member_headers = await _login(client, member_user)

    await client.post(
        "/api/v1/payments", json={"amount": 100, "label": "First"}, headers=member_headers
    )
    await client.post(
        "/api/v1/payments", json={"amount": 200, "label": "Second"}, headers=member_headers
    )

    response = await client.get("/api/v1/payments/me", headers=member_headers)

    labels = [p["label"] for p in response.json()["items"]]
    assert labels.index("Second") < labels.index("First")


async def test_list_my_payments_paginates(client, member_user):
    member_headers = await _login(client, member_user)
    for label in ("First", "Second", "Third"):
        await client.post(
            "/api/v1/payments", json={"amount": 100, "label": label}, headers=member_headers
        )

    page = await client.get("/api/v1/payments/me?page=1&page_size=2", headers=member_headers)

    assert page.status_code == 200
    body = page.json()
    assert body["total"] == 3
    assert body["page"] == 1
    assert body["page_size"] == 2
    assert len(body["items"]) == 2


async def test_membership_requires_authentication(client):
    response = await client.get("/api/v1/payments/me/membership")

    assert response.status_code == 401


async def test_membership_is_null_with_no_plan_payments(client, member_user):
    login = await client.post(
        "/api/v1/auth/login", json={"email": member_user.email, "password": "Password123!"}
    )
    token = login.json()["access_token"]

    response = await client.get(
        "/api/v1/payments/me/membership", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    assert response.json() is None


async def test_membership_ignores_fine_payments_without_plan_months(client, member_user):
    login = await client.post(
        "/api/v1/auth/login", json={"email": member_user.email, "password": "Password123!"}
    )
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    await client.post(
        "/api/v1/payments", json={"amount": 15, "label": "Fine owed"}, headers=headers
    )

    response = await client.get("/api/v1/payments/me/membership", headers=headers)

    assert response.status_code == 200
    assert response.json() is None


async def test_membership_reflects_latest_plan_payment(client, member_user):
    login = await client.post(
        "/api/v1/auth/login", json={"email": member_user.email, "password": "Password123!"}
    )
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    await client.post(
        "/api/v1/payments",
        json={"amount": 499, "label": "1 Month — ₹499", "plan_months": 1},
        headers=headers,
    )

    response = await client.get("/api/v1/payments/me/membership", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["plan_label"] == "1 Month — ₹499"
    assert body["is_active"] is True


async def test_early_membership_renewal_preserves_remaining_term(client, member_user):
    login = await client.post(
        "/api/v1/auth/login", json={"email": member_user.email, "password": "Password123!"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    for label in ("First month", "Renewal month"):
        await client.post(
            "/api/v1/payments",
            json={"amount": 499, "label": label, "plan_months": 1},
            headers=headers,
        )

    response = await client.get("/api/v1/payments/me/membership", headers=headers)
    expires_at = response.json()["expires_at"]
    assert expires_at is not None
    assert datetime.fromisoformat(expires_at.replace("Z", "+00:00")) > datetime.now(
        UTC
    ) + timedelta(days=50)


@pytest_asyncio.fixture
async def manager_user():
    role = await repository.upsert_role(Role.MANAGER)
    return await repository.create_member(
        email=_unique_email(),
        password_hash=hash_password("Password123!"),
        full_name="Front Desk Manager",
        phone=None,
        avatar_url=None,
        role_id=role.id,
    )


async def test_pay_at_library_uses_server_fine_balance(
    client, member_user, manager_user, monkeypatch
):
    async def outstanding_loans(member_id: str):
        assert member_id == member_user.id
        return [
            SimpleNamespace(fine_amount=275, fine_paid=False),
            SimpleNamespace(fine_amount=40, fine_paid=True),
        ]

    monkeypatch.setattr(payments_service.loans_service, "list_my_loans", outstanding_loans)
    login = await client.post(
        "/api/v1/auth/login", json={"email": member_user.email, "password": "Password123!"}
    )
    token = login.json()["access_token"]

    response = await client.post(
        "/api/v1/payments/pay-at-library",
        json={"amount": 1, "label": "Forged description"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 204
    notification = await prisma.notification.find_first(
        where={"userId": manager_user.id, "type": "payment-pending"}
    )
    assert notification is not None
    assert member_user.fullName in notification.message
    assert "275" in notification.message
    assert "Forged" not in notification.message


async def test_pay_at_library_rejects_request_without_outstanding_fines(
    client, member_user, monkeypatch
):
    async def no_outstanding_loans(member_id: str):
        assert member_id == member_user.id
        return []

    monkeypatch.setattr(payments_service.loans_service, "list_my_loans", no_outstanding_loans)
    headers = await _login(client, member_user)

    response = await client.post(
        "/api/v1/payments/pay-at-library",
        json={"amount": 99999, "label": "Forged"},
        headers=headers,
    )

    assert response.status_code == 409


async def _login(client, user) -> dict:
    login = await client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": "Password123!"}
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _generate_coupon(client, headers, discount_percent=20, max_uses=1) -> dict:
    response = await client.post(
        "/api/v1/coupons",
        json={"discount_percent": discount_percent, "max_uses": max_uses},
        headers=headers,
    )
    return response.json()


async def test_payment_with_a_valid_coupon_applies_the_discount(client, member_user, admin_user):
    admin_headers = await _login(client, admin_user)
    coupon = await _generate_coupon(client, admin_headers, discount_percent=20, max_uses=1)
    member_headers = await _login(client, member_user)

    response = await client.post(
        "/api/v1/payments",
        json={"amount": 500, "label": "Test", "coupon_code": coupon["code"]},
        headers=member_headers,
    )

    assert response.status_code == 201
    assert response.json()["amount"] == 400

    listed = await client.get("/api/v1/coupons", headers=admin_headers)
    updated = next(c for c in listed.json() if c["code"] == coupon["code"])
    assert updated["uses_count"] == 1


async def test_payment_with_an_unknown_coupon_code_fails(client, member_user):
    member_headers = await _login(client, member_user)

    response = await client.post(
        "/api/v1/payments",
        json={"amount": 500, "label": "Test", "coupon_code": "NOSUCHCODE"},
        headers=member_headers,
    )

    assert response.status_code == 404


async def test_payment_with_an_exhausted_coupon_fails(client, member_user, admin_user):
    admin_headers = await _login(client, admin_user)
    coupon = await _generate_coupon(client, admin_headers, discount_percent=10, max_uses=1)
    member_headers = await _login(client, member_user)

    first = await client.post(
        "/api/v1/payments",
        json={"amount": 100, "label": "Test", "coupon_code": coupon["code"]},
        headers=member_headers,
    )
    assert first.status_code == 201

    second = await client.post(
        "/api/v1/payments",
        json={"amount": 100, "label": "Test", "coupon_code": coupon["code"]},
        headers=member_headers,
    )
    assert second.status_code == 409


class _FakeOrderResource:
    def __init__(self):
        self.created: dict | None = None

    def create(self, data: dict) -> dict:
        self.created = data
        return {"id": "order_fake123", "amount": data["amount"], "notes": data["notes"]}

    def fetch(self, order_id: str) -> dict:
        assert self.created is not None
        return {"id": order_id, "amount": self.created["amount"], "notes": self.created["notes"]}


class _FakeUtility:
    def __init__(self, *, should_fail: bool = False):
        self.should_fail = should_fail

    def verify_payment_signature(self, params: dict) -> bool:
        if self.should_fail:
            raise razorpay.errors.SignatureVerificationError("bad signature")
        return True


class _FakeRazorpayClient:
    def __init__(self, *, should_fail_signature: bool = False):
        self.order = _FakeOrderResource()
        self.utility = _FakeUtility(should_fail=should_fail_signature)


async def test_create_razorpay_order_requires_authentication(client):
    response = await client.post(
        "/api/v1/payments/razorpay/order", json={"amount": 499, "label": "1 Month"}
    )
    assert response.status_code == 401


async def test_create_razorpay_order_without_configured_keys_returns_503(
    client, member_user, monkeypatch
):
    settings = get_settings()
    monkeypatch.setattr(settings, "razorpay_key_id", "")
    monkeypatch.setattr(settings, "razorpay_key_secret", "")
    monkeypatch.setattr(payments_service, "get_settings", lambda: settings)
    member_headers = await _login(client, member_user)

    response = await client.post(
        "/api/v1/payments/razorpay/order",
        json={"amount": 499, "label": "1 Month"},
        headers=member_headers,
    )
    assert response.status_code == 503


async def test_create_razorpay_order_returns_order_details(client, member_user, monkeypatch):
    fake_client = _FakeRazorpayClient()
    monkeypatch.setattr(payments_service, "_get_client", lambda: fake_client)
    member_headers = await _login(client, member_user)

    response = await client.post(
        "/api/v1/payments/razorpay/order",
        json={"amount": 499, "label": "1 Month — ₹499", "plan_months": 1},
        headers=member_headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["order_id"] == "order_fake123"
    assert body["amount"] == 499
    assert body["currency"] == "INR"
    assert fake_client.order.created["amount"] == 49900


async def test_create_razorpay_order_applies_coupon_before_charging(
    client, member_user, admin_user, monkeypatch
):
    admin_headers = await _login(client, admin_user)
    coupon = await _generate_coupon(client, admin_headers, discount_percent=20, max_uses=1)
    fake_client = _FakeRazorpayClient()
    monkeypatch.setattr(payments_service, "_get_client", lambda: fake_client)
    settled_amounts: list[int] = []

    async def capture_settlement(member_id: str, amount: int, *, client=None):
        del client
        assert member_id == member_user.id
        settled_amounts.append(amount)

    monkeypatch.setattr(
        payments_service.loans_service, "settle_fines_for_member", capture_settlement
    )
    member_headers = await _login(client, member_user)

    response = await client.post(
        "/api/v1/payments/razorpay/order",
        json={"amount": 500, "label": "Test", "coupon_code": coupon["code"]},
        headers=member_headers,
    )

    assert response.status_code == 201
    assert response.json()["amount"] == 400
    assert fake_client.order.created["amount"] == 40000

    listed_before_payment = await client.get("/api/v1/coupons", headers=admin_headers)
    before = next(c for c in listed_before_payment.json() if c["code"] == coupon["code"])
    assert before["uses_count"] == 0

    verified = await client.post(
        "/api/v1/payments/razorpay/verify",
        json={
            "razorpay_order_id": "order_fake123",
            "razorpay_payment_id": f"pay_coupon_{uuid.uuid4().hex}",
            "razorpay_signature": "sig_fake123",
        },
        headers=member_headers,
    )
    assert verified.status_code == 200
    assert settled_amounts == [500]

    listed_after_payment = await client.get("/api/v1/coupons", headers=admin_headers)
    after = next(c for c in listed_after_payment.json() if c["code"] == coupon["code"])
    assert after["uses_count"] == 1


async def test_production_fine_coupon_settles_original_server_balance(
    client, member_user, admin_user, monkeypatch
):
    settings = get_settings()
    monkeypatch.setattr(settings, "app_env", "production")
    admin_headers = await _login(client, admin_user)
    member_headers = await _login(client, member_user)
    coupon = await _generate_coupon(client, admin_headers, discount_percent=20, max_uses=1)
    fake_client = _FakeRazorpayClient()
    monkeypatch.setattr(payments_service, "_get_client", lambda: fake_client)

    async def outstanding_loans(member_id: str):
        assert member_id == member_user.id
        return [SimpleNamespace(fine_amount=500, fine_paid=False)]

    settled_amounts: list[int] = []

    async def capture_settlement(member_id: str, amount: int, *, client=None):
        del client
        assert member_id == member_user.id
        settled_amounts.append(amount)

    monkeypatch.setattr(payments_service.loans_service, "list_my_loans", outstanding_loans)
    monkeypatch.setattr(
        payments_service.loans_service, "settle_fines_for_member", capture_settlement
    )

    order = await client.post(
        "/api/v1/payments/razorpay/order",
        json={"amount": 1, "label": "Forged", "coupon_code": coupon["code"]},
        headers=member_headers,
    )
    assert order.status_code == 201
    assert order.json()["amount"] == 400
    assert order.json()["label"] == "Outstanding library fines"

    verified = await client.post(
        "/api/v1/payments/razorpay/verify",
        json={
            "razorpay_order_id": "order_fake123",
            "razorpay_payment_id": f"pay_production_fine_{uuid.uuid4().hex}",
            "razorpay_signature": "sig_fake123",
        },
        headers=member_headers,
    )

    assert verified.status_code == 200
    assert verified.json()["amount"] == 400
    assert settled_amounts == [500]


async def test_verify_razorpay_payment_rejects_bad_signature(client, member_user, monkeypatch):
    fake_client = _FakeRazorpayClient(should_fail_signature=True)
    monkeypatch.setattr(payments_service, "_get_client", lambda: fake_client)
    member_headers = await _login(client, member_user)

    response = await client.post(
        "/api/v1/payments/razorpay/verify",
        json={
            "razorpay_order_id": "order_fake123",
            "razorpay_payment_id": "pay_fake123",
            "razorpay_signature": "not-a-real-signature",
        },
        headers=member_headers,
    )

    assert response.status_code == 400


async def test_verify_razorpay_payment_rejects_another_members_order(
    client, member_user, admin_user, monkeypatch
):
    fake_client = _FakeRazorpayClient()
    monkeypatch.setattr(payments_service, "_get_client", lambda: fake_client)
    admin_headers = await _login(client, admin_user)
    member_headers = await _login(client, member_user)

    await client.post(
        "/api/v1/payments/razorpay/order",
        json={"amount": 499, "label": "1 Month"},
        headers=member_headers,
    )

    response = await client.post(
        "/api/v1/payments/razorpay/verify",
        json={
            "razorpay_order_id": "order_fake123",
            "razorpay_payment_id": "pay_fake123",
            "razorpay_signature": "irrelevant-since-fake-verifies-anything-valid",
        },
        headers=admin_headers,
    )

    assert response.status_code == 403


async def test_verify_razorpay_payment_records_a_real_payment(client, member_user, monkeypatch):
    fake_client = _FakeRazorpayClient()
    monkeypatch.setattr(payments_service, "_get_client", lambda: fake_client)
    member_headers = await _login(client, member_user)

    await client.post(
        "/api/v1/payments/razorpay/order",
        json={"amount": 499, "label": "1 Month — ₹499", "plan_months": 1},
        headers=member_headers,
    )

    response = await client.post(
        "/api/v1/payments/razorpay/verify",
        json={
            "razorpay_order_id": "order_fake123",
            "razorpay_payment_id": "pay_fake123",
            "razorpay_signature": "sig_fake123",
        },
        headers=member_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["amount"] == 499
    assert body["label"] == "1 Month — ₹499"
    assert body["status"] == "success"

    membership = await client.get("/api/v1/payments/me/membership", headers=member_headers)
    assert membership.json()["is_active"] is True


async def test_verify_razorpay_payment_is_idempotent_on_retry(client, member_user, monkeypatch):
    # A client retry (double-click, network retry, resubmitted form) re-sends the same
    # order/payment/signature triple, which re-verifies successfully every time — the
    # fix under test is that this must not record a second payment or settle fines
    # twice, not just that it doesn't crash.
    fake_client = _FakeRazorpayClient()
    monkeypatch.setattr(payments_service, "_get_client", lambda: fake_client)
    member_headers = await _login(client, member_user)

    await client.post(
        "/api/v1/payments/razorpay/order",
        json={"amount": 499, "label": "1 Month — ₹499", "plan_months": 1},
        headers=member_headers,
    )
    # A payment_id unique to this test, not the "pay_fake123" other tests in this file
    # reuse — the new uniqueness constraint under test would otherwise collide with
    # whichever of those tests already claimed it in this run.
    verify_payload = {
        "razorpay_order_id": "order_fake123",
        "razorpay_payment_id": f"pay_idempotent_{uuid.uuid4().hex}",
        "razorpay_signature": "sig_fake123",
    }

    first = await client.post(
        "/api/v1/payments/razorpay/verify", json=verify_payload, headers=member_headers
    )
    second = await client.post(
        "/api/v1/payments/razorpay/verify", json=verify_payload, headers=member_headers
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]

    history = await client.get("/api/v1/payments/me", headers=member_headers)
    matching = [p for p in history.json()["items"] if p["label"] == "1 Month — ₹499"]
    assert len(matching) == 1
