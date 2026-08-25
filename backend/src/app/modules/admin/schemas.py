from datetime import datetime

from pydantic import BaseModel, Field

from app.modules.admin.constants import ExpenseCategory


class TrendOut(BaseModel):
    direction: str  # "up" | "down"
    percent: int


class AdminStatsOut(BaseModel):
    revenue_mtd: int
    revenue_trend: TrendOut
    expenses_mtd: int
    expenses_trend: TrendOut
    net_profit_mtd: int
    net_profit_trend: TrendOut
    total_members: int
    total_members_trend: TrendOut


class RevenueSourceOut(BaseModel):
    source: str  # membershipFees | eventTickets | finesCollected | donationsValue
    amount: int


class BudgetCategoryOut(BaseModel):
    category: ExpenseCategory
    budgeted: int
    spent: int


class ExpenseCreate(BaseModel):
    category: ExpenseCategory
    amount: int = Field(gt=0)


class ExpenseOut(BaseModel):
    id: str
    category: str
    amount: int
    created_at: datetime

    @staticmethod
    def from_prisma(expense) -> "ExpenseOut":
        return ExpenseOut(
            id=expense.id,
            category=expense.category,
            amount=expense.amount,
            created_at=expense.createdAt,
        )


class SeatStatusOut(BaseModel):
    available: int
    booked: int
    total: int


class SeatOccupancySlotOut(BaseModel):
    hour: int
    percent_filled: int


class AdminDashboardOut(BaseModel):
    stats: AdminStatsOut
    cash_flow: list[RevenueSourceOut]
    budget: list[BudgetCategoryOut]
    seat_status: SeatStatusOut
    seat_occupancy: list[SeatOccupancySlotOut]


class RevenueByPlanItemOut(BaseModel):
    label: str
    amount: int
    count: int


class RevenueByPlanOut(BaseModel):
    items: list[RevenueByPlanItemOut]
    total: int


class MonthlyFigureOut(BaseModel):
    month: str  # "YYYY-MM"
    revenue: int
    expenses: int
    net_profit: int


class ProfitAndLossOut(BaseModel):
    months: list[MonthlyFigureOut]
    total_revenue: int
    total_expenses: int
    total_net_profit: int


class ExpenseBreakdownItemOut(BaseModel):
    category: ExpenseCategory
    amount: int
    percent: float


class ExpenseBreakdownOut(BaseModel):
    items: list[ExpenseBreakdownItemOut]
    total: int


class MembershipGrowthMonthOut(BaseModel):
    month: str  # "YYYY-MM"
    new_members: int
    total_members: int


class MembershipGrowthOut(BaseModel):
    months: list[MembershipGrowthMonthOut]


class AnnouncementCreate(BaseModel):
    message: str = Field(min_length=1, max_length=500)


class AnnouncementOut(BaseModel):
    recipient_count: int


class AdminMemberOut(BaseModel):
    id: str
    full_name: str
    email: str
    role: str
    is_active: bool
    joined_at: datetime
    last_payment_amount: int | None
    last_payment_label: str | None
    last_payment_at: datetime | None
    plan_label: str | None
    plan_expires_at: datetime | None
    plan_is_active: bool
    books_reading: int
    books_completed: int
    reported: bool
    event_registrations: int


class AdminMemberListOut(BaseModel):
    items: list[AdminMemberOut]
    total: int
    page: int
    page_size: int


class AdminPaymentOut(BaseModel):
    id: str
    member_id: str
    member_name: str
    member_email: str
    amount: int
    label: str
    status: str
    plan_months: int | None
    created_at: datetime


class AdminPaymentListOut(BaseModel):
    items: list[AdminPaymentOut]
    total: int
    page: int
    page_size: int
