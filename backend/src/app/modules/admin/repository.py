from datetime import datetime

from prisma.models import Expense, Payment, User

from app.core.constants import Role
from app.db.pagination import paginate
from app.db.prisma import prisma


async def sum_payments(
    *, start: datetime, end: datetime | None = None, has_plan: bool | None = None
) -> int:
    where: dict = {"status": "success", "createdAt": {"gte": start}}
    if end is not None:
        where["createdAt"]["lt"] = end
    if has_plan is True:
        where["planMonths"] = {"not": None}
    elif has_plan is False:
        where["planMonths"] = None

    payments = await prisma.payment.find_many(where=where)
    return sum(payment.amount for payment in payments)


async def sum_expenses(
    *, start: datetime, end: datetime | None = None, category: str | None = None
) -> int:
    where: dict = {"createdAt": {"gte": start}}
    if end is not None:
        where["createdAt"]["lt"] = end
    if category is not None:
        where["category"] = category

    expenses = await prisma.expense.find_many(where=where)
    return sum(expense.amount for expense in expenses)


async def count_members(*, created_before: datetime | None = None) -> int:
    where: dict = {"role": {"name": Role.MEMBER}, "deletedAt": None}
    if created_before is not None:
        where["createdAt"] = {"lt": created_before}
    return await prisma.user.count(where=where)


async def create_expense(*, category: str, amount: int, logged_by_id: str) -> Expense:
    return await prisma.expense.create(
        data={"category": category, "amount": amount, "loggedById": logged_by_id}
    )


async def count_seat_bookings(*, date: datetime, hour: int) -> int:
    return await prisma.seatbooking.count(where={"date": date, "hour": hour})


# The dashboard needs one figure per opening hour. Asking per hour was a dozen round
# trips for one day's bookings — fetch the day once and bucket it here instead, the
# same fetch-then-aggregate shape sum_expenses above already uses.
async def count_seat_bookings_by_hour(*, date: datetime) -> dict[int, int]:
    bookings = await prisma.seatbooking.find_many(where={"date": date})
    counts: dict[int, int] = {}
    for booking in bookings:
        counts[booking.hour] = counts.get(booking.hour, 0) + 1
    return counts


# Same idea for the budget panel: one scan of the month's expenses, bucketed by
# category, rather than one filtered scan per category.
async def sum_expenses_by_category(*, start: datetime) -> dict[str, int]:
    expenses = await prisma.expense.find_many(where={"createdAt": {"gte": start}})
    totals: dict[str, int] = {}
    for expense in expenses:
        totals[expense.category] = totals.get(expense.category, 0) + expense.amount
    return totals


async def revenue_by_plan_label() -> list[dict]:
    """Revenue and count per plan label, grouped in SQL.

    Was: load every successful plan payment ever made and total them in Python.
    """
    return await prisma.query_raw(
        """SELECT label, SUM(amount)::bigint AS amount, COUNT(*)::bigint AS count
           FROM payments
           WHERE status = 'success' AND plan_months IS NOT NULL
           GROUP BY label
           ORDER BY amount DESC"""
    )


async def list_payments_since(start: datetime) -> list[Payment]:
    return await prisma.payment.find_many(where={"status": "success", "createdAt": {"gte": start}})


async def list_expenses(*, start: datetime) -> list[Expense]:
    """Expenses since `start`. Bounded on purpose — the unbounded variant was only
    ever used to build a category breakdown, which expense_totals_by_category now
    does in SQL."""
    return await prisma.expense.find_many(where={"createdAt": {"gte": start}})


async def expense_totals_by_category() -> list[dict]:
    """Lifetime spend per category, grouped in SQL rather than by loading every row."""
    return await prisma.query_raw(
        """SELECT category, SUM(amount)::bigint AS amount
           FROM expenses
           GROUP BY category
           ORDER BY amount DESC"""
    )


async def count_members_by_month(*, since: datetime) -> dict[str, int]:
    """New members per YYYY-MM since `since`, bucketed in SQL.

    Replaces loading every member row to read one timestamp off each. Grouping in SQL
    also sidesteps query_raw returning timestamps as strings — the counts come back as
    numbers and the month is already the key the caller wants.
    """
    # $2 arrives as text over the query protocol, and created_at is `timestamp without
    # time zone` holding UTC — so parse it as timestamptz and convert, rather than
    # letting Postgres compare a timestamp against a string (it refuses) or silently
    # reinterpreting an offset.
    rows = await prisma.query_raw(
        """SELECT to_char(u.created_at, 'YYYY-MM') AS month, COUNT(*)::bigint AS count
           FROM users u JOIN roles r ON r.id = u.role_id
           WHERE r.name = $1
             AND u.deleted_at IS NULL
             AND u.created_at >= ($2::timestamptz AT TIME ZONE 'UTC')
           GROUP BY 1""",
        Role.MEMBER.value,
        since,
    )
    return {row["month"]: int(row["count"]) for row in rows}


async def list_member_ids() -> list[str]:
    members = await prisma.user.find_many(where={"role": {"name": Role.MEMBER}, "deletedAt": None})
    return [member.id for member in members]


async def list_members(
    *,
    search: str | None,
    page: int,
    page_size: int,
    role: str | None = None,
    status: str | None = None,
    sort_by: str = "joined",
    sort_dir: str = "desc",
) -> tuple[list[User], int]:
    # Unlike count_members/list_member_ids (which are strictly about the "member" role
    # for stats/announcements), this powers the admin's account-management table, so it
    # covers every role — an admin needs to find and manage staff accounts here too.
    where: dict = {"deletedAt": None}
    if search:
        where["OR"] = [
            {"fullName": {"contains": search, "mode": "insensitive"}},
            {"email": {"contains": search, "mode": "insensitive"}},
        ]
    if role:
        where["role"] = {"name": role}
    if status == "active":
        where["isActive"] = True
    elif status == "inactive":
        where["isActive"] = False

    direction = "desc" if sort_dir == "desc" else "asc"
    if sort_by == "role":
        order: dict = {"role": {"name": direction}}
    elif sort_by == "name":
        order = {"fullName": direction}
    else:
        order = {"createdAt": direction}

    return await paginate(
        prisma.user,
        where=where,
        include={"role": True},
        order=order,
        skip=(page - 1) * page_size,
        take=page_size,
    )


async def list_payments(
    *,
    search: str | None,
    page: int,
    page_size: int,
    start: datetime | None = None,
    end: datetime | None = None,
) -> tuple[list[Payment], int]:
    where: dict = {}
    if search:
        where["user"] = {
            "is": {
                "OR": [
                    {"fullName": {"contains": search, "mode": "insensitive"}},
                    {"email": {"contains": search, "mode": "insensitive"}},
                ]
            }
        }
    if start is not None:
        where["createdAt"] = {"gte": start, "lt": end}

    return await paginate(
        prisma.payment,
        where=where,
        include={"user": True},
        order={"createdAt": "desc"},
        skip=(page - 1) * page_size,
        take=page_size,
    )


# Latest-row-per-user via a single ordered query is simpler than a per-user lookup and
# avoids N+1s for a page of members; dict.setdefault keeps the first (most recent) row.
async def list_latest_payments(member_ids: list[str]) -> dict[str, Payment]:
    if not member_ids:
        return {}
    payments = await prisma.payment.find_many(
        where={"userId": {"in": member_ids}, "status": "success"},
        order={"createdAt": "desc"},
    )
    latest: dict[str, Payment] = {}
    for payment in payments:
        latest.setdefault(payment.userId, payment)
    return latest


async def list_membership_payments_by_member(member_ids: list[str]) -> dict[str, list[Payment]]:
    """All successful plan payments per member, oldest first.

    Ascending order matches what payments.calculate_membership_expiry expects, so the
    admin view can share that function instead of re-deriving expiry from the single
    latest payment (which ignored renewals and drifted days off on longer plans).
    """
    if not member_ids:
        return {}
    payments = await prisma.payment.find_many(
        where={
            "userId": {"in": member_ids},
            "status": "success",
            "planMonths": {"not": None},
        },
        order={"createdAt": "asc"},
    )
    grouped: dict[str, list[Payment]] = {}
    for payment in payments:
        grouped.setdefault(payment.userId, []).append(payment)
    return grouped


async def list_latest_membership_payments(member_ids: list[str]) -> dict[str, Payment]:
    if not member_ids:
        return {}
    payments = await prisma.payment.find_many(
        where={
            "userId": {"in": member_ids},
            "status": "success",
            "planMonths": {"not": None},
        },
        order={"createdAt": "desc"},
    )
    latest: dict[str, Payment] = {}
    for payment in payments:
        latest.setdefault(payment.userId, payment)
    return latest


async def count_reading_progress_by_status(member_ids: list[str]) -> dict[str, dict[str, int]]:
    if not member_ids:
        return {}
    rows = await prisma.readingprogress.find_many(where={"memberId": {"in": member_ids}})
    counts: dict[str, dict[str, int]] = {}
    for row in rows:
        bucket = counts.setdefault(row.memberId, {"reading": 0, "completed": 0})
        bucket[row.status] = bucket.get(row.status, 0) + 1
    return counts


async def find_reported_member_ids(member_ids: list[str]) -> set[str]:
    if not member_ids:
        return set()
    posts = await prisma.communitypost.find_many(
        where={"authorId": {"in": member_ids}, "reported": True}
    )
    comments = await prisma.communitycomment.find_many(
        where={"authorId": {"in": member_ids}, "reported": True}
    )
    return {post.authorId for post in posts} | {comment.authorId for comment in comments}


async def count_event_registrations(member_ids: list[str]) -> dict[str, int]:
    if not member_ids:
        return {}
    registrations = await prisma.eventregistration.find_many(where={"memberId": {"in": member_ids}})
    counts: dict[str, int] = {}
    for registration in registrations:
        counts[registration.memberId] = counts.get(registration.memberId, 0) + 1
    return counts
