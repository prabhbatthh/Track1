import asyncio
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status

from app.core.constants import Role
from app.modules.books import repository as books_repository
from app.modules.loans import repository as loans_repository
from app.modules.loans.constants import REMINDER_WINDOW_DAYS
from app.modules.notifications import service as notifications_service
from app.modules.reservations import repository
from app.modules.reservations.schemas import ReservationCreate, ReservationOut


async def _notify_managers(message: str) -> None:
    await notifications_service.notify_roles([Role.MANAGER], "reservation-requested", message)


async def _queue_info_for_books(
    reservations: list,
) -> dict[str, tuple[int | None, int | None]]:
    """Queue position and ETA for every pending reservation in `reservations`.

    Batched deliberately: doing this per reservation meant ~4 queries each (pending
    list, book, active-loan count, active-loan list), so the cost grew with the number
    of reservations. Three queries cover any number of them.
    """
    pending_ones = [r for r in reservations if r.status == "pending"]
    if not pending_ones:
        return {}

    book_ids = list({r.bookId for r in pending_ones})
    all_pending, books, active_loans = await asyncio.gather(
        repository.list_pending_for_books(book_ids),
        books_repository.list_by_ids(book_ids),
        loans_repository.list_active_for_books(book_ids),
    )

    queue_by_book: dict[str, list[str]] = defaultdict(list)
    for row in all_pending:
        queue_by_book[row.bookId].append(row.id)

    total_copies_by_book = {book.id: book.totalCopies for book in books}
    loans_by_book: dict[str, list] = defaultdict(list)
    for loan in active_loans:
        loans_by_book[loan.bookId].append(loan)

    today = datetime.now(UTC).date()
    info: dict[str, tuple[int | None, int | None]] = {}
    for r in pending_ones:
        queue = queue_by_book.get(r.bookId, [])
        position = queue.index(r.id) + 1 if r.id in queue else None
        if position is None:
            info[r.id] = (None, None)
            continue

        loans_ahead = loans_by_book.get(r.bookId, [])
        available_now = max(0, total_copies_by_book.get(r.bookId, 0) - len(loans_ahead))
        if position <= available_now:
            info[r.id] = (position, 0)
            continue

        needed = position - available_now
        eta_days = None
        if needed <= len(loans_ahead):
            eta = loans_ahead[needed - 1].dueDate.date()
            eta_days = max(0, (eta - today).days)
        info[r.id] = (position, eta_days)
    return info


async def list_my_reservations(member_id: str) -> list[ReservationOut]:
    """A member's active reservations, each with its queue position and ETA."""
    reservations = await repository.list_active_for_member(member_id)
    queue_info = await _queue_info_for_books(reservations)

    out = []
    for reservation in reservations:
        position, eta_days = queue_info.get(reservation.id, (None, None))
        out.append(
            ReservationOut.from_prisma(reservation, queue_position=position, eta_days=eta_days)
        )
    return out


async def create_reservation(member_id: str, payload: ReservationCreate) -> ReservationOut:
    blocking_due_after = datetime.now(UTC) + timedelta(days=REMINDER_WINDOW_DAYS)
    reservation = await repository.create_reservation_if_allowed(
        member_id=member_id,
        book_id=payload.book_id,
        blocking_due_after=blocking_due_after,
    )
    if reservation is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have this book reserved or on loan",
        )

    await notifications_service.create_notification(
        member_id,
        "reservation-requested",
        f'Your request to borrow "{reservation.book.title}" is awaiting manager approval.',
    )
    await _notify_managers(
        f'{reservation.member.fullName} requested to borrow "{reservation.book.title}".'
    )
    # Reuse the batched queue maths rather than keeping a second implementation that
    # has to stay in agreement with it — this is just the one-reservation case.
    queue_info = await _queue_info_for_books([reservation])
    position, eta_days = queue_info.get(reservation.id, (None, None))
    return ReservationOut.from_prisma(reservation, queue_position=position, eta_days=eta_days)


async def cancel_reservation(member_id: str, reservation_id: str) -> None:
    reservation = await repository.find_by_id(reservation_id)
    if reservation is None or reservation.memberId != member_id or reservation.status != "pending":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")

    await repository.cancel_reservation(reservation_id)
