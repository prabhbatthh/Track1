from datetime import date, datetime

from pydantic import BaseModel

from app.modules.admin.schemas import TrendOut


class ITHeadStatsOut(BaseModel):
    active_members: int
    active_members_trend: TrendOut
    open_issues: int
    open_issues_delta: int  # vs. yesterday — a raw count, not a percent (few enough to name)
    pending_permissions: int
    pending_permissions_delta: int  # vs. yesterday
    fees_outstanding: int
    fees_outstanding_trend: TrendOut
    late_fines_outstanding: int
    late_fines_outstanding_trend: TrendOut


class FeeStatusEntryOut(BaseModel):
    member_id: str
    member_name: str
    amount_due: int
    status: str  # paid | due | overdue
    due_date: datetime | None


class FeeCollectionMonthOut(BaseModel):
    month: str
    collected: int
    pending: int


class IssueResolutionMonthOut(BaseModel):
    month: str
    resolved: int
    open: int
    other: int


class SystemActivityDayOut(BaseModel):
    date: date
    logins: int
    access_changes: int
    permissions_updated: int


class SystemActivitySummaryOut(BaseModel):
    logins_total: int
    logins_trend: TrendOut  # vs. the previous 7-day window
    access_changes_total: int
    access_changes_trend: TrendOut
    permissions_updated_total: int
    permissions_updated_trend: TrendOut


class RoleBreakdownEntryOut(BaseModel):
    role: str
    count: int
    percent: int


class ITHeadAlertOut(BaseModel):
    id: str
    severity: str  # critical | warning | info | success
    title: str
    description: str


class ITHeadDashboardOut(BaseModel):
    stats: ITHeadStatsOut
    fee_status: list[FeeStatusEntryOut]
    fee_collections: list[FeeCollectionMonthOut]
    issue_resolution: list[IssueResolutionMonthOut]
    system_activity: list[SystemActivityDayOut]
    system_activity_summary: SystemActivitySummaryOut
    access_by_role: list[RoleBreakdownEntryOut]
    alerts: list[ITHeadAlertOut]
