from datetime import datetime

from prisma import Prisma
from prisma.models import Loan

from app.db.pagination import paginate
from app.db.prisma import prisma

INCLUDE = {"book": True, "member": True}


async def create(*, book_id: str, member_id: str, due_date: datetime, created_by_id: str) -> Loan:
    return await prisma.loan.create(
        data={
            "bookId": book_id,
            "memberId": member_id,
            "dueDate": due_date,
            "createdById": created_by_id,
        },
        include=INCLUDE,
    )


async def create_if_available(
    *,
    book_id: str,
    member_id: str,
    due_date: datetime,
    created_by_id: str,
    client: Prisma | None = None,
) -> Loan | None:
    """Create a loan while holding a transaction-scoped lock for its book.

    All issuance paths use the same advisory-lock key, making the physical-copy
    capacity check and insert atomic even when several workers approve at once.
    """

    async def _create(db: Prisma) -> Loan | None:
        await db.execute_raw("SELECT pg_advisory_xact_lock(hashtext($1))", book_id)
        book = await db.book.find_unique(where={"id": book_id})
        if book is None:
            return None
        active = await db.loan.count(where={"bookId": book_id, "returnedAt": None})
        if active >= book.totalCopies:
            return None
        return await db.loan.create(
            data={
                "bookId": book_id,
                "memberId": member_id,
                "dueDate": due_date,
                "createdById": created_by_id,
            },
            include=INCLUDE,
        )

    if client is not None:
        return await _create(client)
    async with prisma.tx() as tx:
        return await _create(tx)


async def find_by_id(loan_id: str) -> Loan | None:
    return await prisma.loan.find_unique(where={"id": loan_id}, include=INCLUDE)


async def list_all(*, page: int, page_size: int) -> tuple[list[Loan], int]:
    # Newest-first: a paginated history view wants recent activity on page 1, not the
    # oldest loan ever made.
    return await paginate(
        prisma.loan,
        where={},
        order={"borrowedAt": "desc"},
        skip=(page - 1) * page_size,
        take=page_size,
        include=INCLUDE,
    )


# list_past_due()/list_active() below stay unpaginated on purpose — they feed the
# due-soon reminder sweep and the outstanding-fines total, not a browsable page. A
# skip/take here would silently skip reminders or undercount fines owed past whatever
# page happened to load, instead of just shortening a list.
# A loan carries a fine when the day it came back — or today, if it is still out —
# is later than its due date. That is a column-to-column comparison, which Prisma's
# query builder cannot express, so the two helpers below drop to SQL rather than
# fetching a superset and discarding rows in Python.
_FINED_PREDICATE = """
    COALESCE(l.returned_at, (NOW() AT TIME ZONE 'UTC'))::date > l.due_date::date
"""


async def sum_outstanding_fine_days() -> int:
    """Total unpaid late-days across every loan, summed in the database.

    The caller multiplies by FINE_PER_DAY so the rate stays defined in one place.
    Previously this loaded every past-due loan with its book and member relations
    just to add up a single number for two dashboards.
    """
    rows = await prisma.query_raw(
        f"""SELECT COALESCE(SUM(
                     COALESCE(l.returned_at, (NOW() AT TIME ZONE 'UTC'))::date
                     - l.due_date::date
                   ), 0)::bigint AS days
            FROM loans l
            WHERE l.fine_paid = false AND {_FINED_PREDICATE}"""
    )
    return int(rows[0]["days"]) if rows else 0


async def list_fined(*, skip: int = 0, take: int | None = None) -> list[Loan]:
    """Loans that actually carry a fine, most overdue first.

    Resolves ids in SQL (where the predicate can be evaluated) and hydrates only
    those, instead of loading every loan whose due date has passed.
    """
    limit_clause = "LIMIT $1 OFFSET $2" if take is not None else "OFFSET $1"
    params: tuple = (take, skip) if take is not None else (skip,)
    rows = await prisma.query_raw(
        f"""SELECT l.id::text AS id
            FROM loans l
            WHERE {_FINED_PREDICATE}
            ORDER BY l.due_date ASC
            {limit_clause}""",
        *params,
    )
    ids = [row["id"] for row in rows]
    if not ids:
        return []
    loans = await prisma.loan.find_many(where={"id": {"in": ids}}, include=INCLUDE)
    order = {loan_id: index for index, loan_id in enumerate(ids)}
    return sorted(loans, key=lambda loan: order[loan.id])


async def list_past_due(*, now: datetime) -> list[Loan]:
    """Loans whose due date has passed — the only ones that can carry a fine.

    A superset of the fined set, not an exact match: a loan returned before it was due
    still shows up here and gets dropped by the days_late check in the service (Prisma
    can't compare returnedAt against dueDate in a where clause). Still far cheaper than
    loading and hydrating every loan ever created, which is what the fines view did.
    """
    return await prisma.loan.find_many(
        where={"dueDate": {"lt": now}},
        include=INCLUDE,
        order={"dueDate": "asc"},
    )


async def list_active() -> list[Loan]:
    return await prisma.loan.find_many(
        where={"returnedAt": None}, include=INCLUDE, order={"dueDate": "asc"}
    )


async def list_for_member(member_id: str, *, client: Prisma | None = None) -> list[Loan]:
    db = client or prisma
    return await db.loan.find_many(
        where={"memberId": member_id}, include=INCLUDE, order={"borrowedAt": "desc"}
    )


async def count_active_for_book(book_id: str) -> int:
    return await prisma.loan.count(where={"bookId": book_id, "returnedAt": None})


async def list_active_for_book(book_id: str) -> list[Loan]:
    return await prisma.loan.find_many(
        where={"bookId": book_id, "returnedAt": None},
        order={"dueDate": "asc"},
    )


async def list_active_for_books(book_ids: list[str]) -> list[Loan]:
    """Outstanding loans across several books at once, soonest due first."""
    return await prisma.loan.find_many(
        where={"bookId": {"in": book_ids}, "returnedAt": None},
        order={"dueDate": "asc"},
    )


async def mark_returned(loan_id: str, *, returned_at: datetime) -> Loan:
    return await prisma.loan.update(
        where={"id": loan_id}, data={"returnedAt": returned_at}, include=INCLUDE
    )


async def mark_reminded(loan_id: str, *, reminded_at: datetime) -> Loan:
    return await prisma.loan.update(
        where={"id": loan_id}, data={"lastRemindedAt": reminded_at}, include=INCLUDE
    )


async def claim_reminder(loan_id: str, *, remind_cutoff: datetime, claimed_at: datetime) -> bool:
    """Atomically claim a reminder before any external side effect is sent."""
    updated = await prisma.loan.update_many(
        where={
            "id": loan_id,
            "returnedAt": None,
            "OR": [
                {"lastRemindedAt": None},
                {"lastRemindedAt": {"lte": remind_cutoff}},
            ],
        },
        data={"lastRemindedAt": claimed_at},
    )
    return updated == 1


async def mark_fine_paid(loan_id: str, *, client: Prisma | None = None) -> Loan:
    db = client or prisma
    return await db.loan.update(where={"id": loan_id}, data={"finePaid": True}, include=INCLUDE)


async def mark_fines_paid(loan_ids: list[str], *, client: Prisma | None = None) -> int:
    db = client or prisma
    result = await db.loan.update_many(where={"id": {"in": loan_ids}}, data={"finePaid": True})
    return result
