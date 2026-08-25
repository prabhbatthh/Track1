from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from prisma.models import User

from app.api.deps import require_role
from app.modules.support_tickets import service
from app.modules.support_tickets.constants import RAISER_ROLES, STAFF_ROLES
from app.modules.support_tickets.schemas import (
    SupportTicketCreate,
    SupportTicketOut,
    SupportTicketResolve,
)

router = APIRouter(prefix="/support-tickets", tags=["support-tickets"])

raise_ticket = require_role(*RAISER_ROLES)
manage_tickets = require_role(*STAFF_ROLES)


@router.post("", response_model=SupportTicketOut, status_code=status.HTTP_201_CREATED)
async def create_ticket(
    payload: SupportTicketCreate, user: Annotated[User, Depends(raise_ticket)]
) -> SupportTicketOut:
    return await service.create_ticket(user, payload)


@router.get("/me", response_model=list[SupportTicketOut])
async def list_my_tickets(
    user: Annotated[User, Depends(raise_ticket)],
) -> list[SupportTicketOut]:
    return await service.list_my_tickets(user)


@router.get("", response_model=list[SupportTicketOut])
async def list_tickets(
    _: Annotated[User, Depends(manage_tickets)],
    ticket_status: Annotated[str | None, Query(alias="status")] = None,
) -> list[SupportTicketOut]:
    return await service.list_all_tickets(ticket_status)


@router.post("/{ticket_id}/resolve", response_model=SupportTicketOut)
async def resolve_ticket(
    ticket_id: str,
    payload: SupportTicketResolve,
    user: Annotated[User, Depends(manage_tickets)],
) -> SupportTicketOut:
    return await service.resolve_ticket(ticket_id, user, payload)


@router.post("/{ticket_id}/confirm", response_model=SupportTicketOut)
async def confirm_ticket(
    ticket_id: str, user: Annotated[User, Depends(raise_ticket)]
) -> SupportTicketOut:
    return await service.confirm_ticket(ticket_id, user)


@router.post("/{ticket_id}/reopen", response_model=SupportTicketOut)
async def reopen_ticket(
    ticket_id: str, user: Annotated[User, Depends(raise_ticket)]
) -> SupportTicketOut:
    return await service.reopen_ticket(ticket_id, user)
