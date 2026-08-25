import asyncio
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import cast

from app.modules.admin import repository
from app.modules.admin.constants import EXPENSE_BUDGETS, OPEN_HOURS, ExpenseCategory
from app.modules.admin.schemas import (
    AdminDashboardOut,
    AdminMemberListOut,
    AdminMemberOut,
    AdminPaymentListOut,
    AdminPaymentOut,
    AdminStatsOut,
    AnnouncementCreate,
    AnnouncementOut,
    BudgetCategoryOut,
    ExpenseBreakdownItemOut,
    ExpenseBreakdownOut,
    ExpenseCreate,
    ExpenseOut,
    MembershipGrowthMonthOut,
    MembershipGrowthOut,
    MonthlyFigureOut,
    ProfitAndLossOut,
    RevenueByPlanItemOut,
    RevenueByPlanOut,
    RevenueSourceOut,
    SeatOccupancySlotOut,
    SeatStatusOut,
    TrendOut,
)
from app.modules.audit_log import service as audit_log_service
from app.modules.audit_log.constants import AuditAction
from app.modules.notifications import service as notifications_service
from app.modules.payments import service as payments_service
from app.modules.seat_booking.constants import SEAT_LABELS

TOTAL_SEATS = len(SEAT_LABELS)
REPORT_MONTHS = 6


def _month_start(moment: datetime) -> datetime:
    return datetime(moment.year, moment.month, 1, tzinfo=UTC)


def _previous_month_start(moment: datetime) -> datetime:
    last_day_of_previous_month = _month_start(moment) - timedelta(days=1)
    return _month_start(last_day_of_previous_month)


def _trend(current: int, previous: int) -> TrendOut:
    if previous == 0:
        return TrendOut(direction="up", percent=100 if current > 0 else 0)
    # abs() on the divisor too: net profit is the one figure here that can be negative,
    # and dividing by a signed baseline made a shrinking loss render as "up -50%".
    percent = round(abs(current - previous) / abs(previous) * 100)
    return TrendOut(direction="up" if current >= previous else "down", percent=percent)


def _month_key(moment: datetime) -> str:
    return f"{moment.year:04d}-{moment.month:02d}"


def _recent_month_starts(count: int, now: datetime) -> list[datetime]:
    starts = []
    cursor = _month_start(now)
    for _ in range(count):
        starts.append(cursor)
        cursor = _previous_month_start(cursor)
    starts.reverse()
    return starts


def _parse_month_range(month: str) -> tuple[datetime, datetime]:
    year, month_num = (int(part) for part in month.split("-"))
    start = datetime(year, month_num, 1, tzinfo=UTC)
    end = (
        datetime(year + 1, 1, 1, tzinfo=UTC)
        if month_num == 12
        else datetime(year, month_num + 1, 1, tzinfo=UTC)
    )
    return start, end


async def get_dashboard() -> AdminDashboardOut:
    utc_now = datetime.now(UTC)
    local_now = datetime.now().astimezone()
    this_month_start = _month_start(utc_now)
    last_month_start = _previous_month_start(utc_now)

    today = local_now.date()
    yesterday = today - timedelta(days=1)
    today_midnight = datetime(today.year, today.month, today.day, tzinfo=UTC)
    yesterday_midnight = datetime(yesterday.year, yesterday.month, yesterday.day, tzinfo=UTC)

    # These are independent, so they run concurrently rather than as ~11 sequential round
    # trips. Kept to a fixed handful on purpose: an earlier version also fanned out one
    # query per budget category and per opening hour, and those ~25 at once exhausted the
    # connection pool. The two _by_ helpers below each collapse a fan-out into one query.
    results = await asyncio.gather(
        repository.sum_payments(start=this_month_start),
        repository.sum_payments(start=last_month_start, end=this_month_start),
        repository.sum_payments(start=this_month_start, has_plan=True),
        repository.sum_payments(start=this_month_start, has_plan=False),
        repository.sum_expenses(start=this_month_start),
        repository.sum_expenses(start=last_month_start, end=this_month_start),
        repository.count_members(),
        repository.count_members(created_before=this_month_start),
        repository.count_seat_bookings(date=today_midnight, hour=local_now.hour),
        repository.sum_expenses_by_category(start=this_month_start),
        repository.count_seat_bookings_by_hour(date=yesterday_midnight),
    )
    revenue_mtd = cast(int, results[0])
    revenue_last_month = cast(int, results[1])
    membership_fees = cast(int, results[2])
    fines_collected = cast(int, results[3])
    expenses_last_month = cast(int, results[5])
    total_members = cast(int, results[6])
    total_members_last_month = cast(int, results[7])
    booked_this_hour = cast(int, results[8])
    spend_by_category = cast(dict[str, int], results[9])
    bookings_by_hour = cast(dict[int, int], results[10])

    expenses_mtd = sum(spend_by_category.values())
    net_profit_mtd = revenue_mtd - expenses_mtd
    net_profit_last_month = revenue_last_month - expenses_last_month

    budget = [
        BudgetCategoryOut(
            category=category,
            budgeted=budgeted,
            spent=spend_by_category.get(category.value, 0),
        )
        for category, budgeted in EXPENSE_BUDGETS.items()
    ]

    seat_status = SeatStatusOut(
        available=TOTAL_SEATS - booked_this_hour, booked=booked_this_hour, total=TOTAL_SEATS
    )

    seat_occupancy = [
        SeatOccupancySlotOut(
            hour=hour, percent_filled=round(bookings_by_hour.get(hour, 0) / TOTAL_SEATS * 100)
        )
        for hour in OPEN_HOURS
    ]

    return AdminDashboardOut(
        stats=AdminStatsOut(
            revenue_mtd=revenue_mtd,
            revenue_trend=_trend(revenue_mtd, revenue_last_month),
            expenses_mtd=expenses_mtd,
            expenses_trend=_trend(expenses_mtd, expenses_last_month),
            net_profit_mtd=net_profit_mtd,
            net_profit_trend=_trend(net_profit_mtd, net_profit_last_month),
            total_members=total_members,
            total_members_trend=_trend(total_members, total_members_last_month),
        ),
        cash_flow=[
            RevenueSourceOut(source="membershipFees", amount=membership_fees),
            RevenueSourceOut(source="eventTickets", amount=0),
            RevenueSourceOut(source="finesCollected", amount=fines_collected),
            RevenueSourceOut(source="donationsValue", amount=0),
        ],
        budget=budget,
        seat_status=seat_status,
        seat_occupancy=seat_occupancy,
    )


async def log_expense(user_id: str, payload: ExpenseCreate) -> ExpenseOut:
    expense = await repository.create_expense(
        category=payload.category.value, amount=payload.amount, logged_by_id=user_id
    )
    await audit_log_service.record(
        actor_id=user_id,
        action=AuditAction.EXPENSE_LOGGED,
        metadata={"category": payload.category.value, "amount": payload.amount},
    )
    return ExpenseOut.from_prisma(expense)


async def get_revenue_by_plan() -> RevenueByPlanOut:
    rows = await repository.revenue_by_plan_label()
    items = [
        RevenueByPlanItemOut(label=row["label"], amount=int(row["amount"]), count=int(row["count"]))
        for row in rows
    ]
    return RevenueByPlanOut(items=items, total=sum(item.amount for item in items))


async def get_profit_and_loss() -> ProfitAndLossOut:
    now = datetime.now(UTC)
    month_starts = _recent_month_starts(REPORT_MONTHS, now)

    payments = await repository.list_payments_since(month_starts[0])
    expenses = await repository.list_expenses(start=month_starts[0])

    revenue_by_month: dict[str, int] = defaultdict(int)
    for payment in payments:
        revenue_by_month[_month_key(payment.createdAt)] += payment.amount

    expenses_by_month: dict[str, int] = defaultdict(int)
    for expense in expenses:
        expenses_by_month[_month_key(expense.createdAt)] += expense.amount

    months = [
        MonthlyFigureOut(
            month=_month_key(start),
            revenue=revenue_by_month.get(_month_key(start), 0),
            expenses=expenses_by_month.get(_month_key(start), 0),
            net_profit=revenue_by_month.get(_month_key(start), 0)
            - expenses_by_month.get(_month_key(start), 0),
        )
        for start in month_starts
    ]

    total_revenue = sum(month.revenue for month in months)
    total_expenses = sum(month.expenses for month in months)

    return ProfitAndLossOut(
        months=months,
        total_revenue=total_revenue,
        total_expenses=total_expenses,
        total_net_profit=total_revenue - total_expenses,
    )


async def get_expense_breakdown() -> ExpenseBreakdownOut:
    rows = await repository.expense_totals_by_category()
    total = sum(int(row["amount"]) for row in rows)
    items = [
        ExpenseBreakdownItemOut(
            category=ExpenseCategory(row["category"]),
            amount=int(row["amount"]),
            percent=round(int(row["amount"]) / total * 100, 1) if total else 0,
        )
        for row in rows
    ]
    return ExpenseBreakdownOut(items=items, total=total)


async def get_membership_growth() -> MembershipGrowthOut:
    now = datetime.now(UTC)
    month_starts = _recent_month_starts(REPORT_MONTHS, now)
    earliest = month_starts[0]

    # Two counting queries instead of hydrating every member row into Python.
    baseline = await repository.count_members(created_before=earliest)
    new_by_month = await repository.count_members_by_month(since=earliest)

    months = []
    running_total = baseline
    for start in month_starts:
        key = _month_key(start)
        new_members = new_by_month.get(key, 0)
        running_total += new_members
        months.append(
            MembershipGrowthMonthOut(
                month=key, new_members=new_members, total_members=running_total
            )
        )

    return MembershipGrowthOut(months=months)


async def send_announcement(admin_id: str, payload: AnnouncementCreate) -> AnnouncementOut:
    member_ids = await repository.list_member_ids()
    await notifications_service.create_notifications(member_ids, "announcement", payload.message)

    await audit_log_service.record(
        actor_id=admin_id,
        action=AuditAction.ANNOUNCEMENT_SENT,
        metadata={"recipientCount": len(member_ids)},
    )
    return AnnouncementOut(recipient_count=len(member_ids))


async def list_members(
    *,
    search: str | None,
    page: int,
    page_size: int,
    role: str | None = None,
    status: str | None = None,
    sort_by: str = "joined",
    sort_dir: str = "desc",
) -> AdminMemberListOut:
    users, total = await repository.list_members(
        search=search,
        page=page,
        page_size=page_size,
        role=role,
        status=status,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )
    member_ids = [user.id for user in users]

    latest_payments = await repository.list_latest_payments(member_ids)
    plan_payments_by_member = await repository.list_membership_payments_by_member(member_ids)
    progress_counts = await repository.count_reading_progress_by_status(member_ids)
    reported_ids = await repository.find_reported_member_ids(member_ids)
    event_registration_counts = await repository.count_event_registrations(member_ids)

    now = datetime.now(UTC)
    items = []
    for user in users:
        last_payment = latest_payments.get(user.id)
        plan_payments = plan_payments_by_member.get(user.id) or []
        plan_payment = plan_payments[-1] if plan_payments else None

        plan_expires_at = None
        plan_is_active = False
        if plan_payments:
            # Shared with the member-facing view rather than approximated locally. The
            # old `30 * planMonths` on the latest payment alone showed annual plans
            # expiring five days early and ignored renewals entirely.
            plan_expires_at = payments_service.calculate_membership_expiry(plan_payments)
            plan_is_active = plan_expires_at is not None and plan_expires_at > now

        counts = progress_counts.get(user.id, {})

        items.append(
            AdminMemberOut(
                id=user.id,
                full_name=user.fullName,
                email=user.email,
                role=user.role.name if user.role else "member",
                is_active=user.isActive,
                joined_at=user.createdAt,
                last_payment_amount=last_payment.amount if last_payment else None,
                last_payment_label=last_payment.label if last_payment else None,
                last_payment_at=last_payment.createdAt if last_payment else None,
                plan_label=plan_payment.label if plan_payment else None,
                plan_expires_at=plan_expires_at,
                plan_is_active=plan_is_active,
                books_reading=counts.get("reading", 0),
                books_completed=counts.get("completed", 0),
                reported=user.id in reported_ids,
                event_registrations=event_registration_counts.get(user.id, 0),
            )
        )

    return AdminMemberListOut(items=items, total=total, page=page, page_size=page_size)


async def list_payments(
    *, search: str | None, page: int, page_size: int, month: str | None = None
) -> AdminPaymentListOut:
    start, end = _parse_month_range(month) if month else (None, None)
    payments, total = await repository.list_payments(
        search=search, page=page, page_size=page_size, start=start, end=end
    )

    items = [
        AdminPaymentOut(
            id=payment.id,
            member_id=payment.userId,
            member_name=payment.user.fullName if payment.user else "Unknown Member",
            member_email=payment.user.email if payment.user else "",
            amount=payment.amount,
            label=payment.label,
            status=payment.status,
            plan_months=payment.planMonths,
            created_at=payment.createdAt,
        )
        for payment in payments
    ]
    return AdminPaymentListOut(items=items, total=total, page=page, page_size=page_size)
