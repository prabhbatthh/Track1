from datetime import datetime

from pydantic import BaseModel, Field


class PermissionRequestCreate(BaseModel):
    permission: str = Field(min_length=1, max_length=100)
    reason: str = Field(min_length=1, max_length=500)


class PermissionRequestOut(BaseModel):
    id: str
    permission: str
    reason: str
    status: str
    requested_by_id: str
    requested_by_name: str
    decided_by_name: str | None
    decided_at: datetime | None
    created_at: datetime

    @staticmethod
    def from_prisma(row) -> "PermissionRequestOut":
        return PermissionRequestOut(
            id=row.id,
            permission=row.permission,
            reason=row.reason,
            status=row.status,
            requested_by_id=row.requestedById,
            requested_by_name=row.requestedBy.fullName,
            decided_by_name=row.decidedBy.fullName if row.decidedBy else None,
            decided_at=row.decidedAt,
            created_at=row.createdAt,
        )
