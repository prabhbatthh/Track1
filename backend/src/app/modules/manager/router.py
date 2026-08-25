from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from prisma.models import User

from app.api.deps import get_current_user, require_role
from app.core.constants import Role
from app.modules.guardian.schemas import GuardianContactOut
from app.modules.loans.schemas import LoanOut
from app.modules.manager import service
from app.modules.manager.schemas import (
    DemandForecastItemOut,
    FootfallAnalyticsOut,
    FootfallRange,
    LateReturnRiskItemOut,
    ManagerBookListOut,
    ManagerDashboardStatsOut,
    ManagerGuardianLinkCreate,
    ManagerLoanCreate,
    ManagerReservationDecision,
    ManagerSeatBookingCreate,
    PendingReservationOut,
)
from app.modules.reservations.schemas import ReservationOut
from app.modules.seat_booking.schemas import SeatBookingOut

router = APIRouter(prefix="/manager", tags=["manager"])

manage = require_role(Role.MANAGER, Role.LIBRARIAN)


@router.get("/dashboard", response_model=ManagerDashboardStatsOut)
async def get_dashboard(_: Annotated[User, Depends(manage)]) -> ManagerDashboardStatsOut:
    return await service.get_dashboard_stats()


@router.post("/seat-bookings", response_model=SeatBookingOut, status_code=status.HTTP_201_CREATED)
async def book_seat_for_member(
    payload: ManagerSeatBookingCreate, _: Annotated[User, Depends(manage)]
) -> SeatBookingOut:
    return await service.book_seat_for_member(payload)


# Manager-scoped convenience wrapper around the same loans_service.create_loan used by
# POST /loans (ADMIN/MANAGER/LIBRARIAN/IT_HEAD) — see manager/service.py. Both are
# intentionally reachable by a manager: this one is the front-desk flow (issue while a
# member is standing there), POST /loans is the general staff endpoint.
@router.post("/loans", response_model=LoanOut, status_code=status.HTTP_201_CREATED)
async def issue_loan_for_member(
    payload: ManagerLoanCreate, user: Annotated[User, Depends(manage)]
) -> LoanOut:
    return await service.issue_loan_for_member(user.id, payload)


@router.post("/guardian-links", status_code=status.HTTP_204_NO_CONTENT)
async def link_guardian(
    payload: ManagerGuardianLinkCreate, _: Annotated[User, Depends(manage)]
) -> None:
    await service.link_guardian(payload)


@router.get("/guardian-links/{student_id}", response_model=GuardianContactOut | None)
async def get_student_guardian(
    student_id: str, _: Annotated[User, Depends(manage)]
) -> GuardianContactOut | None:
    return await service.get_student_guardian(student_id)


# PUT rather than reusing POST: POST stays a strict create (409 if the student already has
# a guardian), this is the deliberate "change who it is" action.
@router.put("/guardian-links", status_code=status.HTTP_204_NO_CONTENT)
async def set_guardian(
    payload: ManagerGuardianLinkCreate, _: Annotated[User, Depends(manage)]
) -> None:
    await service.set_guardian(payload)


@router.delete("/guardian-links/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_guardian(student_id: str, _: Annotated[User, Depends(manage)]) -> None:
    await service.unlink_guardian(student_id)


@router.get("/books", response_model=ManagerBookListOut)
async def list_book_availability(
    _: Annotated[User, Depends(manage)],
    search: Annotated[str | None, Query(description="Match against title or author")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> ManagerBookListOut:
    return await service.list_book_availability(search=search, page=page, page_size=page_size)


@router.get("/reservations/pending", response_model=list[PendingReservationOut])
async def list_pending_reservations(
    _: Annotated[User, Depends(manage)],
) -> list[PendingReservationOut]:
    return await service.list_pending_reservations()


@router.post("/reservations/{reservation_id}/approve", response_model=ReservationOut)
async def approve_reservation(
    reservation_id: str,
    payload: ManagerReservationDecision,
    user: Annotated[User, Depends(manage)],
) -> ReservationOut:
    return await service.approve_reservation(user.id, reservation_id, payload.duration_days)


@router.post("/reservations/{reservation_id}/reject", response_model=ReservationOut)
async def reject_reservation(
    reservation_id: str, _: Annotated[User, Depends(manage)]
) -> ReservationOut:
    return await service.reject_reservation(reservation_id)


@router.get("/demand-forecast", response_model=list[DemandForecastItemOut])
async def get_demand_forecast(
    _: Annotated[User, Depends(manage)],
) -> list[DemandForecastItemOut]:
    return await service.get_demand_forecast()


@router.get("/late-return-risk", response_model=list[LateReturnRiskItemOut])
async def get_late_return_risk(
    _: Annotated[User, Depends(manage)],
) -> list[LateReturnRiskItemOut]:
    return await service.get_late_return_risk()


@router.get("/footfall", response_model=FootfallAnalyticsOut)
async def get_footfall_analytics(
    _: Annotated[User, Depends(get_current_user)],
    range: Annotated[FootfallRange, Query()] = "7d",
) -> FootfallAnalyticsOut:
    return await service.get_footfall_analytics(range)
