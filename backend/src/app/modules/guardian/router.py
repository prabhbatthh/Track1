from typing import Annotated

from fastapi import APIRouter, Depends, status
from prisma.models import User

from app.api.deps import get_current_user, require_role
from app.core.constants import Role
from app.modules.guardian import service
from app.modules.guardian.schemas import (
    GuardianChildOut,
    GuardianContactOut,
    GuardianLinkCreate,
    SelfGuardianLinkCreate,
)
from app.modules.payments.schemas import PaymentOut
from app.modules.seat_booking.schemas import SeatBookingCreate, SeatBookingOut, SeatNotifyCreate

router = APIRouter(prefix="/guardian", tags=["guardian"])

manage_links = require_role(Role.ADMIN, Role.LIBRARIAN, Role.MANAGER)
as_guardian = require_role(Role.GUARDIAN)


@router.post("/links", status_code=status.HTTP_201_CREATED)
async def create_link(
    payload: GuardianLinkCreate,
    _: Annotated[User, Depends(manage_links)],
) -> None:
    await service.link_child(payload)


# Any signed-in user asking about their own link — not gated on the guardian role, since
# the caller here is the student. Scoped to user.id, so it can only ever return their own.
@router.get("/my-guardian", response_model=GuardianContactOut | None)
async def get_my_guardian(
    user: Annotated[User, Depends(get_current_user)],
) -> GuardianContactOut | None:
    return await service.get_my_guardian(user.id)


@router.post("/my-guardian", response_model=GuardianContactOut)
async def link_my_guardian(
    payload: SelfGuardianLinkCreate,
    user: Annotated[User, Depends(get_current_user)],
) -> GuardianContactOut:
    return await service.link_my_guardian(user.id, payload.guardian_email)


@router.delete("/my-guardian", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_my_guardian(
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    await service.unlink_my_guardian(user.id)


@router.get("/children", response_model=list[GuardianChildOut])
async def list_children(
    user: Annotated[User, Depends(as_guardian)],
) -> list[GuardianChildOut]:
    return await service.list_my_children(user.id)


@router.get("/children/{child_id}/payments", response_model=list[PaymentOut])
async def list_child_payments(
    child_id: str, user: Annotated[User, Depends(as_guardian)]
) -> list[PaymentOut]:
    return await service.list_child_payments(user.id, child_id)


@router.post("/children/{child_id}/pay-fines", status_code=status.HTTP_204_NO_CONTENT)
async def pay_child_fines(child_id: str, user: Annotated[User, Depends(as_guardian)]) -> None:
    await service.pay_child_fines(user.id, child_id)


@router.post("/children/{child_id}/renew", status_code=status.HTTP_204_NO_CONTENT)
async def renew_child_subscription(
    child_id: str, user: Annotated[User, Depends(as_guardian)]
) -> None:
    await service.renew_child_subscription(user.id, child_id)


@router.post(
    "/children/{child_id}/seat-bookings",
    response_model=SeatBookingOut,
    status_code=status.HTTP_201_CREATED,
)
async def book_seat_for_child(
    child_id: str, payload: SeatBookingCreate, user: Annotated[User, Depends(as_guardian)]
) -> SeatBookingOut:
    return await service.book_seat_for_child(user.id, child_id, payload)


@router.post("/children/{child_id}/seat-notify", status_code=status.HTTP_204_NO_CONTENT)
async def request_seat_notify_for_child(
    child_id: str, payload: SeatNotifyCreate, user: Annotated[User, Depends(as_guardian)]
) -> None:
    await service.request_seat_notify_for_child(user.id, child_id, payload)
