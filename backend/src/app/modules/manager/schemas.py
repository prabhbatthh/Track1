from datetime import date as date_type
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.modules.seat_booking.constants import SEAT_LABELS

DurationDays = Literal[3, 5, 7, 10]


class DailyLibraryActivityOut(BaseModel):
    date: date_type
    issued: int
    returned: int


class MostBorrowedBookOut(BaseModel):
    book_id: str
    title: str
    count: int


class MostBorrowedBooksOut(BaseModel):
    this_month: list[MostBorrowedBookOut]
    last_3_months: list[MostBorrowedBookOut]
    last_6_months: list[MostBorrowedBookOut]


class MemberActivityMonthOut(BaseModel):
    month: str  # "2026-08"
    new_members: int
    # Distinct members with >=1 loan created that month. There's no unambiguous existing
    # definition of "returning member" (returning from what gap?), so that series from
    # the original mockup isn't included — would be inventing a metric, not reading one.
    active_members: int


class SeatUtilizationHourOut(BaseModel):
    hour: int
    percent: int


class OverdueFinesMonthOut(BaseModel):
    month: str
    # Loans whose due date fell in this month and were (or still are) late — a proxy for
    # "became overdue this month", since the app doesn't keep daily overdue snapshots.
    overdue_books: int
    fines_generated: int
    fines_collected: int


class RevenueMonthOut(BaseModel):
    month: str
    total: int


class ManagerDashboardStatsOut(BaseModel):
    seats_booked_today: int
    books_issued_today: int
    new_registrations_today: int
    pending_tasks: int
    # Last 7 calendar days including today, oldest first — real counts from Loan.borrowedAt
    # / Loan.returnedAt, not a fixed window like the *_today fields above.
    library_activity: list[DailyLibraryActivityOut]
    most_borrowed_books: MostBorrowedBooksOut
    member_activity: list[MemberActivityMonthOut]
    seat_utilization: list[SeatUtilizationHourOut]
    overdue_fines: list[OverdueFinesMonthOut]
    revenue: list[RevenueMonthOut]


class ManagerSeatBookingCreate(BaseModel):
    member_id: str
    seat_label: str
    date: date_type
    hour: int = Field(ge=0, le=23)

    @field_validator("seat_label")
    @classmethod
    def _validate_seat_label(cls, value: str) -> str:
        if value not in SEAT_LABELS:
            raise ValueError(f"Unknown seat: {value}")
        return value


class ManagerLoanCreate(BaseModel):
    member_id: str
    book_id: str
    duration_days: DurationDays


class ManagerReservationDecision(BaseModel):
    duration_days: DurationDays


class ManagerGuardianLinkCreate(BaseModel):
    student_email: EmailStr
    guardian_email: EmailStr


class PendingReservationOut(BaseModel):
    id: str
    book_id: str
    book_title: str
    member_id: str
    member_name: str
    member_email: str
    requested_at: datetime

    @staticmethod
    def from_prisma(reservation) -> "PendingReservationOut":
        return PendingReservationOut(
            id=reservation.id,
            book_id=reservation.bookId,
            book_title=reservation.book.title,
            member_id=reservation.memberId,
            member_name=reservation.member.fullName,
            member_email=reservation.member.email,
            requested_at=reservation.createdAt,
        )


class ManagerBookAvailabilityOut(BaseModel):
    id: str
    title: str
    author: str
    category: str
    total_copies: int
    available_copies: int
    is_available: bool
    # Earliest due date among this book's active loans — only set when no copy is
    # free right now (i.e. the soonest a copy is expected to come back).
    expected_available_at: datetime | None


class ManagerBookListOut(BaseModel):
    items: list[ManagerBookAvailabilityOut]
    total: int
    page: int
    page_size: int


class DemandForecastItemOut(BaseModel):
    book_id: str
    title: str
    author: str
    category: str
    total_copies: int
    recent_activity: int
    prior_activity: int
    change_pct: float | None
    pending_reservations: int
    demand_level: Literal["high", "medium"]
    reason: str


class LateReturnRiskItemOut(BaseModel):
    loan_id: str
    book_title: str
    member_id: str
    member_name: str
    due_date: datetime
    is_overdue: bool
    days_overdue: int
    risk_score: int
    risk_level: Literal["low", "medium", "high"]
    reason: str


FootfallRange = Literal["7d", "30d", "3m"]


class DailyFootfallOut(BaseModel):
    date: date_type
    visits: int


class HourlyFootfallOut(BaseModel):
    hour: int
    visits: int


class DayOfWeekFootfallOut(BaseModel):
    # Monday=0 .. Sunday=6, same as Python's date.weekday() — the frontend maps this to
    # a localized day name rather than the backend hardcoding an English label.
    day_of_week: int
    visits: int


class FootfallAnalyticsOut(BaseModel):
    range: FootfallRange
    daily: list[DailyFootfallOut]
    peak_hours: list[HourlyFootfallOut]  # 24 entries, hour 0-23
    # None when no visit in range has been checked out yet — never fabricated as 0.
    average_visit_minutes: float | None
    busiest_day: DayOfWeekFootfallOut | None
    quietest_day: DayOfWeekFootfallOut | None
