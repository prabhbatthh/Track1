from typing import Annotated

from fastapi import APIRouter, Depends, status
from prisma.models import User

from app.api.deps import get_current_user
from app.modules.reservations import service
from app.modules.reservations.schemas import ReservationCreate, ReservationOut

router = APIRouter(prefix="/reservations", tags=["reservations"])


@router.get("/me", response_model=list[ReservationOut])
async def list_my_reservations(
    user: Annotated[User, Depends(get_current_user)],
) -> list[ReservationOut]:
    return await service.list_my_reservations(user.id)


@router.post("", response_model=ReservationOut, status_code=status.HTTP_201_CREATED)
async def create_reservation(
    payload: ReservationCreate,
    user: Annotated[User, Depends(get_current_user)],
) -> ReservationOut:
    return await service.create_reservation(user.id, payload)


@router.delete("/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_reservation(
    reservation_id: str,
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    await service.cancel_reservation(user.id, reservation_id)
