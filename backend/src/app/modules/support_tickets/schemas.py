from datetime import datetime

from pydantic import BaseModel, Field

from app.modules.support_tickets.constants import TicketCategory


class SupportTicketCreate(BaseModel):
    category: TicketCategory
    description: str = Field(min_length=10, max_length=500)


class SupportTicketResolve(BaseModel):
    resolution_note: str = Field(min_length=1, max_length=1000)


class SupportTicketOut(BaseModel):
    id: str
    category: str
    description: str
    status: str
    raised_by_id: str
    raised_by_name: str
    raised_by_role: str
    resolution_note: str | None
    resolved_by_name: str | None
    resolved_at: datetime | None
    closed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @staticmethod
    def from_prisma(ticket) -> "SupportTicketOut":
        return SupportTicketOut(
            id=ticket.id,
            category=ticket.category,
            description=ticket.description,
            status=ticket.status,
            raised_by_id=ticket.raisedById,
            raised_by_name=ticket.raisedBy.fullName,
            raised_by_role=ticket.raisedBy.role.name,
            resolution_note=ticket.resolutionNote,
            resolved_by_name=ticket.resolvedBy.fullName if ticket.resolvedBy else None,
            resolved_at=ticket.resolvedAt,
            closed_at=ticket.closedAt,
            created_at=ticket.createdAt,
            updated_at=ticket.updatedAt,
        )
