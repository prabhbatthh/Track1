from datetime import datetime

from prisma.models import Book, Loan, User

from app.core.constants import Role
from app.db.pagination import paginate
from app.db.prisma import prisma


async def count_seat_bookings_created_between(start: datetime, end: datetime) -> int:
    return await prisma.seatbooking.count(where={"createdAt": {"gte": start, "lt": end}})


async def count_loans_created_between(start: datetime, end: datetime) -> int:
    return await prisma.loan.count(where={"createdAt": {"gte": start, "lt": end}})


async def count_loans_returned_between(start: datetime, end: datetime) -> int:
    return await prisma.loan.count(where={"returnedAt": {"gte": start, "lt": end}})


async def count_members_created_between(start: datetime, end: datetime) -> int:
    return await prisma.user.count(
        where={
            "role": {"name": Role.MEMBER},
            "deletedAt": None,
            "createdAt": {"gte": start, "lt": end},
        }
    )


async def count_pending_billing_requests() -> int:
    return await prisma.billingrequest.count(where={"status": "pending"})


async def count_pending_reservations() -> int:
    return await prisma.reservation.count(where={"status": "pending"})


async def count_open_support_tickets() -> int:
    return await prisma.supportticket.count(where={"status": "open"})


async def list_books(*, search: str | None, page: int, page_size: int) -> tuple[list[Book], int]:
    where: dict = {"deletedAt": None}
    if search:
        where["OR"] = [
            {"title": {"contains": search, "mode": "insensitive"}},
            {"author": {"contains": search, "mode": "insensitive"}},
        ]

    return await paginate(
        prisma.book,
        where=where,
        order={"title": "asc"},
        skip=(page - 1) * page_size,
        take=page_size,
    )


async def list_active_loans_for_books(book_ids: list[str]) -> list[Loan]:
    if not book_ids:
        return []
    # Pre-sorted by dueDate ascending so the first match per book is the soonest
    # a copy is expected back.
    return await prisma.loan.find_many(
        where={"bookId": {"in": book_ids}, "returnedAt": None},
        order={"dueDate": "asc"},
    )


async def list_loans_borrowed_since(start: datetime) -> list[Loan]:
    """One bulk fetch feeding three dashboard charts (most-borrowed books, member
    activity, overdue/fines) — each buckets a different subset/field of the same rows
    in Python, mirroring admin/service.py::get_profit_and_loss's bulk-fetch-then-bucket
    pattern rather than one query per month per chart.
    """
    return await prisma.loan.find_many(
        where={"borrowedAt": {"gte": start}},
        include={"book": True},
    )


async def list_members_created_since(start: datetime) -> list[User]:
    return await prisma.user.find_many(
        where={"role": {"name": Role.MEMBER}, "deletedAt": None, "createdAt": {"gte": start}}
    )


# ── AI insight cards (manager/insights.py) ───────────────────────────────────
# Grouped counts, not per-loan/per-reservation rows — the demand forecast only ever
# needs "how many in each window, per book" and the risk score only needs "how many
# late vs total, per member", so aggregating in SQL avoids hydrating the underlying
# rows just to count them in Python.


async def count_loans_by_book_in_windows(
    *, recent_start: datetime, prior_start: datetime
) -> dict[str, tuple[int, int]]:
    """book_id -> (loans borrowed in [recent_start, now], loans borrowed in
    [prior_start, recent_start))."""
    rows = await prisma.query_raw(
        """SELECT book_id::text AS book_id,
                  COUNT(*) FILTER (WHERE borrowed_at >= $1::timestamptz)::int AS recent,
                  COUNT(*) FILTER (
                    WHERE borrowed_at >= $2::timestamptz AND borrowed_at < $1::timestamptz
                  )::int AS prior
           FROM loans
           WHERE borrowed_at >= $2::timestamptz
           GROUP BY book_id""",
        recent_start,
        prior_start,
    )
    return {row["book_id"]: (row["recent"], row["prior"]) for row in rows}


async def count_reservations_by_book_in_windows(
    *, recent_start: datetime, prior_start: datetime
) -> dict[str, tuple[int, int]]:
    """book_id -> (reservations created in [recent_start, now], in
    [prior_start, recent_start)) — any status, since even a since-cancelled request
    still reflects real demand at the moment it was made."""
    rows = await prisma.query_raw(
        """SELECT book_id::text AS book_id,
                  COUNT(*) FILTER (WHERE created_at >= $1::timestamptz)::int AS recent,
                  COUNT(*) FILTER (
                    WHERE created_at >= $2::timestamptz AND created_at < $1::timestamptz
                  )::int AS prior
           FROM reservations
           WHERE created_at >= $2::timestamptz
           GROUP BY book_id""",
        recent_start,
        prior_start,
    )
    return {row["book_id"]: (row["recent"], row["prior"]) for row in rows}


async def member_late_return_history() -> dict[str, tuple[int, int]]:
    """member_id -> (late_returns, total_returns), across every loan they've ever
    returned. Feeds both each member's personal late rate and the library-wide average
    used as a cold-start fallback for members with no return history yet."""
    rows = await prisma.query_raw(
        """SELECT member_id::text AS member_id,
                  COUNT(*) FILTER (WHERE returned_at::date > due_date::date)::int AS late,
                  COUNT(*)::int AS total
           FROM loans
           WHERE returned_at IS NOT NULL
           GROUP BY member_id"""
    )
    return {row["member_id"]: (row["late"], row["total"]) for row in rows}
