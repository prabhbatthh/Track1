from typing import Any

from prisma import Prisma

from app.modules.audit_log import repository
from app.modules.audit_log.schemas import AuditLogEntryOut, AuditLogListResponse


async def record(
    *, actor_id: str, action: str, metadata: dict[str, Any], client: Prisma | None = None
) -> None:
    await repository.create(actor_id=actor_id, action=action, metadata=metadata, client=client)


async def list_entries(*, page: int = 1, page_size: int = 20) -> AuditLogListResponse:
    rows, total = await repository.list_recent(page=page, page_size=page_size)
    return AuditLogListResponse(
        items=[AuditLogEntryOut.from_prisma(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )
