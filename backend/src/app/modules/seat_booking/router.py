from datetime import date as date_type
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from prisma.models import User

from app.api.deps import get_current_user
from app.modules.seat_booking import service
from app.modules.seat_booking.schemas import (
    ScheduleOut,
    SeatAvailabilitySummary,
    SeatBookingCreate,
    SeatBookingOut,
    SeatNotifyCreate,
)

router = APIRouter(prefix="/seat-booking", tags=["seat-booking"])


@router.get("/availability", response_model=SeatAvailabilitySummary)
async def get_availability_summary() -> SeatAvailabilitySummary:
    return await service.get_availability_summary()


@router.get("/schedule", response_model=ScheduleOut)
async def get_schedule(
    date: date_type,
    hour: Annotated[int, Query(ge=0, le=23)],
    user: Annotated[User, Depends(get_current_user)],
) -> ScheduleOut:
    return await service.get_schedule(user, date, hour)


@router.get("/me", response_model=list[SeatBookingOut])
async def list_my_bookings(
    user: Annotated[User, Depends(get_current_user)],
) -> list[SeatBookingOut]:
    return await service.list_my_bookings(user)


@router.post("", response_model=SeatBookingOut, status_code=status.HTTP_201_CREATED)
async def book_seat(
    payload: SeatBookingCreate, user: Annotated[User, Depends(get_current_user)]
) -> SeatBookingOut:
    return await service.book_seat(user, payload)


@router.delete("/{booking_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_booking(booking_id: str, user: Annotated[User, Depends(get_current_user)]) -> None:
    await service.cancel_booking(user, booking_id)


@router.post("/notify", status_code=status.HTTP_204_NO_CONTENT)
async def request_notify(
    payload: SeatNotifyCreate, user: Annotated[User, Depends(get_current_user)]
) -> None:
    await service.request_notify(user, payload)
