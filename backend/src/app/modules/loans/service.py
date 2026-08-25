import logging
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from prisma import Prisma
from prisma.errors import ForeignKeyViolationError

from app.core.mail import send_email_async
from app.db.prisma import prisma
from app.modules.audit_log import service as audit_log_service
from app.modules.audit_log.constants import AuditAction
from app.modules.loans import repository
from app.modules.loans.constants import (
    FINE_PER_DAY,
    LOAN_PERIOD_DAYS,
    REMIND_COOLDOWN_HOURS,
    REMINDER_WINDOW_DAYS,
)
from app.modules.loans.schemas import LoanCreate, LoanListResponse, LoanOut
from app.modules.notifications import service as notifications_service

logger = logging.getLogger(__name__)


async def create_loan(
    created_by_id: str,
    payload: LoanCreate,
    *,
    duration_days: int = LOAN_PERIOD_DAYS,
    client: Prisma | None = None,
) -> LoanOut:
    due_date = datetime.now(UTC) + timedelta(days=duration_days)
    try:
        loan = await repository.create_if_available(
            book_id=payload.book_id,
            member_id=payload.member_id,
            due_date=due_date,
            created_by_id=created_by_id,
            client=client,
        )
    except ForeignKeyViolationError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Book or member not found"
        ) from exc

    if loan is None:
        db = client or prisma
        if await db.book.find_unique(where={"id": payload.book_id}) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Book or member not found"
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No copies are currently available",
        )

    return LoanOut.from_prisma(loan, now=datetime.now(UTC))


async def list_active_loans() -> list[LoanOut]:
    now = datetime.now(UTC)
    rows = await repository.list_active()
    return [LoanOut.from_prisma(row, now=now) for row in rows]


async def list_all_loans(*, page: int, page_size: int) -> LoanListResponse:
    now = datetime.now(UTC)
    rows, total = await repository.list_all(page=page, page_size=page_size)
    return LoanListResponse(
        items=[LoanOut.from_prisma(row, now=now) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


async def list_my_loans(member_id: str, *, client: Prisma | None = None) -> list[LoanOut]:
    now = datetime.now(UTC)
    rows = await repository.list_for_member(member_id, client=client)
    return [LoanOut.from_prisma(row, now=now) for row in rows]


async def list_fines() -> list[LoanOut]:
    # Includes returned-but-still-unpaid loans, not just currently-overdue ones — a
    # member who returns a book late still owes the fine until it's marked paid.
    # The "is it actually fined" test now happens in SQL, so nothing is hydrated
    # only to be filtered back out here.
    now = datetime.now(UTC)
    rows = await repository.list_fined()
    return [LoanOut.from_prisma(row, now=now) for row in rows]


async def sum_outstanding_fines() -> int:
    """Total unpaid fines, aggregated in the database rather than by loading loans."""
    return await repository.sum_outstanding_fine_days() * FINE_PER_DAY


async def settle_fines_for_member(
    member_id: str, amount_paid: int, *, client: Prisma | None = None
) -> int:
    """Clear a member's late-return fines after they've paid, returning the count settled.

    Recording a payment used to leave finePaid untouched, so a member who paid their
    fine kept seeing it owed on every view that derives fines from loans (their own
    dashboard, the guardian card, the IT-Head queue). Oldest fine first, and only
    while the amount paid still covers it — a short payment leaves the rest owed
    rather than wiping the whole balance.
    """
    loans = await list_my_loans(member_id, client=client)
    unpaid = [loan for loan in loans if loan.fine_amount > 0 and not loan.fine_paid]

    remaining = amount_paid
    to_settle: list[str] = []
    for loan in sorted(unpaid, key=lambda item: item.due_date):
        if loan.fine_amount > remaining:
            break
        remaining -= loan.fine_amount
        to_settle.append(loan.id)

    if to_settle:
        await repository.mark_fines_paid(to_settle, client=client)
    return len(to_settle)


async def return_loan(loan_id: str) -> LoanOut:
    existing = await repository.find_by_id(loan_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Loan not found")
    if existing.returnedAt is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This loan was already returned"
        )

    row = await repository.mark_returned(loan_id, returned_at=datetime.now(UTC))
    return LoanOut.from_prisma(row, now=datetime.now(UTC))


async def mark_fine_paid(loan_id: str, *, actor_id: str) -> LoanOut:
    existing = await repository.find_by_id(loan_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Loan not found")

    row = await repository.mark_fine_paid(loan_id)
    out = LoanOut.from_prisma(row, now=datetime.now(UTC))
    # Staff clearing a fine moves money off the books with no gateway record behind it,
    # so it belongs in the audit log next to the other financial decisions.
    await audit_log_service.record(
        actor_id=actor_id,
        action=AuditAction.FINE_MARKED_PAID,
        metadata={"loanId": loan_id, "memberId": existing.memberId, "amount": out.fine_amount},
    )
    return out


def _reminder_message(loan) -> str:
    days_late = max(0, (datetime.now(UTC).date() - loan.dueDate.date()).days)
    if days_late > 0:
        fine = days_late * FINE_PER_DAY
        return (
            f"Reminder: '{loan.book.title}' is {days_late} day(s) overdue — "
            f"a fine of ₹{fine} is due. Please return it as soon as possible."
        )
    due = loan.dueDate.strftime("%b %d, %Y")
    return f"Reminder: '{loan.book.title}' is due back by {due}."


async def send_reminder(loan_id: str) -> None:
    existing = await repository.find_by_id(loan_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Loan not found")

    message = _reminder_message(existing)
    await notifications_service.create_notification(existing.memberId, "fine-reminder", message)
    await send_email_async(existing.member.email, "Library reminder: book due", message)
    await repository.mark_reminded(loan_id, reminded_at=datetime.now(UTC))


async def send_due_soon_reminders() -> None:
    """Nudge everyone whose loan is due within the window, at most once a day each.

    The sweep runs on startup as well as on its ~24h tick, so without the
    lastRemindedAt check every restart re-emailed and re-notified every member in the
    window — in dev, where --reload restarts on each file save, that meant dozens of
    blocking SMTP sends over and over (and a notifications table full of duplicates).
    """
    now = datetime.now(UTC)
    window_end = now + timedelta(days=REMINDER_WINDOW_DAYS)
    remind_cutoff = now - timedelta(hours=REMIND_COOLDOWN_HOURS)

    loans = await repository.list_active()
    for loan in loans:
        if loan.dueDate > window_end:
            continue
        if loan.lastRemindedAt is not None and loan.lastRemindedAt > remind_cutoff:
            continue
        if not await repository.claim_reminder(
            loan.id, remind_cutoff=remind_cutoff, claimed_at=now
        ):
            continue
        # Per-loan, so one unreachable mailbox (or a provider rate limit) doesn't abort
        # the sweep and leave everyone after it un-nudged — but still logged, so a
        # member stuck failing every sweep is discoverable instead of silent forever.
        try:
            await send_reminder(loan.id)
        except Exception:
            logger.exception("send_reminder failed for loan %s", loan.id)
