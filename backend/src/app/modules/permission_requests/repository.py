from datetime import UTC, datetime

from prisma.models import PermissionRequest

from app.db.prisma import prisma

INCLUDE = {"requestedBy": True, "decidedBy": True}

# Self-limiting in practice — granted/denied requests leave this filter — but capped
# anyway rather than trusting that a growing backlog never outpaces it.
LIST_LIMIT = 200


async def count_pending() -> int:
    """COUNT(*) — see support_tickets.count_by_status."""
    return await prisma.permissionrequest.count(where={"status": "pending"})


async def list_pending() -> list[PermissionRequest]:
    return await prisma.permissionrequest.find_many(
        where={"status": "pending"}, include=INCLUDE, order={"createdAt": "asc"}, take=LIST_LIMIT
    )


async def find_by_id(request_id: str) -> PermissionRequest | None:
    return await prisma.permissionrequest.find_unique(where={"id": request_id}, include=INCLUDE)


async def create(*, requested_by_id: str, permission: str, reason: str) -> PermissionRequest:
    return await prisma.permissionrequest.create(
        data={"requestedById": requested_by_id, "permission": permission, "reason": reason},
        include=INCLUDE,
    )


async def decide(request_id: str, *, status: str, decided_by_id: str) -> PermissionRequest:
    return await prisma.permissionrequest.update(
        where={"id": request_id},
        data={"status": status, "decidedById": decided_by_id, "decidedAt": datetime.now(UTC)},
        include=INCLUDE,
    )


async def decide_if_pending(
    request_id: str, *, status: str, decided_by_id: str
) -> PermissionRequest | None:
    updated = await prisma.permissionrequest.update_many(
        where={"id": request_id, "status": "pending"},
        data={"status": status, "decidedById": decided_by_id, "decidedAt": datetime.now(UTC)},
    )
    if updated != 1:
        return None
    return await find_by_id(request_id)
