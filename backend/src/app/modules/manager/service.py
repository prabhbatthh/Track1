import asyncio
from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta
from typing import cast

from fastapi import HTTPException, status
from prisma.models import Book, Loan, User

from app.db.prisma import prisma
from app.modules.admin import repository as admin_repository
from app.modules.admin import service as admin_service
from app.modules.admin.constants import OPEN_HOURS
from app.modules.books import repository as books_repository
from app.modules.guardian import service as guardian_service
from app.modules.guardian.schemas import GuardianContactOut, GuardianLinkCreate
from app.modules.loans import repository as loans_repository
from app.modules.loans import service as loans_service
from app.modules.loans.constants import FINE_PER_DAY
from app.modules.loans.schemas import LoanCreate, LoanOut
from app.modules.manager import insights, repository
from app.modules.manager.schemas import (
    DailyFootfallOut,
    DailyLibraryActivityOut,
    DayOfWeekFootfallOut,
    DemandForecastItemOut,
    FootfallAnalyticsOut,
    FootfallRange,
    HourlyFootfallOut,
    LateReturnRiskItemOut,
    ManagerBookAvailabilityOut,
    ManagerBookListOut,
    ManagerDashboardStatsOut,
    ManagerGuardianLinkCreate,
    ManagerLoanCreate,
    ManagerSeatBookingCreate,
    MemberActivityMonthOut,
    MostBorrowedBookOut,
    MostBorrowedBooksOut,
    OverdueFinesMonthOut,
    PendingReservationOut,
    RevenueMonthOut,
    SeatUtilizationHourOut,
)
from app.modules.members import repository as members_repository
from app.modules.notifications import service as notifications_service
from app.modules.reservations import repository as reservations_repository
from app.modules.reservations.schemas import ReservationOut
from app.modules.seat_booking import service as seat_booking_service
from app.modules.seat_booking.constants import SEAT_LABELS
from app.modules.seat_booking.schemas import SeatBookingCreate, SeatBookingOut
from app.modules.visits import repository as visits_repository

TOTAL_SEATS = len(SEAT_LABELS)
MOST_BORROWED_LIMIT = 25
MEMBER_ACTIVITY_MONTHS = 6
OVERDUE_FINES_MONTHS = 3


def _month_key(moment: datetime) -> str:
    return f"{moment.year:04d}-{moment.month:02d}"


def _month_start(moment: datetime) -> datetime:
    return datetime(moment.year, moment.month, 1, tzinfo=UTC)


def _previous_month_start(moment: datetime) -> datetime:
    last_day_of_previous_month = _month_start(moment) - timedelta(days=1)
    return _month_start(last_day_of_previous_month)


def _recent_month_starts(count: int, now: datetime) -> list[datetime]:
    # Same helper as admin/service.py's own — duplicated rather than imported, since
    # that one is module-private and this is four lines of pure date arithmetic.
    starts = []
    cursor = _month_start(now)
    for _ in range(count):
        starts.append(cursor)
        cursor = _previous_month_start(cursor)
    starts.reverse()
    return starts


def _today_window() -> tuple[datetime, datetime]:
    now = datetime.now(UTC)
    start = datetime(now.year, now.month, now.day, tzinfo=UTC)
    return start, start + timedelta(days=1)


FOOTFALL_RANGE_DAYS: dict[FootfallRange, int] = {"7d": 7, "30d": 30, "3m": 90}


async def get_footfall_analytics(range_key: FootfallRange) -> FootfallAnalyticsOut:
    """One bulk fetch of every check-in in the window, bucketed by day / hour / weekday /
    duration in Python — avoids one query per day the way a naive loop would."""
    days = FOOTFALL_RANGE_DAYS[range_key]
    today_start, _ = _today_window()
    start = today_start - timedelta(days=days - 1)
    end = today_start + timedelta(days=1)
    visits = await visits_repository.list_check_ins_between(start, end)

    visits_by_day: dict[str, int] = defaultdict(int)
    visits_by_hour: dict[int, int] = defaultdict(int)
    visits_by_weekday: dict[int, int] = defaultdict(int)
    duration_minutes: list[float] = []
    for visit in visits:
        visits_by_day[visit.checkedInAt.date().isoformat()] += 1
        visits_by_hour[visit.checkedInAt.hour] += 1
        visits_by_weekday[visit.checkedInAt.weekday()] += 1
        # Still-open visits (no checkedOutAt yet) simply don't contribute a duration —
        # they're not silently treated as zero-length or dropped from the day/hour counts.
        if visit.checkedOutAt is not None:
            elapsed = (visit.checkedOutAt - visit.checkedInAt).total_seconds() / 60
            duration_minutes.append(elapsed)

    daily = [
        DailyFootfallOut(
            date=(start + timedelta(days=offset)).date(),
            visits=visits_by_day.get((start + timedelta(days=offset)).date().isoformat(), 0),
        )
        for offset in range(days)
    ]
    peak_hours = [
        HourlyFootfallOut(hour=hour, visits=visits_by_hour.get(hour, 0)) for hour in range(24)
    ]
    average_visit_minutes = (
        round(sum(duration_minutes) / len(duration_minutes), 1) if duration_minutes else None
    )

    busiest_day = quietest_day = None
    if visits:
        all_weekday_counts = {day: 0 for day in range(7)}
        for visit in visits:
            all_weekday_counts[visit.checkedInAt.weekday()] += 1

        busiest_key = max(all_weekday_counts, key=lambda day: (all_weekday_counts[day], -day))
        quietest_key = min(
            all_weekday_counts,
            key=lambda day: (all_weekday_counts[day], day if day != busiest_key else 99),
        )

        busiest_day = DayOfWeekFootfallOut(
            day_of_week=busiest_key, visits=all_weekday_counts[busiest_key]
        )
        quietest_day = DayOfWeekFootfallOut(
            day_of_week=quietest_key, visits=all_weekday_counts[quietest_key]
        )

    return FootfallAnalyticsOut(
        range=range_key,
        daily=daily,
        peak_hours=peak_hours,
        average_visit_minutes=average_visit_minutes,
        busiest_day=busiest_day,
        quietest_day=quietest_day,
    )


LIBRARY_ACTIVITY_DAYS = 7


async def _get_library_activity(days: int = LIBRARY_ACTIVITY_DAYS) -> list[DailyLibraryActivityOut]:
    # Per-day Prisma-native counts (not raw SQL) — reuses the exact comparison Prisma
    # already builds correctly for count_loans_created_between's *_today field above,
    # rather than hand-rolling timestamp arithmetic in SQL against a tz-naive column.
    # A week of small indexed counts is cheap; loans is not a huge table.
    today_start, _ = _today_window()
    activity = []
    for offset in range(days - 1, -1, -1):
        day_start = today_start - timedelta(days=offset)
        day_end = day_start + timedelta(days=1)
        issued = await repository.count_loans_created_between(day_start, day_end)
        returned = await repository.count_loans_returned_between(day_start, day_end)
        activity.append(
            DailyLibraryActivityOut(date=day_start.date(), issued=issued, returned=returned)
        )
    return activity


def _rank_borrowed_books(loans: list[Loan], since: datetime) -> list[MostBorrowedBookOut]:
    matching = [loan for loan in loans if loan.borrowedAt >= since]
    counts = Counter(loan.bookId for loan in matching)
    titles = {loan.bookId: loan.book.title for loan in matching}
    return [
        MostBorrowedBookOut(book_id=book_id, title=titles[book_id], count=count)
        for book_id, count in counts.most_common(MOST_BORROWED_LIMIT)
    ]


def _most_borrowed_books(loans: list[Loan], now: datetime) -> MostBorrowedBooksOut:
    # All three rankings come from the same 6-month bulk fetch (loans param) — no extra
    # queries — since 6 months is already the widest window any of them needs.
    three_months_start = _recent_month_starts(3, now)[0]
    six_months_start = _recent_month_starts(6, now)[0]
    return MostBorrowedBooksOut(
        this_month=_rank_borrowed_books(loans, _month_start(now)),
        last_3_months=_rank_borrowed_books(loans, three_months_start),
        last_6_months=_rank_borrowed_books(loans, six_months_start),
    )


async def _member_activity(
    loans: list[Loan], month_starts: list[datetime]
) -> list[MemberActivityMonthOut]:
    members = await repository.list_members_created_since(month_starts[0])
    new_by_month: dict[str, int] = defaultdict(int)
    for member in members:
        new_by_month[_month_key(member.createdAt)] += 1

    active_by_month: dict[str, set[str]] = defaultdict(set)
    for loan in loans:
        active_by_month[_month_key(loan.borrowedAt)].add(loan.memberId)

    return [
        MemberActivityMonthOut(
            month=_month_key(start),
            new_members=new_by_month.get(_month_key(start), 0),
            active_members=len(active_by_month.get(_month_key(start), set())),
        )
        for start in month_starts
    ]


async def _seat_utilization() -> list[SeatUtilizationHourOut]:
    today_start, _ = _today_window()
    bookings_by_hour = await admin_repository.count_seat_bookings_by_hour(date=today_start)
    return [
        SeatUtilizationHourOut(
            hour=hour, percent=round(bookings_by_hour.get(hour, 0) / TOTAL_SEATS * 100)
        )
        for hour in OPEN_HOURS
    ]


async def _overdue_and_fines(
    loans: list[Loan], month_starts: list[datetime]
) -> list[OverdueFinesMonthOut]:
    now = datetime.now(UTC)
    overdue_by_month: dict[str, int] = defaultdict(int)
    generated_by_month: dict[str, int] = defaultdict(int)
    for loan in loans:
        end = loan.returnedAt or now
        days_late = max(0, (end.date() - loan.dueDate.date()).days)
        if days_late > 0:
            key = _month_key(loan.dueDate)
            overdue_by_month[key] += 1
            generated_by_month[key] += days_late * FINE_PER_DAY

    result = []
    for index, start in enumerate(month_starts):
        end_of_month = month_starts[index + 1] if index + 1 < len(month_starts) else None
        collected = await admin_repository.sum_payments(
            start=start, end=end_of_month, has_plan=False
        )
        key = _month_key(start)
        result.append(
            OverdueFinesMonthOut(
                month=key,
                overdue_books=overdue_by_month.get(key, 0),
                fines_generated=generated_by_month.get(key, 0),
                fines_collected=collected,
            )
        )
    return result


async def _revenue() -> list[RevenueMonthOut]:
    # Reuses the admin dashboard's own revenue-by-month computation wholesale rather
    # than re-deriving it — same 6 months, same "what counts as revenue" definition.
    profit_and_loss = await admin_service.get_profit_and_loss()
    return [RevenueMonthOut(month=m.month, total=m.revenue) for m in profit_and_loss.months]


async def get_dashboard_stats() -> ManagerDashboardStatsOut:
    start, end = _today_window()
    now = datetime.now(UTC)
    member_activity_starts = _recent_month_starts(MEMBER_ACTIVITY_MONTHS, now)
    overdue_fines_starts = _recent_month_starts(OVERDUE_FINES_MONTHS, now)
    # member_activity_starts is the wider (6-month) window and OVERDUE_FINES_MONTHS <
    # MEMBER_ACTIVITY_MONTHS, so one bulk fetch (by borrowedAt) safely covers both —
    # a loan's dueDate is at most ~2 weeks after borrowedAt, well inside the margin.
    loans_since = await repository.list_loans_borrowed_since(member_activity_starts[0])

    # Matches admin/service.py::get_dashboard's own gather-then-cast pattern — mypy
    # can't carry per-element types through asyncio.gather past a handful of args.
    results = await asyncio.gather(
        repository.count_seat_bookings_created_between(start, end),
        repository.count_loans_created_between(start, end),
        repository.count_members_created_between(start, end),
        repository.count_pending_billing_requests(),
        repository.count_open_support_tickets(),
        repository.count_pending_reservations(),
        _get_library_activity(),
        _member_activity(loans_since, member_activity_starts),
        _seat_utilization(),
        _overdue_and_fines(loans_since, overdue_fines_starts),
        _revenue(),
    )
    seats_booked_today = cast(int, results[0])
    books_issued_today = cast(int, results[1])
    new_registrations_today = cast(int, results[2])
    pending_billing_requests = cast(int, results[3])
    open_support_tickets = cast(int, results[4])
    pending_reservations = cast(int, results[5])
    library_activity = cast(list[DailyLibraryActivityOut], results[6])
    member_activity = cast(list[MemberActivityMonthOut], results[7])
    seat_utilization = cast(list[SeatUtilizationHourOut], results[8])
    overdue_fines = cast(list[OverdueFinesMonthOut], results[9])
    revenue = cast(list[RevenueMonthOut], results[10])
    most_borrowed_books = _most_borrowed_books(loans_since, now)

    return ManagerDashboardStatsOut(
        seats_booked_today=seats_booked_today,
        books_issued_today=books_issued_today,
        new_registrations_today=new_registrations_today,
        pending_tasks=pending_billing_requests + open_support_tickets + pending_reservations,
        library_activity=library_activity,
        most_borrowed_books=most_borrowed_books,
        member_activity=member_activity,
        seat_utilization=seat_utilization,
        overdue_fines=overdue_fines,
        revenue=revenue,
    )


async def _find_member_or_404(member_id: str) -> User:
    member = await members_repository.find_by_id(member_id)
    if member is None or member.deletedAt is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
    return member


async def book_seat_for_member(payload: ManagerSeatBookingCreate) -> SeatBookingOut:
    member = await _find_member_or_404(payload.member_id)
    return await seat_booking_service.book_seat(
        member,
        SeatBookingCreate(seat_label=payload.seat_label, date=payload.date, hour=payload.hour),
    )


async def issue_loan_for_member(manager_id: str, payload: ManagerLoanCreate) -> LoanOut:
    await _find_member_or_404(payload.member_id)
    return await loans_service.create_loan(
        manager_id,
        LoanCreate(book_id=payload.book_id, member_id=payload.member_id),
        duration_days=payload.duration_days,
    )


async def _resolve_pair(payload: ManagerGuardianLinkCreate) -> GuardianLinkCreate:
    student = await members_repository.find_by_email(payload.student_email)
    guardian = await members_repository.find_by_email(payload.guardian_email)
    if student is None or guardian is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Guardian or member not found")
    return GuardianLinkCreate(guardian_id=guardian.id, member_id=student.id)


async def link_guardian(payload: ManagerGuardianLinkCreate) -> None:
    await guardian_service.link_child(await _resolve_pair(payload))


async def set_guardian(payload: ManagerGuardianLinkCreate) -> None:
    await guardian_service.set_guardian(await _resolve_pair(payload))


async def unlink_guardian(student_id: str) -> None:
    await guardian_service.unlink_child(student_id)


async def get_student_guardian(student_id: str) -> GuardianContactOut | None:
    return await guardian_service.get_my_guardian(student_id)


async def list_pending_reservations() -> list[PendingReservationOut]:
    rows = await reservations_repository.list_pending()
    return [PendingReservationOut.from_prisma(row) for row in rows]


async def approve_reservation(
    manager_id: str, reservation_id: str, duration_days: int
) -> ReservationOut:
    async with prisma.tx() as tx:
        # Serialize decisions for the same reservation, then re-read its state inside
        # the transaction. The loan helper separately locks the book inventory.
        await tx.execute_raw("SELECT pg_advisory_xact_lock(hashtext($1))", reservation_id)
        reservation = await reservations_repository.find_by_id(reservation_id, client=tx)
        if reservation is None or reservation.status != "pending":
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Pending reservation not found")

        loan = await loans_service.create_loan(
            manager_id,
            LoanCreate(book_id=reservation.bookId, member_id=reservation.memberId),
            duration_days=duration_days,
            client=tx,
        )
        updated = await reservations_repository.approve(reservation_id, loan_id=loan.id, client=tx)

    await notifications_service.create_notification(
        reservation.memberId,
        "reservation-approved",
        f'Your request to borrow "{reservation.book.title}" was approved — '
        f"please pick it up and return it by {loan.due_date.strftime('%b %d, %Y')}.",
    )
    return ReservationOut.from_prisma(updated)


async def reject_reservation(reservation_id: str) -> ReservationOut:
    async with prisma.tx() as tx:
        # Same lock key and same re-read-inside-the-transaction as approve_reservation.
        # Both decisions must serialise against each other, or an approve that read
        # 'pending' before a rejection committed overwrites it and issues the book.
        await tx.execute_raw("SELECT pg_advisory_xact_lock(hashtext($1))", reservation_id)
        reservation = await reservations_repository.find_by_id(reservation_id, client=tx)
        if reservation is None or reservation.status != "pending":
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Pending reservation not found")
        updated = await reservations_repository.reject(reservation_id, client=tx)

    await notifications_service.create_notification(
        reservation.memberId,
        "reservation-rejected",
        f'Your request to borrow "{reservation.book.title}" was declined.',
    )
    return ReservationOut.from_prisma(updated)


async def list_book_availability(
    *, search: str | None, page: int, page_size: int
) -> ManagerBookListOut:
    books, total = await repository.list_books(search=search, page=page, page_size=page_size)
    active_loans = await repository.list_active_loans_for_books([book.id for book in books])

    loaned_out_count: dict[str, int] = {}
    earliest_due_at: dict[str, datetime] = {}
    for loan in active_loans:
        loaned_out_count[loan.bookId] = loaned_out_count.get(loan.bookId, 0) + 1
        # Loans arrive sorted by dueDate ascending, so the first one seen per book
        # is already the earliest.
        earliest_due_at.setdefault(loan.bookId, loan.dueDate)

    items = []
    for book in books:
        available_copies = max(0, book.totalCopies - loaned_out_count.get(book.id, 0))
        items.append(
            ManagerBookAvailabilityOut(
                id=book.id,
                title=book.title,
                author=book.author,
                category=book.category,
                total_copies=book.totalCopies,
                available_copies=available_copies,
                is_available=available_copies > 0,
                expected_available_at=(
                    None if available_copies > 0 else earliest_due_at.get(book.id)
                ),
            )
        )

    return ManagerBookListOut(items=items, total=total, page=page, page_size=page_size)


async def get_demand_forecast() -> list[DemandForecastItemOut]:
    now = datetime.now(UTC)
    recent_start = now - timedelta(days=insights.DEMAND_RECENT_WINDOW_DAYS)
    prior_start = recent_start - timedelta(days=insights.DEMAND_PRIOR_WINDOW_DAYS)

    loan_counts, reservation_counts, pending = await asyncio.gather(
        repository.count_loans_by_book_in_windows(
            recent_start=recent_start, prior_start=prior_start
        ),
        repository.count_reservations_by_book_in_windows(
            recent_start=recent_start, prior_start=prior_start
        ),
        reservations_repository.list_pending(),
    )

    pending_by_book: dict[str, int] = defaultdict(int)
    for reservation in pending:
        pending_by_book[reservation.bookId] += 1

    book_ids = set(loan_counts) | set(reservation_counts) | set(pending_by_book)
    if not book_ids:
        return []

    books_by_id = {book.id: book for book in await books_repository.list_by_ids(list(book_ids))}

    scored: list[tuple[insights.DemandForecast, Book]] = []
    for book_id in book_ids:
        book = books_by_id.get(book_id)
        if book is None or book.deletedAt is not None:
            continue
        loan_recent, loan_prior = loan_counts.get(book_id, (0, 0))
        res_recent, res_prior = reservation_counts.get(book_id, (0, 0))
        forecast = insights.score_demand(
            insights.DemandSignal(
                book_id=book_id,
                recent_activity=loan_recent + res_recent,
                prior_activity=loan_prior + res_prior,
                pending_reservations=pending_by_book.get(book_id, 0),
                total_copies=book.totalCopies,
            )
        )
        if forecast is not None:
            scored.append((forecast, book))

    scored.sort(
        key=lambda pair: (pair[0].demand_level == "high", pair[0].change_pct or 0), reverse=True
    )

    return [
        DemandForecastItemOut(
            book_id=book.id,
            title=book.title,
            author=book.author,
            category=book.category,
            total_copies=book.totalCopies,
            recent_activity=forecast.recent_activity,
            prior_activity=forecast.prior_activity,
            change_pct=forecast.change_pct,
            pending_reservations=forecast.pending_reservations,
            demand_level=forecast.demand_level,
            reason=forecast.reason,
        )
        for forecast, book in scored[: insights.DEMAND_RESULT_LIMIT]
    ]


async def get_late_return_risk() -> list[LateReturnRiskItemOut]:
    now = datetime.now(UTC)
    active_loans, history_by_member = await asyncio.gather(
        loans_repository.list_active(),
        repository.member_late_return_history(),
    )
    if not active_loans:
        return []

    total_late = sum(late for late, _total in history_by_member.values())
    total_returns = sum(total for _late, total in history_by_member.values())
    library_wide_rate_pct = (total_late / total_returns * 100) if total_returns > 0 else 0.0

    items = []
    for loan in active_loans:
        late, total = history_by_member.get(loan.memberId, (0, 0))
        member_history = (
            insights.MemberLoanHistory(late_returns=late, total_returns=total)
            if total > 0
            else None
        )
        risk = insights.score_late_return_risk(
            due_date=loan.dueDate,
            now=now,
            member_history=member_history,
            library_wide_late_rate_pct=library_wide_rate_pct,
        )
        items.append(
            LateReturnRiskItemOut(
                loan_id=loan.id,
                book_title=loan.book.title,
                member_id=loan.memberId,
                member_name=loan.member.fullName,
                due_date=loan.dueDate,
                is_overdue=loan.dueDate < now,
                days_overdue=max(0, (now.date() - loan.dueDate.date()).days),
                risk_score=risk.risk_score,
                risk_level=risk.risk_level,
                reason=risk.reason,
            )
        )

    items.sort(key=lambda item: item.risk_score, reverse=True)
    return items[: insights.LATE_RETURN_RESULT_LIMIT]
