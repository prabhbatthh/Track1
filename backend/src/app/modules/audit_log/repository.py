from typing import Any

from prisma import Json, Prisma
from prisma.models import AuditLogEntry

from app.db.pagination import paginate
from app.db.prisma import prisma

INCLUDE = {"actor": {"include": {"role": True}}}


async def create(
    *, actor_id: str, action: str, metadata: dict[str, Any], client: Prisma | None = None
) -> AuditLogEntry:
    db = client or prisma
    return await db.auditlogentry.create(
        data={"actorId": actor_id, "action": action, "metadata": Json(metadata)},
        include=INCLUDE,
    )


async def list_recent(*, page: int, page_size: int) -> tuple[list[AuditLogEntry], int]:
    return await paginate(
        prisma.auditlogentry,
        where={},
        order={"createdAt": "desc"},
        skip=(page - 1) * page_size,
        take=page_size,
        include=INCLUDE,
    )
