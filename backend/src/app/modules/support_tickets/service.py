from fastapi import HTTPException, status
from prisma.models import SupportTicket, User

from app.modules.notifications import service as notifications_service
from app.modules.support_tickets import repository
from app.modules.support_tickets.constants import CATEGORIES_BY_ROLE, STAFF_ROLES
from app.modules.support_tickets.schemas import (
    SupportTicketCreate,
    SupportTicketOut,
    SupportTicketResolve,
)

_CATEGORY_LABELS = {
    "book_reservation": "book reservation",
    "payment": "payment",
    "seat_booking": "seat booking",
    "harassment": "harassment/safety",
    "offline_library": "offline library",
    "attendance": "attendance",
    "other": "general",
}


async def _notify_staff(notification_type: str, message: str) -> None:
    await notifications_service.notify_roles(STAFF_ROLES, notification_type, message)


async def create_ticket(user: User, payload: SupportTicketCreate) -> SupportTicketOut:
    allowed = CATEGORIES_BY_ROLE.get(user.role.name, set())
    if payload.category not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="This category isn't available for your role",
        )

    ticket = await repository.create(
        raised_by_id=user.id, category=payload.category.value, description=payload.description
    )

    label = _CATEGORY_LABELS[payload.category.value]
    await _notify_staff("support-ticket", f"{user.fullName} raised a {label} support ticket.")

    return SupportTicketOut.from_prisma(ticket)


async def list_my_tickets(user: User) -> list[SupportTicketOut]:
    tickets = await repository.list_for_raiser(user.id)
    return [SupportTicketOut.from_prisma(ticket) for ticket in tickets]


async def list_all_tickets(status_filter: str | None) -> list[SupportTicketOut]:
    tickets = await repository.list_all(status=status_filter)
    return [SupportTicketOut.from_prisma(ticket) for ticket in tickets]


async def resolve_ticket(
    ticket_id: str, staff_user: User, payload: SupportTicketResolve
) -> SupportTicketOut:
    existing = await repository.find_by_id(ticket_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    if existing.status != "open":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Only an open ticket can be resolved"
        )

    ticket = await repository.resolve_if_open(
        ticket_id, resolved_by_id=staff_user.id, resolution_note=payload.resolution_note
    )
    if ticket is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only an open ticket can be resolved")
    await notifications_service.create_notification(
        existing.raisedById,
        "support-ticket-resolved",
        "Your support ticket has been resolved — please confirm it's fixed or reopen it.",
    )
    return SupportTicketOut.from_prisma(ticket)


async def confirm_ticket(ticket_id: str, user: User) -> SupportTicketOut:
    await _get_owned_resolved_ticket(ticket_id, user)
    ticket = await repository.close_if_resolved(ticket_id)
    if ticket is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This ticket was already updated")
    return SupportTicketOut.from_prisma(ticket)


async def reopen_ticket(ticket_id: str, user: User) -> SupportTicketOut:
    await _get_owned_resolved_ticket(ticket_id, user)
    ticket = await repository.reopen_if_resolved(ticket_id)
    if ticket is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This ticket was already updated")
    await _notify_staff(
        "support-ticket-reopened",
        f"{user.fullName} reopened a support ticket — the fix didn't work.",
    )
    return SupportTicketOut.from_prisma(ticket)


async def _get_owned_resolved_ticket(ticket_id: str, user: User) -> SupportTicket:
    existing = await repository.find_by_id(ticket_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    if existing.raisedById != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This isn't your ticket")
    if existing.status != "resolved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This ticket isn't awaiting confirmation"
        )
    return existing
