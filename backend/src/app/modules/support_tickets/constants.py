from enum import StrEnum

from app.core.constants import Role


class TicketCategory(StrEnum):
    BOOK_RESERVATION = "book_reservation"
    PAYMENT = "payment"
    SEAT_BOOKING = "seat_booking"
    HARASSMENT = "harassment"
    OFFLINE_LIBRARY = "offline_library"
    ATTENDANCE = "attendance"
    OTHER = "other"


# Guardians only ever raise a ticket about their own experience (attendance, their
# child's seat booking, a payment) — not member-only categories like book reservations.
CATEGORIES_BY_ROLE: dict[str, set[TicketCategory]] = {
    Role.MEMBER: {
        TicketCategory.BOOK_RESERVATION,
        TicketCategory.PAYMENT,
        TicketCategory.SEAT_BOOKING,
        TicketCategory.HARASSMENT,
        TicketCategory.OFFLINE_LIBRARY,
        TicketCategory.OTHER,
    },
    Role.GUARDIAN: {
        TicketCategory.ATTENDANCE,
        TicketCategory.SEAT_BOOKING,
        TicketCategory.PAYMENT,
        TicketCategory.OTHER,
    },
}

STAFF_ROLES = (Role.ADMIN, Role.MANAGER, Role.LIBRARIAN, Role.IT_HEAD)
RAISER_ROLES = (Role.MEMBER, Role.GUARDIAN)
