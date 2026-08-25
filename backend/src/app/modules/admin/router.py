from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from prisma.models import User

from app.api.deps import require_role
from app.core.constants import Role
from app.modules.admin import service
from app.modules.admin.schemas import (
    AdminDashboardOut,
    AdminMemberListOut,
    AdminPaymentListOut,
    AnnouncementCreate,
    AnnouncementOut,
    ExpenseBreakdownOut,
    ExpenseCreate,
    ExpenseOut,
    MembershipGrowthOut,
    ProfitAndLossOut,
    RevenueByPlanOut,
)
from app.modules.audit_log import service as audit_log_service
from app.modules.audit_log.schemas import AuditLogListResponse

router = APIRouter(prefix="/admin", tags=["admin"])

manage_admin = require_role(Role.ADMIN)


@router.get("/dashboard", response_model=AdminDashboardOut)
async def get_dashboard(_: Annotated[User, Depends(manage_admin)]) -> AdminDashboardOut:
    return await service.get_dashboard()


@router.post("/expenses", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
async def log_expense(
    payload: ExpenseCreate, user: Annotated[User, Depends(manage_admin)]
) -> ExpenseOut:
    return await service.log_expense(user.id, payload)


@router.get("/audit-log", response_model=AuditLogListResponse)
async def get_audit_log(
    _: Annotated[User, Depends(manage_admin)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 20,
) -> AuditLogListResponse:
    return await audit_log_service.list_entries(page=page, page_size=page_size)


@router.get("/reports/revenue-by-plan", response_model=RevenueByPlanOut)
async def get_revenue_by_plan(_: Annotated[User, Depends(manage_admin)]) -> RevenueByPlanOut:
    return await service.get_revenue_by_plan()


@router.get("/reports/profit-and-loss", response_model=ProfitAndLossOut)
async def get_profit_and_loss(_: Annotated[User, Depends(manage_admin)]) -> ProfitAndLossOut:
    return await service.get_profit_and_loss()


@router.get("/reports/expense-breakdown", response_model=ExpenseBreakdownOut)
async def get_expense_breakdown(_: Annotated[User, Depends(manage_admin)]) -> ExpenseBreakdownOut:
    return await service.get_expense_breakdown()


@router.get("/reports/membership-growth", response_model=MembershipGrowthOut)
async def get_membership_growth(_: Annotated[User, Depends(manage_admin)]) -> MembershipGrowthOut:
    return await service.get_membership_growth()


@router.post("/announcements", response_model=AnnouncementOut, status_code=status.HTTP_201_CREATED)
async def send_announcement(
    payload: AnnouncementCreate, user: Annotated[User, Depends(manage_admin)]
) -> AnnouncementOut:
    return await service.send_announcement(user.id, payload)


@router.get("/members", response_model=AdminMemberListOut)
async def list_admin_members(
    _: Annotated[User, Depends(manage_admin)],
    search: Annotated[str | None, Query(description="Match against full name or email")] = None,
    role: Annotated[str | None, Query()] = None,
    status: Annotated[str | None, Query(pattern=r"^(active|inactive)$")] = None,
    sort_by: Annotated[str, Query(pattern=r"^(name|joined|role)$")] = "joined",
    sort_dir: Annotated[str, Query(pattern=r"^(asc|desc)$")] = "desc",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> AdminMemberListOut:
    return await service.list_members(
        search=search,
        page=page,
        page_size=page_size,
        role=role,
        status=status,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )


@router.get("/payments", response_model=AdminPaymentListOut)
async def list_admin_payments(
    _: Annotated[User, Depends(manage_admin)],
    search: Annotated[str | None, Query(description="Match against member name or email")] = None,
    month: Annotated[str | None, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    # Upper bound raised beyond the usual 100 so the monthly-report export can
    # pull a full month's rows in a single request instead of paging through it.
    page_size: Annotated[int, Query(ge=1, le=1000)] = 20,
) -> AdminPaymentListOut:
    return await service.list_payments(search=search, page=page, page_size=page_size, month=month)
