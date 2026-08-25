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

TEST_EMAIL_DOMAIN = "@admin-dashboard-test.example.com"


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
    await prisma.auditlogentry.delete_many(where={"actor": domain_filter})
    await prisma.expense.delete_many(where={"loggedBy": domain_filter})
    await prisma.payment.delete_many(where={"user": domain_filter})
    await prisma.readingprogress.delete_many(where={"member": domain_filter})
    await prisma.communitypost.delete_many(where={"author": domain_filter})
    await prisma.book.delete_many(where={"title": {"startswith": "Admin Members Test Book"}})
    await prisma.eventregistration.delete_many(where={"member": domain_filter})
    await prisma.event.delete_many(where={"title": {"startswith": "Admin Members Test Event"}})
    await prisma.user.delete_many(where=domain_filter)
    await prisma.disconnect()


@pytest_asyncio.fixture
async def admin_user():
    return await _make_user(Role.ADMIN)


@pytest_asyncio.fixture
async def manager_user():
    return await _make_user(Role.MANAGER)


@pytest_asyncio.fixture
async def member_user():
    return await _make_user(Role.MEMBER)


def _client_as(user) -> AsyncClient:
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _anon_client() -> AsyncClient:
    app = create_app()
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _get_dashboard(user) -> dict:
    async with _client_as(user) as client:
        response = await client.get("/api/v1/admin/dashboard")
    assert response.status_code == 200
    return response.json()


async def test_dashboard_requires_authentication():
    """Test Case 1: Dashboard Requires Authentication"""

    async with _anon_client() as client:
        response = await client.get("/api/v1/admin/dashboard")

    print("\nDashboard Response:", response.status_code, response.text)

    assert response.status_code == 401


async def test_dashboard_forbidden_for_member(member_user):
    """Test Case 2: Dashboard Forbidden (member role)"""

    async with _client_as(member_user) as client:
        response = await client.get("/api/v1/admin/dashboard")

    print("\nDashboard Response:", response.status_code, response.text)

    assert response.status_code == 403


async def test_dashboard_has_the_right_shape(admin_user):
    body = await _get_dashboard(admin_user)
    assert set(body.keys()) == {"stats", "cash_flow", "budget", "seat_status", "seat_occupancy"}
    assert len(body["cash_flow"]) == 4
    assert len(body["budget"]) == 4
    assert body["seat_status"]["total"] == 32
    assert len(body["seat_occupancy"]) == 12  # 9 AM - 8 PM


async def test_membership_payment_increases_revenue_and_membership_fees(admin_user, member_user):
    before = await _get_dashboard(admin_user)

    async with _client_as(member_user) as client:
        response = await client.post(
            "/api/v1/payments",
            json={"amount": 499, "label": "1 Month — ₹499", "plan_months": 1},
        )
    assert response.status_code == 201

    after = await _get_dashboard(admin_user)

    assert after["stats"]["revenue_mtd"] == before["stats"]["revenue_mtd"] + 499
    membership_before = next(s for s in before["cash_flow"] if s["source"] == "membershipFees")
    membership_after = next(s for s in after["cash_flow"] if s["source"] == "membershipFees")
    assert membership_after["amount"] == membership_before["amount"] + 499


async def test_fine_payment_increases_revenue_but_not_membership_fees(admin_user, member_user):
    before = await _get_dashboard(admin_user)

    async with _client_as(member_user) as client:
        response = await client.post(
            "/api/v1/payments", json={"amount": 20, "label": "Overdue fine"}
        )
    assert response.status_code == 201

    after = await _get_dashboard(admin_user)

    assert after["stats"]["revenue_mtd"] == before["stats"]["revenue_mtd"] + 20
    membership_before = next(s for s in before["cash_flow"] if s["source"] == "membershipFees")
    membership_after = next(s for s in after["cash_flow"] if s["source"] == "membershipFees")
    assert membership_after["amount"] == membership_before["amount"]
    fines_before = next(s for s in before["cash_flow"] if s["source"] == "finesCollected")
    fines_after = next(s for s in after["cash_flow"] if s["source"] == "finesCollected")
    assert fines_after["amount"] == fines_before["amount"] + 20


async def test_log_expense_requires_admin_role(member_user):
    """Test Case 4: Log Expense Requires Admin Role"""

    async with _client_as(member_user) as client:
        response = await client.post(
            "/api/v1/admin/expenses", json={"category": "marketing", "amount": 50}
        )

    print("\nLog Expense Response:", response.status_code, response.text)

    assert response.status_code == 403


async def test_log_expense_increases_expenses_and_budget_spent(admin_user):
    before = await _get_dashboard(admin_user)

    async with _client_as(admin_user) as client:
        response = await client.post(
            "/api/v1/admin/expenses", json={"category": "marketing", "amount": 150}
        )
    assert response.status_code == 201
    assert response.json()["category"] == "marketing"
    assert response.json()["amount"] == 150

    after = await _get_dashboard(admin_user)

    assert after["stats"]["expenses_mtd"] == before["stats"]["expenses_mtd"] + 150
    assert after["stats"]["net_profit_mtd"] == before["stats"]["net_profit_mtd"] - 150
    marketing_before = next(c for c in before["budget"] if c["category"] == "marketing")
    marketing_after = next(c for c in after["budget"] if c["category"] == "marketing")
    assert marketing_after["spent"] == marketing_before["spent"] + 150
    assert marketing_after["budgeted"] == marketing_before["budgeted"]


async def test_log_expense_rejects_non_positive_amount(admin_user):
    async with _client_as(admin_user) as client:
        response = await client.post(
            "/api/v1/admin/expenses", json={"category": "marketing", "amount": 0}
        )
    assert response.status_code == 422


async def test_log_expense_rejects_unknown_category(admin_user):
    async with _client_as(admin_user) as client:
        response = await client.post(
            "/api/v1/admin/expenses", json={"category": "not-a-category", "amount": 10}
        )
    assert response.status_code == 422


async def test_reports_require_admin_role(member_user):
    """Test Case 3: Reports Require Admin Role"""

    async with _client_as(member_user) as client:
        for path in (
            "/api/v1/admin/reports/revenue-by-plan",
            "/api/v1/admin/reports/profit-and-loss",
            "/api/v1/admin/reports/expense-breakdown",
            "/api/v1/admin/reports/membership-growth",
        ):
            response = await client.get(path)

            print(f"\n{path} Response:", response.status_code, response.text)

            assert response.status_code == 403


async def test_revenue_by_plan_groups_membership_payments_by_label(admin_user, member_user):
    # Unique label so this test's totals aren't polluted by other tests in this
    # module-scoped DB session that also log "1 Month" style plan payments.
    label = f"Test Plan {uuid.uuid4().hex[:8]}"
    async with _client_as(member_user) as client:
        await client.post(
            "/api/v1/payments", json={"amount": 499, "label": label, "plan_months": 1}
        )
        await client.post(
            "/api/v1/payments", json={"amount": 499, "label": label, "plan_months": 1}
        )
        # A fine payment (no plan_months) must not be counted in this report.
        await client.post("/api/v1/payments", json={"amount": 20, "label": "Overdue fine"})

    async with _client_as(admin_user) as client:
        response = await client.get("/api/v1/admin/reports/revenue-by-plan")

    assert response.status_code == 200
    body = response.json()
    item = next(i for i in body["items"] if i["label"] == label)
    assert item["amount"] == 998
    assert item["count"] == 2
    assert all(i["label"] != "Overdue fine" for i in body["items"])


async def test_profit_and_loss_reflects_current_month_activity(admin_user, member_user):
    async with _client_as(admin_user) as client:
        before_response = await client.get("/api/v1/admin/reports/profit-and-loss")
    this_month_before = before_response.json()["months"][-1]

    async with _client_as(member_user) as client:
        await client.post(
            "/api/v1/payments",
            json={"amount": 300, "label": "3 Months — ₹1349", "plan_months": 3},
        )
    async with _client_as(admin_user) as client:
        await client.post("/api/v1/admin/expenses", json={"category": "marketing", "amount": 100})
        response = await client.get("/api/v1/admin/reports/profit-and-loss")

    assert response.status_code == 200
    body = response.json()
    assert len(body["months"]) == 6
    this_month_after = body["months"][-1]
    assert this_month_after["revenue"] == this_month_before["revenue"] + 300
    assert this_month_after["expenses"] == this_month_before["expenses"] + 100
    assert (
        this_month_after["net_profit"] == this_month_after["revenue"] - this_month_after["expenses"]
    )


async def test_expense_breakdown_groups_by_category(admin_user):
    async with _client_as(admin_user) as client:
        before = await client.get("/api/v1/admin/reports/expense-breakdown")
        before_marketing = next(
            (i["amount"] for i in before.json()["items"] if i["category"] == "marketing"), 0
        )

        await client.post("/api/v1/admin/expenses", json={"category": "marketing", "amount": 60})
        response = await client.get("/api/v1/admin/reports/expense-breakdown")

    assert response.status_code == 200
    body = response.json()
    marketing = next(i for i in body["items"] if i["category"] == "marketing")
    assert marketing["amount"] == before_marketing + 60
    assert body["total"] == sum(i["amount"] for i in body["items"])


async def test_membership_growth_counts_new_members_in_the_current_month(admin_user, member_user):
    async with _client_as(admin_user) as client:
        response = await client.get("/api/v1/admin/reports/membership-growth")

    assert response.status_code == 200
    body = response.json()
    assert len(body["months"]) == 6
    this_month = body["months"][-1]
    # member_user was just created in this test run, so it must be reflected.
    assert this_month["new_members"] >= 1
    assert this_month["total_members"] >= this_month["new_members"]


async def test_announcement_requires_authentication():
    """Test Case 5: Announcement Requires Authentication"""

    async with _anon_client() as client:
        response = await client.post("/api/v1/admin/announcements", json={"message": "Hi"})

    print("\nAnnouncement Response:", response.status_code, response.text)

    assert response.status_code == 401


async def test_member_cannot_send_an_announcement(member_user):
    """Test Case 6: Announcement Forbidden (member role)"""

    async with _client_as(member_user) as client:
        response = await client.post("/api/v1/admin/announcements", json={"message": "Hi"})

    print("\nAnnouncement Response:", response.status_code, response.text)

    assert response.status_code == 403


async def test_announcement_rejects_empty_message(admin_user):
    async with _client_as(admin_user) as client:
        response = await client.post("/api/v1/admin/announcements", json={"message": ""})
    assert response.status_code == 422


async def test_admin_can_send_an_announcement_to_all_members(admin_user, member_user):
    async with _client_as(admin_user) as client:
        response = await client.post(
            "/api/v1/admin/announcements", json={"message": "The library closes early on Friday."}
        )

    assert response.status_code == 201
    assert response.json()["recipient_count"] >= 1

    async with _client_as(member_user) as client:
        notifications = await client.get("/api/v1/notifications/me")

    assert notifications.status_code == 200
    assert any(
        n["type"] == "announcement" and n["message"] == "The library closes early on Friday."
        for n in notifications.json()
    )


def _find_member(body: dict, member_id: str) -> dict:
    return next(item for item in body["items"] if item["id"] == member_id)


async def test_list_members_requires_admin_role(member_user):
    async with _client_as(member_user) as client:
        response = await client.get("/api/v1/admin/members")
    assert response.status_code == 403


async def test_list_members_shows_a_freshly_joined_member_with_honest_empty_state(
    admin_user, member_user
):
    async with _client_as(admin_user) as client:
        response = await client.get("/api/v1/admin/members")

    assert response.status_code == 200
    body = response.json()
    row = _find_member(body, member_user.id)
    assert row["full_name"] == member_user.fullName
    assert row["email"] == member_user.email
    assert row["last_payment_amount"] is None
    assert row["plan_label"] is None
    assert row["plan_is_active"] is False
    assert row["books_reading"] == 0
    assert row["books_completed"] == 0
    assert row["reported"] is False


async def test_list_members_reflects_latest_payment_and_active_plan(admin_user, member_user):
    async with _client_as(member_user) as client:
        await client.post(
            "/api/v1/payments",
            json={"amount": 499, "label": "1 Month — ₹499", "plan_months": 1},
        )
        # A later fine payment (no plan_months) is the most recent payment overall,
        # but must not override the plan info, which only tracks plan payments.
        await client.post("/api/v1/payments", json={"amount": 20, "label": "Overdue fine"})

    async with _client_as(admin_user) as client:
        response = await client.get("/api/v1/admin/members")

    assert response.status_code == 200
    row = _find_member(response.json(), member_user.id)
    assert row["last_payment_amount"] == 20
    assert row["last_payment_label"] == "Overdue fine"
    assert row["plan_label"] == "1 Month — ₹499"
    assert row["plan_is_active"] is True


async def test_list_members_counts_reading_progress(admin_user, member_user):
    reading_book = await prisma.book.create(
        data={"title": "Admin Members Test Book — Reading", "author": "A", "category": "Fiction"}
    )
    completed_book = await prisma.book.create(
        data={"title": "Admin Members Test Book — Completed", "author": "A", "category": "Fiction"}
    )

    async with _client_as(member_user) as client:
        await client.put(
            "/api/v1/members/me/reading-progress",
            json={"book_id": reading_book.id, "status": "reading", "percent_complete": 40},
        )
        await client.put(
            "/api/v1/members/me/reading-progress",
            json={"book_id": completed_book.id, "status": "completed", "percent_complete": 100},
        )

    async with _client_as(admin_user) as client:
        response = await client.get("/api/v1/admin/members")

    row = _find_member(response.json(), member_user.id)
    assert row["books_reading"] == 1
    assert row["books_completed"] == 1


async def test_list_members_flags_a_reported_member(admin_user, member_user):
    reporter = await _make_user(Role.MEMBER)

    async with _client_as(member_user) as client:
        post = await client.post(
            "/api/v1/community/posts", json={"content": "Hello from a test post"}
        )
    async with _client_as(reporter) as client:
        await client.post(f"/api/v1/community/posts/{post.json()['id']}/report")

    async with _client_as(admin_user) as client:
        response = await client.get("/api/v1/admin/members")

    body = response.json()
    assert _find_member(body, member_user.id)["reported"] is True
    assert _find_member(body, reporter.id)["reported"] is False


async def test_list_members_search_filters_by_email(admin_user, member_user):
    async with _client_as(admin_user) as client:
        response = await client.get("/api/v1/admin/members", params={"search": member_user.email})

    assert response.status_code == 200
    body = response.json()
    assert all(member_user.email in item["email"] for item in body["items"])
    assert any(item["id"] == member_user.id for item in body["items"])


async def test_list_members_includes_role_status_and_event_registrations(
    admin_user, manager_user, member_user
):
    event = await prisma.event.create(
        data={
            "title": "Admin Members Test Event",
            "location": "Main Hall",
            "date": datetime.now(UTC),
            "capacity": 10,
            "createdBy": admin_user.id,
        }
    )
    async with _client_as(member_user) as client:
        await client.post(f"/api/v1/events/{event.id}/register")

    async with _client_as(admin_user) as client:
        response = await client.get("/api/v1/admin/members")

    body = response.json()
    member_row = _find_member(body, member_user.id)
    assert member_row["role"] == "member"
    assert member_row["is_active"] is True
    assert member_row["event_registrations"] == 1

    # Staff accounts (not just role=member) show up too, since this table is for
    # account management, not just a member roster.
    manager_row = _find_member(body, manager_user.id)
    assert manager_row["role"] == "manager"
    assert manager_row["event_registrations"] == 0


def _find_payment(items: list[dict], member_id: str) -> dict:
    return next(item for item in items if item["member_id"] == member_id)


async def test_list_payments_requires_admin_role(member_user):
    async with _client_as(member_user) as client:
        response = await client.get("/api/v1/admin/payments")
    assert response.status_code == 403


async def test_list_payments_includes_member_details(admin_user, member_user):
    async with _client_as(member_user) as client:
        await client.post(
            "/api/v1/payments",
            json={"amount": 499, "label": "1 Month — ₹499", "plan_months": 1},
        )

    async with _client_as(admin_user) as client:
        response = await client.get("/api/v1/admin/payments")

    assert response.status_code == 200
    body = response.json()
    row = _find_payment(body["items"], member_user.id)
    assert row["member_name"] == member_user.fullName
    assert row["member_email"] == member_user.email
    assert row["amount"] == 499
    assert row["label"] == "1 Month — ₹499"
    assert row["status"] == "success"
    assert row["plan_months"] == 1


async def test_list_payments_orders_newest_first(admin_user, member_user):
    async with _client_as(member_user) as client:
        await client.post("/api/v1/payments", json={"amount": 100, "label": "First"})
        await client.post("/api/v1/payments", json={"amount": 200, "label": "Second"})

    async with _client_as(admin_user) as client:
        response = await client.get("/api/v1/admin/payments")

    labels = [item["label"] for item in response.json()["items"]]
    assert labels.index("Second") < labels.index("First")


async def test_list_payments_search_filters_by_member_email(admin_user, member_user):
    other_member = await _make_user(Role.MEMBER)
    async with _client_as(member_user) as client:
        await client.post("/api/v1/payments", json={"amount": 50, "label": "Mine"})
    async with _client_as(other_member) as client:
        await client.post("/api/v1/payments", json={"amount": 60, "label": "Not mine"})

    async with _client_as(admin_user) as client:
        response = await client.get("/api/v1/admin/payments", params={"search": member_user.email})

    body = response.json()
    assert all(member_user.email == item["member_email"] for item in body["items"])
    assert any(item["member_id"] == member_user.id for item in body["items"])
    assert not any(item["member_id"] == other_member.id for item in body["items"])


async def test_list_payments_month_filter_excludes_other_months(admin_user, member_user):
    async with _client_as(member_user) as client:
        await client.post("/api/v1/payments", json={"amount": 70, "label": "This month"})
        last_month = await client.post(
            "/api/v1/payments", json={"amount": 80, "label": "Last month"}
        )

    now = datetime.now(UTC)
    last_month_date = (now.replace(day=1) - timedelta(days=1)).replace(day=1)
    await prisma.payment.update(
        where={"id": last_month.json()["id"]}, data={"createdAt": last_month_date}
    )

    async with _client_as(admin_user) as client:
        response = await client.get(
            "/api/v1/admin/payments",
            params={"month": now.strftime("%Y-%m"), "search": member_user.email},
        )

    body = response.json()
    labels = {item["label"] for item in body["items"]}
    assert "This month" in labels
    assert "Last month" not in labels
