from datetime import UTC, datetime
from datetime import date as date_type

from prisma.models import SeatBooking, SeatNotifyRequest

from app.db.prisma import prisma


def _to_datetime(value: date_type) -> datetime:
    return datetime(value.year, value.month, value.day, tzinfo=UTC)


async def list_bookings_for_slot(date: date_type, hour: int) -> list[SeatBooking]:
    # include=member so the caller can show who a *reserved* (someone else's) seat
    # belongs to (avatar) without a second round-trip per booking.
    return await prisma.seatbooking.find_many(
        where={"date": _to_datetime(date), "hour": hour}, include={"member": True}
    )


async def find_booking(booking_id: str) -> SeatBooking | None:
    return await prisma.seatbooking.find_unique(where={"id": booking_id})


async def create_booking(
    member_id: str, seat_label: str, date: date_type, hour: int
) -> SeatBooking:
    return await prisma.seatbooking.create(
        data={
            "memberId": member_id,
            "seatLabel": seat_label,
            "date": _to_datetime(date),
            "hour": hour,
        }
    )


async def delete_booking(booking_id: str) -> None:
    await prisma.seatbooking.delete(where={"id": booking_id})


async def list_my_bookings(member_id: str) -> list[SeatBooking]:
    return await prisma.seatbooking.find_many(
        where={"memberId": member_id}, order=[{"date": "asc"}, {"hour": "asc"}]
    )


async def find_notify_requests_for_slot(
    seat_label: str, date: date_type, hour: int
) -> list[SeatNotifyRequest]:
    return await prisma.seatnotifyrequest.find_many(
        where={"seatLabel": seat_label, "date": _to_datetime(date), "hour": hour}
    )


async def create_notify_request(
    member_id: str, seat_label: str, date: date_type, hour: int
) -> SeatNotifyRequest:
    prisma_date = _to_datetime(date)
    return await prisma.seatnotifyrequest.upsert(
        where={
            "seatLabel_date_hour_memberId": {
                "seatLabel": seat_label,
                "date": prisma_date,
                "hour": hour,
                "memberId": member_id,
            }
        },
        data={
            "create": {
                "memberId": member_id,
                "seatLabel": seat_label,
                "date": prisma_date,
                "hour": hour,
            },
            "update": {},
        },
    )


async def delete_notify_requests(ids: list[str]) -> None:
    await prisma.seatnotifyrequest.delete_many(where={"id": {"in": ids}})
