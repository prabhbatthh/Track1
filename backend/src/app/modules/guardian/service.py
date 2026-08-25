import logging
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from langchain_core.messages import HumanMessage, SystemMessage
from prisma.errors import ForeignKeyViolationError, UniqueViolationError
from prisma.models import User

from app.core.constants import Role
from app.core.llm import build_chat_llm
from app.modules.guardian import repository
from app.modules.guardian.schemas import (
    GuardianChildOut,
    GuardianContactOut,
    GuardianLinkCreate,
)
from app.modules.loans import service as loans_service
from app.modules.members import repository as members_repository
from app.modules.members.schemas import ReadingProgressOut
from app.modules.notifications import service as notifications_service
from app.modules.payments import repository as payments_repository
from app.modules.payments import service as payments_service
from app.modules.payments.schemas import PaymentOut
from app.modules.pricing_plans import repository as pricing_plans_repository
from app.modules.seat_booking import service as seat_booking_service
from app.modules.seat_booking.schemas import (
    SeatBookingCreate,
    SeatBookingOut,
    SeatNotifyCreate,
)

logger = logging.getLogger(__name__)

RENEWAL_PLAN_CODE = "1m"


async def _validate_pair(guardian_id: str, member_id: str) -> None:
    """Both accounts must exist, be active, and hold the right role.

    Shared by link_child and set_guardian so the two can't drift into accepting
    different things — only what they do with a pre-existing link differs.
    """
    guardian = await members_repository.find_by_id(guardian_id)
    child = await members_repository.find_by_id(member_id)
    if guardian is None or child is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Guardian or member not found",
        )
    if (
        guardian.role is None
        or guardian.role.name != Role.GUARDIAN
        or not guardian.isActive
        or guardian.deletedAt is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Guardian must be an active guardian account",
        )
    if (
        child.role is None
        or child.role.name != Role.MEMBER
        or not child.isActive
        or child.deletedAt is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Child must be an active member account",
        )


async def link_child(payload: GuardianLinkCreate) -> None:
    await _validate_pair(payload.guardian_id, payload.member_id)

    try:
        await repository.create_link(guardian_id=payload.guardian_id, member_id=payload.member_id)
    except UniqueViolationError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This member already has a guardian",
        ) from exc
    except ForeignKeyViolationError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Guardian or member not found",
        ) from exc


async def link_my_guardian(member_id: str, guardian_email: str) -> GuardianContactOut:
    guardian = await members_repository.find_by_email(guardian_email.strip())
    if (
        guardian is None
        or guardian.role is None
        or guardian.role.name != Role.GUARDIAN
        or not guardian.isActive
        or guardian.deletedAt is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active guardian account found with this email",
        )

    await repository.upsert_link(guardian_id=guardian.id, member_id=member_id)
    return GuardianContactOut(
        id=guardian.id,
        full_name=guardian.fullName,
        email=guardian.email,
        linked_at=datetime.now(UTC),
    )


async def unlink_my_guardian(member_id: str) -> None:
    await repository.delete_link_for_member(member_id=member_id)


async def set_guardian(payload: GuardianLinkCreate) -> None:
    """Link, or repoint an existing link at a different guardian.

    Separate from link_child rather than making that one replace: linking a second
    guardian over an existing one is still a 409 there (staff shouldn't overwrite a
    link by accident), while this is the deliberate "change guardian" action.
    """
    await _validate_pair(payload.guardian_id, payload.member_id)

    try:
        await repository.upsert_link(guardian_id=payload.guardian_id, member_id=payload.member_id)
    except ForeignKeyViolationError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Guardian or member not found",
        ) from exc


async def unlink_child(member_id: str) -> None:
    removed = await repository.delete_link_for_member(member_id)
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This member does not have a guardian",
        )


async def get_my_guardian(member_id: str) -> GuardianContactOut | None:
    link = await repository.find_link_for_member(member_id)
    if link is None or link.guardian is None:
        return None
    return GuardianContactOut(
        id=link.guardian.id,
        full_name=link.guardian.fullName,
        email=link.guardian.email,
        linked_at=link.createdAt,
    )


async def _find_child_or_403(guardian_id: str, child_id: str) -> User:
    children = await repository.list_children(guardian_id)
    child = next((c for c in children if c.id == child_id), None)
    if child is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This member isn't linked to you"
        )
    return child


async def _child_out(child: User) -> GuardianChildOut:
    child_progress = await members_repository.list_reading_progress(child.id)
    progress = [ReadingProgressOut.from_prisma(p) for p in child_progress]

    loans = await loans_service.list_my_loans(child.id)
    unpaid = [loan for loan in loans if loan.fine_amount > 0 and not loan.fine_paid]
    outstanding_fine = sum(loan.fine_amount for loan in unpaid)
    worst_loan = max(unpaid, key=lambda loan: loan.days_late, default=None)

    membership_payments = await payments_repository.list_membership_payments(child.id)
    subscription_expires_on = payments_service.calculate_membership_expiry(membership_payments)

    return GuardianChildOut(
        id=child.id,
        full_name=child.fullName,
        email=child.email,
        currently_reading=[p for p in progress if p.status == "reading"],
        completed=[p for p in progress if p.status == "completed"],
        outstanding_fine=outstanding_fine,
        fine_book_title=worst_loan.book_title if worst_loan else None,
        fine_due_date=worst_loan.due_date if worst_loan else None,
        subscription_expires_on=subscription_expires_on,
    )


async def list_my_children(guardian_id: str) -> list[GuardianChildOut]:
    children = await repository.list_children(guardian_id)
    return [await _child_out(child) for child in children]


async def list_child_payments(guardian_id: str, child_id: str) -> list[PaymentOut]:
    child = await _find_child_or_403(guardian_id, child_id)
    # This view isn't paginated itself (a guardian has few children, each with a short
    # history) — page_size just mirrors the old hard cap so behavior is unchanged.
    payments, _total = await payments_repository.list_payments_for_user(
        child.id, page=1, page_size=200
    )
    return [PaymentOut.from_prisma(payment) for payment in payments]


async def pay_child_fines(guardian_id: str, child_id: str) -> None:
    child = await _find_child_or_403(guardian_id, child_id)

    loans = await loans_service.list_my_loans(child.id)
    unpaid = [loan for loan in loans if loan.fine_amount > 0 and not loan.fine_paid]
    if not unpaid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No outstanding fines for this child")

    total = sum(loan.fine_amount for loan in unpaid)
    # This endpoint is a request to pay at the library, not proof that money moved.
    # Only a verified gateway callback or staff cash-reconciliation flow may settle a
    # loan/create a successful Payment row.
    await notifications_service.notify_roles(
        [Role.MANAGER],
        "payment-pending",
        f"A guardian wants to pay ₹{total} in cash to clear fines for {child.fullName}.",
    )


async def renew_child_subscription(guardian_id: str, child_id: str) -> None:
    child = await _find_child_or_403(guardian_id, child_id)

    plan = await pricing_plans_repository.find_by_plan_code(RENEWAL_PLAN_CODE)
    if plan is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "No renewal plan configured")

    # Preserve the 204 request contract, but do not grant membership before payment.
    await notifications_service.notify_roles(
        [Role.MANAGER],
        "payment-pending",
        f"A guardian wants to pay ₹{plan.price} in cash for a {plan.months}-month "
        f"membership renewal for {child.fullName}.",
    )


async def book_seat_for_child(
    guardian_id: str, child_id: str, payload: SeatBookingCreate
) -> SeatBookingOut:
    child = await _find_child_or_403(guardian_id, child_id)
    guardian = await members_repository.find_by_id(guardian_id)
    booking_out = await seat_booking_service.book_seat(child, payload)
    if guardian:
        await notifications_service.create_notification(
            child.id,
            "seat-booked-by-guardian",
            f"Seat {payload.seat_label} was booked for you by your guardian ({guardian.fullName}) "
            f"for {payload.date.isoformat()} at {payload.hour:02d}:00.",
        )
    return booking_out


async def request_seat_notify_for_child(
    guardian_id: str, child_id: str, payload: SeatNotifyCreate
) -> None:
    child = await _find_child_or_403(guardian_id, child_id)
    await seat_booking_service.request_notify(child, payload)


def _month_bounds(reference: datetime) -> tuple[datetime, datetime]:
    start = reference.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    next_start = (
        start.replace(year=start.year + 1, month=1)
        if start.month == 12
        else start.replace(month=start.month + 1)
    )
    return start, next_start


_DIGEST_SYSTEM_PROMPT = """You write a one-sentence monthly reading update for a guardian
about a linked child's reading activity.

Given the child's name, how many books they completed this month, how many they
completed last month, and their most common genre this month (if any), write exactly
one warm, plain sentence — like a quick note from a librarian, not a report. Rules:
- State only the numbers and genre given. Never invent a book title, plot detail, or
  any fact not provided.
- If they completed 0 books this month, keep the tone encouraging, not a complaint.
- Output only the sentence itself — no greeting, no sign-off."""


def _fallback_digest_message(
    child_name: str, completed_this_month: int, completed_last_month: int, top_category: str | None
) -> str:
    """Deterministic sentence used when the LLM is unavailable — unlike the review
    digest (supplementary), this monthly touchpoint should still land either way."""
    if completed_this_month == 0:
        return f"{child_name} hasn't finished a book yet this month — a gentle nudge might help!"
    plural = "s" if completed_this_month != 1 else ""
    genre_clause = f", mostly {top_category}" if top_category else ""
    if completed_this_month >= completed_last_month:
        return (
            f"{child_name} finished {completed_this_month} book{plural} this month"
            f"{genre_clause}, up from {completed_last_month} last month."
        )
    return f"{child_name} finished {completed_this_month} book{plural} this month{genre_clause}."


async def _digest_message(
    child_name: str, completed_this_month: int, completed_last_month: int, top_category: str | None
) -> str:
    human = (
        f"Child: {child_name}\n"
        f"Books completed this month: {completed_this_month}\n"
        f"Books completed last month: {completed_last_month}\n"
        f"Most common genre this month: {top_category or 'none'}"
    )
    try:
        llm = build_chat_llm()
        result = await llm.ainvoke(
            [SystemMessage(content=_DIGEST_SYSTEM_PROMPT), HumanMessage(content=human)]
        )
        message = str(result.content).strip()
        if message:
            return message
    except Exception:
        logger.exception("guardian digest narration failed for %r", child_name)

    return _fallback_digest_message(
        child_name, completed_this_month, completed_last_month, top_category
    )


async def send_monthly_reading_digests() -> None:
    """Notifies each guardian with a one-line reading update for their linked child, at
    most once per calendar month per link — see GuardianLink.lastDigestSentAt, the same
    DB-backed cooldown pattern as Loan.lastRemindedAt (see send_due_soon_reminders).
    """
    now = datetime.now(UTC)
    this_month_start, next_month_start = _month_bounds(now)
    last_month_start, _ = _month_bounds(this_month_start - timedelta(days=1))

    links = await repository.list_all_links()
    for link in links:
        sent = link.lastDigestSentAt
        if sent is not None and sent.year == now.year and sent.month == now.month:
            continue

        # One bad link shouldn't stop the rest of the sweep.
        try:
            completed_this_month, top_category = await repository.count_completed_in_range(
                link.memberId, this_month_start, next_month_start
            )
            completed_last_month, _ = await repository.count_completed_in_range(
                link.memberId, last_month_start, this_month_start
            )
            message = await _digest_message(
                link.member.fullName, completed_this_month, completed_last_month, top_category
            )
            await notifications_service.create_notification(
                link.guardianId, "reading-digest", message
            )
            await repository.mark_digest_sent(link.id)
        except Exception:
            logger.exception("guardian monthly digest failed for link %s", link.id)
