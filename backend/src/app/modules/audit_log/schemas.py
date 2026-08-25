from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AuditLogEntryOut(BaseModel):
    id: str
    actor_id: str
    actor_name: str
    actor_role: str
    action: str
    params: dict[str, Any]
    created_at: datetime

    @staticmethod
    def from_prisma(row) -> "AuditLogEntryOut":
        return AuditLogEntryOut(
            id=row.id,
            actor_id=row.actorId,
            actor_name=row.actor.fullName,
            actor_role=row.actor.role.name,
            action=row.action,
            params=row.metadata,
            created_at=row.createdAt,
        )


class AuditLogListResponse(BaseModel):
    items: list[AuditLogEntryOut]
    total: int
    page: int
    page_size: int
