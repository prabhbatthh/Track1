import asyncio
from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta
from typing import cast

from prisma.models import (
    AuditLogEntry,
    Loan,
    LoginActivity,
    Payment,
    PermissionRequest,
    PricingPlan,
    SupportTicket,
    User,
)

from app.modules.admin.schemas import TrendOut
from app.modules.audit_log.constants import AuditAction
from app.modules.it_head import repository
from app.modules.it_head.schemas import (
    FeeCollectionMonthOut,
    FeeStatusEntryOut,
    IssueResolutionMonthOut,
    ITHeadAlertOut,
    ITHeadDashboardOut,
    ITHeadStatsOut,
    RoleBreakdownEntryOut,
    SystemActivityDayOut,
    SystemActivitySummaryOut,
)
from app.modules.loans import service as loans_service
from app.modules.loans.constants import FINE_PER_DAY
from app.modules.payments import service as payments_service
from app.modules.permission_requests import repository as permission_requests_repository
from app.modules.pricing_plans import repository as pricing_plans_repository
from app.modules.support_tickets import repository as support_tickets_repository

# A renewal grace period, not a book-loan one — separate from loans.constants.LOAN_PERIOD_DAYS.
# Expired more recently than this shows as "due"; longer than this shows as "overdue".
RENEWAL_GRACE_DAYS = 7

FEE_TREND_MONTHS = 6
ISSUE_TREND_MONTHS = 6
SYSTEM_ACTIVITY_DAYS = 7
OVERDUE_FINE_SPIKE_DAYS = 14

ACCESS_CHANGE_ACTIONS = [
    AuditAction.MEMBER_ROLE_CHANGED.value,
    AuditAction.MEMBER_ACTIVATION_CHANGED.value,
]
PERMISSION_UPDATE_ACTIONS = [
    AuditAction.PERMISSION_REQUEST_GRANTED.value,
    AuditAction.PERMISSION_REQUEST_DENIED.value,
]


def _trend(current: int, previous: int) -> TrendOut:
    # Same shape as admin/service.py's own — duplicated rather than imported, since
    # that one is module-private and this is a handful of lines of pure arithmetic.
    if previous == 0:
        return TrendOut(direction="up", percent=100 if current > 0 else 0)
    percent = round(abs(current - previous) / abs(previous) * 100)
    return TrendOut(direction="up" if current >= previous else "down", percent=percent)


def _month_key(moment: datetime) -> str:
    return f"{moment.year:04d}-{moment.month:02d}"


def _month_start(moment: datetime) -> datetime:
    return datetime(moment.year, moment.month, 1, tzinfo=UTC)


def _previous_month_start(moment: datetime) -> datetime:
    last_day_of_previous_month = _month_start(moment) - timedelta(days=1)
    return _month_start(last_day_of_previous_month)


def _recent_month_starts(count: int, now: datetime) -> list[datetime]:
    starts = []
    cursor = _month_start(now)
    for _ in range(count):
        starts.append(cursor)
        cursor = _previous_month_start(cursor)
    starts.reverse()
    return starts


def _today_start(now: datetime) -> datetime:
    return datetime(now.year, now.month, now.day, tzinfo=UTC)


def _recent_day_starts(count: int, now: datetime) -> list[datetime]:
    today = _today_start(now)
    return [today - timedelta(days=offset) for offset in range(count - 1, -1, -1)]


def _fee_status_as_of(
    members: list[User],
    payments_by_member: dict[str, list[Payment]],
    renewal_price: int,
    as_of: datetime,
) -> int:
    """Sum of the flat renewal price owed by every member not paid up, evaluated as of a
    specific instant — truncates each member's payment history to what existed by
    `as_of` before calling calculate_membership_expiry, so a historical month's figure
    doesn't count a renewal that hadn't happened yet at that point in time."""
    total = 0
    for member in members:
        if member.createdAt > as_of:
            continue
        history = [p for p in payments_by_member.get(member.id, []) if p.createdAt <= as_of]
        if not history:
            total += renewal_price
            continue
        expires_at = payments_service.calculate_membership_expiry(history)
        if expires_at is None or expires_at <= as_of:
            total += renewal_price
    return total


def _fee_collections(
    members: list[User],
    payments_by_member: dict[str, list[Payment]],
    membership_payments: list[Payment],
    renewal_price: int,
    month_starts: list[datetime],
    current_fees_outstanding: int,
) -> list[FeeCollectionMonthOut]:
    collected_by_month: dict[str, int] = defaultdict(int)
    for payment in membership_payments:
        collected_by_month[_month_key(payment.createdAt)] += payment.amount

    result = []
    for index, start in enumerate(month_starts):
        if index + 1 < len(month_starts):
            pending = _fee_status_as_of(
                members, payments_by_member, renewal_price, month_starts[index + 1]
            )
        else:
            # The current (last) month has no "end" yet — reuse the real, already-computed
            # fees_outstanding rather than re-deriving "as of right now" a second time,
            # which can disagree by one member right at the boundary (clock precision
            # between this request's `now` and a row's own DB-assigned createdAt).
            pending = current_fees_outstanding
        result.append(
            FeeCollectionMonthOut(
                month=_month_key(start),
                collected=collected_by_month.get(_month_key(start), 0),
                pending=pending,
            )
        )
    return result


def _issue_resolution(
    tickets: list[SupportTicket], month_starts: list[datetime]
) -> list[IssueResolutionMonthOut]:
    buckets: dict[str, Counter] = defaultdict(Counter)
    for ticket in tickets:
        buckets[_month_key(ticket.createdAt)][ticket.status] += 1

    result = []
    for start in month_starts:
        counts = buckets[_month_key(start)]
        result.append(
            IssueResolutionMonthOut(
                month=_month_key(start),
                resolved=counts.get("resolved", 0),
                open=counts.get("open", 0),
                other=counts.get("closed", 0),
            )
        )
    return result


def _system_activity(
    login_rows: list[LoginActivity],
    access_change_rows: list[AuditLogEntry],
    permission_update_rows: list[AuditLogEntry],
    day_starts: list[datetime],
) -> list[SystemActivityDayOut]:
    logins_by_day: dict[str, int] = defaultdict(int)
    for row in login_rows:
        logins_by_day[row.date.date().isoformat()] += 1
    access_by_day: dict[str, int] = defaultdict(int)
    for row in access_change_rows:
        access_by_day[row.createdAt.date().isoformat()] += 1
    permissions_by_day: dict[str, int] = defaultdict(int)
    for row in permission_update_rows:
        permissions_by_day[row.createdAt.date().isoformat()] += 1

    return [
        SystemActivityDayOut(
            date=start.date(),
            logins=logins_by_day.get(start.date().isoformat(), 0),
            access_changes=access_by_day.get(start.date().isoformat(), 0),
            permissions_updated=permissions_by_day.get(start.date().isoformat(), 0),
        )
        for start in day_starts
    ]


def _fines_generated_in_range(loans: list[Loan], start: datetime, end: datetime) -> int:
    """Late-fee amount generated by loans whose due date falls in [start, end) — a flow,
    not the running balance sum_outstanding_fines() reports. Mirrors manager/service.py's
    _overdue_and_fines generated_by_month math, evaluated for one window instead of
    bucketing several at once, since it_head only needs this vs. last month."""
    total = 0
    for loan in loans:
        if not (start <= loan.dueDate < end):
            continue
        end_of_loan = loan.returnedAt or datetime.now(UTC)
        days_late = max(0, (end_of_loan.date() - loan.dueDate.date()).days)
        total += days_late * FINE_PER_DAY
    return total


def _access_by_role(users: list[User]) -> list[RoleBreakdownEntryOut]:
    counts = Counter(user.role.name for user in users)
    total = sum(counts.values()) or 1
    return [
        RoleBreakdownEntryOut(role=role, count=count, percent=round(count / total * 100))
        for role, count in counts.most_common()
    ]


def _alerts(
    *,
    overdue_fine_spike: int,
    pending_permissions: int,
    open_issues: int,
    access_changes_today: int,
) -> list[ITHeadAlertOut]:
    return [
        ITHeadAlertOut(
            id="overdue-fines",
            severity="critical" if overdue_fine_spike > 0 else "success",
            title="Overdue Fines" if overdue_fine_spike > 0 else "Fines Under Control",
            description=(
                f"{overdue_fine_spike} loan(s) overdue more than {OVERDUE_FINE_SPIKE_DAYS} days."
                if overdue_fine_spike > 0
                else f"No loans overdue beyond the {OVERDUE_FINE_SPIKE_DAYS}-day grace window."
            ),
        ),
        ITHeadAlertOut(
            id="pending-permissions",
            severity="warning" if pending_permissions > 0 else "success",
            title="Pending Permissions" if pending_permissions > 0 else "Permissions Up to Date",
            description=(
                f"{pending_permissions} request(s) awaiting your review."
                if pending_permissions > 0
                else "No permission requests waiting on a decision."
            ),
        ),
        ITHeadAlertOut(
            id="open-issues",
            severity="info" if open_issues > 0 else "success",
            title=f"{open_issues} Open Issue(s)" if open_issues > 0 else "No Open Issues",
            description=(
                "Unresolved support tickets need attention."
                if open_issues > 0
                else "Every support ticket has been resolved or closed."
            ),
        ),
        ITHeadAlertOut(
            id="access-control",
            severity="success",
            title="Access Control",
            description=(
                f"{access_changes_today} role/activation change(s) logged today."
                if access_changes_today > 0
                else "No role or activation changes logged today."
            ),
        ),
    ]


async def get_dashboard() -> ITHeadDashboardOut:
    now = datetime.now(UTC)
    fee_month_starts = _recent_month_starts(FEE_TREND_MONTHS, now)
    issue_month_starts = _recent_month_starts(ISSUE_TREND_MONTHS, now)
    day_starts = _recent_day_starts(SYSTEM_ACTIVITY_DAYS, now)
    previous_day_starts = _recent_day_starts(
        SYSTEM_ACTIVITY_DAYS, day_starts[0] - timedelta(days=1)
    )
    yesterday_start = day_starts[-2] if len(day_starts) > 1 else day_starts[0] - timedelta(days=1)

    results = await asyncio.gather(
        repository.count_active_members(),
        support_tickets_repository.count_by_status("open"),
        permission_requests_repository.count_pending(),
        loans_service.sum_outstanding_fines(),
        repository.list_active_members(),
        repository.membership_payments_by_member(),
        pricing_plans_repository.list_all(),
        repository.list_membership_payments(),
        repository.list_support_tickets_created_since(issue_month_starts[0]),
        repository.list_active_users_with_role(),
        repository.list_login_activity_since(previous_day_starts[0]),
        repository.list_audit_entries_since(ACCESS_CHANGE_ACTIONS, previous_day_starts[0]),
        repository.list_audit_entries_since(PERMISSION_UPDATE_ACTIONS, previous_day_starts[0]),
        repository.count_overdue_loans_beyond(OVERDUE_FINE_SPIKE_DAYS, now=now),
        repository.list_permission_requests_since(fee_month_starts[0]),
        repository.list_loans_due_since(_previous_month_start(now)),
    )
    active_members = cast(int, results[0])
    open_issues = cast(int, results[1])
    pending_permissions = cast(int, results[2])
    late_fines_outstanding = cast(int, results[3])
    members = cast(list[User], results[4])
    payments_by_member = cast(dict[str, list[Payment]], results[5])
    plans = cast(list[PricingPlan], results[6])
    membership_payments = cast(list[Payment], results[7])
    tickets_since = cast(list[SupportTicket], results[8])
    all_active_users = cast(list[User], results[9])
    login_rows = cast(list[LoginActivity], results[10])
    access_change_rows = cast(list[AuditLogEntry], results[11])
    permission_update_rows = cast(list[AuditLogEntry], results[12])
    overdue_fine_spike = cast(int, results[13])
    permission_requests_recent = cast(list[PermissionRequest], results[14])
    loans_due_recent = cast(list[Loan], results[15])

    renewal_price = next((plan.price for plan in plans if plan.planId == "1m"), 0)

    fee_status: list[FeeStatusEntryOut] = []
    fees_outstanding = 0
    for member in members:
        member_payments = payments_by_member.get(member.id) or []
        payment = member_payments[-1] if member_payments else None
        if payment is None:
            fee_status.append(
                FeeStatusEntryOut(
                    member_id=member.id,
                    member_name=member.fullName,
                    amount_due=renewal_price,
                    status="overdue",
                    due_date=member.createdAt,
                )
            )
            fees_outstanding += renewal_price
            continue

        expires_at = payments_service.calculate_membership_expiry(member_payments)
        if expires_at is None:
            expires_at = payment.createdAt
        if expires_at > now:
            fee_status.append(
                FeeStatusEntryOut(
                    member_id=member.id,
                    member_name=member.fullName,
                    amount_due=0,
                    status="paid",
                    due_date=None,
                )
            )
            continue

        days_overdue = (now - expires_at).days
        status_value = "overdue" if days_overdue > RENEWAL_GRACE_DAYS else "due"
        fee_status.append(
            FeeStatusEntryOut(
                member_id=member.id,
                member_name=member.fullName,
                amount_due=renewal_price,
                status=status_value,
                due_date=expires_at,
            )
        )
        fees_outstanding += renewal_price

    previous_month_start = _previous_month_start(now)
    active_members_last_month = sum(1 for m in members if m.createdAt <= previous_month_start)
    fees_outstanding_last_month = _fee_status_as_of(
        members, payments_by_member, renewal_price, previous_month_start
    )

    # A flow (fines newly generated in the window), not the running balance
    # late_fines_outstanding reports — see _fines_generated_in_range's own docstring.
    fines_generated_this_month = _fines_generated_in_range(loans_due_recent, _month_start(now), now)
    fines_generated_last_month = _fines_generated_in_range(
        loans_due_recent, previous_month_start, _month_start(now)
    )

    yesterday_end = yesterday_start + timedelta(days=1)
    pending_permissions_yesterday = sum(
        1
        for p in permission_requests_recent
        if p.createdAt < yesterday_end and (p.decidedAt is None or p.decidedAt >= yesterday_end)
    )

    fee_collections = _fee_collections(
        members,
        payments_by_member,
        membership_payments,
        renewal_price,
        fee_month_starts,
        fees_outstanding,
    )
    issue_resolution = _issue_resolution(tickets_since, issue_month_starts)
    system_activity = _system_activity(
        login_rows, access_change_rows, permission_update_rows, day_starts
    )
    system_activity_previous = _system_activity(
        login_rows, access_change_rows, permission_update_rows, previous_day_starts
    )
    access_by_role = _access_by_role(all_active_users)

    logins_total = sum(d.logins for d in system_activity)
    logins_prev_total = sum(d.logins for d in system_activity_previous)
    access_changes_total = sum(d.access_changes for d in system_activity)
    access_changes_prev_total = sum(d.access_changes for d in system_activity_previous)
    permissions_updated_total = sum(d.permissions_updated for d in system_activity)
    permissions_updated_prev_total = sum(d.permissions_updated for d in system_activity_previous)

    open_issues_yesterday = sum(
        1
        for t in tickets_since
        if t.status == "open" and t.createdAt < yesterday_start + timedelta(days=1)
    )

    return ITHeadDashboardOut(
        stats=ITHeadStatsOut(
            active_members=active_members,
            active_members_trend=_trend(active_members, active_members_last_month),
            open_issues=open_issues,
            open_issues_delta=open_issues - open_issues_yesterday,
            pending_permissions=pending_permissions,
            pending_permissions_delta=pending_permissions - pending_permissions_yesterday,
            fees_outstanding=fees_outstanding,
            fees_outstanding_trend=_trend(fees_outstanding, fees_outstanding_last_month),
            late_fines_outstanding=late_fines_outstanding,
            late_fines_outstanding_trend=_trend(
                fines_generated_this_month, fines_generated_last_month
            ),
        ),
        fee_status=fee_status,
        fee_collections=fee_collections,
        issue_resolution=issue_resolution,
        system_activity=system_activity,
        system_activity_summary=SystemActivitySummaryOut(
            logins_total=logins_total,
            logins_trend=_trend(logins_total, logins_prev_total),
            access_changes_total=access_changes_total,
            access_changes_trend=_trend(access_changes_total, access_changes_prev_total),
            permissions_updated_total=permissions_updated_total,
            permissions_updated_trend=_trend(
                permissions_updated_total, permissions_updated_prev_total
            ),
        ),
        access_by_role=access_by_role,
        alerts=_alerts(
            overdue_fine_spike=overdue_fine_spike,
            pending_permissions=pending_permissions,
            open_issues=open_issues,
            access_changes_today=system_activity[-1].access_changes if system_activity else 0,
        ),
    )
