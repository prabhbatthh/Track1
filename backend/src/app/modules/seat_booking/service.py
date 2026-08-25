from datetime import UTC, datetime, timedelta
from datetime import date as date_type

from fastapi import HTTPException, status
from prisma.errors import UniqueViolationError
from prisma.models import User

from app.modules.guardian import repository as guardian_repository
from app.modules.notifications import repository as notifications_repository
from app.modules.notifications import service as notifications_service
from app.modules.seat_booking import repository
from app.modules.seat_booking.constants import MAX_DAYS_AHEAD, SEAT_LABELS
from app.modules.seat_booking.schemas import (
    ScheduleOut,
    SeatAvailabilitySummary,
    SeatBookingCreate,
    SeatBookingOut,
    SeatNotifyCreate,
    SeatSlotOut,
)


def _now() -> datetime:
    return datetime.now(UTC)


def _validate_slot(target_date: date_type, hour: int) -> None:
    now = _now()
    today = now.date()
    if target_date < today:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot book a date in the past")
    if target_date > today + timedelta(days=MAX_DAYS_AHEAD):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Bookings can only be made up to {MAX_DAYS_AHEAD} days ahead",
        )
    if target_date == today and hour < now.hour:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Cannot book a time slot that has already passed"
        )


async def get_availability_summary(
    target_date: date_type | None = None, hour: int | None = None
) -> SeatAvailabilitySummary:
    if target_date is None or hour is None:
        now = _now()
        target_date = target_date or now.date()
        hour = hour if hour is not None else now.hour

    bookings = await repository.list_bookings_for_slot(target_date, hour)
    booked = len(bookings)
    total = len(SEAT_LABELS)
    return SeatAvailabilitySummary(available=total - booked, booked=booked, total=total)


async def get_schedule(user: User, target_date: date_type, hour: int) -> ScheduleOut:
    bookings = await repository.list_bookings_for_slot(target_date, hour)
    by_seat = {booking.seatLabel: booking for booking in bookings}

    children = await guardian_repository.list_children(user.id)
    child_map = {child.id: child for child in children}

    guardian_notifs = await notifications_repository.list_for_user(user.id)
    guardian_booked_seats: set[str] = set()
    for notif in guardian_notifs:
        if (
            notif.type == "seat-booked-by-guardian"
            and f"for {target_date.isoformat()} at {hour:02d}:00" in notif.message
        ):
            parts = notif.message.split(" ")
            if len(parts) >= 2 and parts[0] == "Seat":
                guardian_booked_seats.add(parts[1])

    slots: list[SeatSlotOut] = []
    for label in SEAT_LABELS:
        booking = by_seat.get(label)
        if booking is None:
            slots.append(SeatSlotOut(seat_label=label, status="available"))
        elif booking.memberId == user.id:
            is_booked_by_guardian = label in guardian_booked_seats
            guardian = (
                await guardian_repository.find_guardian_for_child(user.id)
                if is_booked_by_guardian
                else None
            )
            slots.append(
                SeatSlotOut(
                    seat_label=label,
                    status="booked_by_me",
                    booking_id=booking.id,
                    booked_by_avatar_url=user.avatarUrl,
                    booked_by_guardian_id=guardian.id if guardian else None,
                    booked_by_guardian_name=guardian.fullName if guardian else None,
                )
            )
        elif booking.memberId in child_map:
            child = child_map[booking.memberId]
            slots.append(
                SeatSlotOut(
                    seat_label=label,
                    status="booked_for_child",
                    booking_id=booking.id,
                    booked_by_avatar_url=child.avatarUrl
                    or (booking.member.avatarUrl if booking.member else None),
                    booked_for_child_id=child.id,
                    booked_for_child_name=child.fullName,
                )
            )
        else:
            slots.append(
                SeatSlotOut(
                    seat_label=label,
                    status="reserved",
                    booked_by_avatar_url=booking.member.avatarUrl if booking.member else None,
                )
            )

    return ScheduleOut(date=target_date, hour=hour, seats=slots)


async def book_seat(user: User, payload: SeatBookingCreate) -> SeatBookingOut:
    _validate_slot(payload.date, payload.hour)

    existing = await repository.list_bookings_for_slot(payload.date, payload.hour)
    if any(booking.seatLabel == payload.seat_label for booking in existing):
        raise HTTPException(status.HTTP_409_CONFLICT, "This seat is already booked for that time")
    if any(booking.memberId == user.id for booking in existing):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "You already have a seat booked for this time slot"
        )

    try:
        booking = await repository.create_booking(
            user.id, payload.seat_label, payload.date, payload.hour
        )
    except UniqueViolationError as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "This seat is already booked for that time"
        ) from exc

    await notifications_service.create_notification(
        user.id,
        "seat-booked",
        f"Seat {payload.seat_label} booked for {payload.date.isoformat()} at "
        f"{payload.hour:02d}:00.",
    )
    return SeatBookingOut.from_prisma(booking)


async def list_my_bookings(user: User) -> list[SeatBookingOut]:
    bookings = await repository.list_my_bookings(user.id)
    return [SeatBookingOut.from_prisma(booking) for booking in bookings]


async def cancel_booking(user: User, booking_id: str) -> None:
    booking = await repository.find_booking(booking_id)
    if booking is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    if booking.memberId != user.id:
        children = await guardian_repository.list_children(user.id)
        if not any(child.id == booking.memberId for child in children):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only cancel your own bookings")

    booking_date = booking.date.date()
    await repository.delete_booking(booking_id)

    waiting = await repository.find_notify_requests_for_slot(
        booking.seatLabel, booking_date, booking.hour
    )
    if waiting:
        await notifications_service.create_notifications(
            [request.memberId for request in waiting],
            "seat-available",
            f"Seat {booking.seatLabel} is now available on "
            f"{booking_date.isoformat()} at {booking.hour:02d}:00.",
        )
        await repository.delete_notify_requests([request.id for request in waiting])


async def request_notify(user: User, payload: SeatNotifyCreate) -> None:
    _validate_slot(payload.date, payload.hour)

    existing = await repository.list_bookings_for_slot(payload.date, payload.hour)
    booking = next((b for b in existing if b.seatLabel == payload.seat_label), None)
    if booking is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "This seat is already available — just book it"
        )
    if booking.memberId == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You already have this seat booked")

    await repository.create_notify_request(user.id, payload.seat_label, payload.date, payload.hour)
