from datetime import UTC, datetime

from prisma.models import SupportTicket

from app.db.prisma import prisma

INCLUDE = {
    "raisedBy": {"include": {"role": True}},
    "resolvedBy": {"include": {"role": True}},
}

# list_all() defaults to every ticket ever raised, resolved or not — a permanent
# history, unlike billing/permission requests' self-limiting "pending only" queues.
LIST_LIMIT = 200


async def create(*, raised_by_id: str, category: str, description: str) -> SupportTicket:
    return await prisma.supportticket.create(
        data={"raisedById": raised_by_id, "category": category, "description": description},
        include=INCLUDE,
    )


async def find_by_id(ticket_id: str) -> SupportTicket | None:
    return await prisma.supportticket.find_unique(where={"id": ticket_id}, include=INCLUDE)


async def list_for_raiser(raised_by_id: str) -> list[SupportTicket]:
    return await prisma.supportticket.find_many(
        where={"raisedById": raised_by_id},
        include=INCLUDE,
        order={"createdAt": "desc"},
        take=LIST_LIMIT,
    )


async def count_by_status(status: str) -> int:
    """COUNT(*) — dashboards previously fetched every open ticket to call len() on it."""
    return await prisma.supportticket.count(where={"status": status})


async def list_all(*, status: str | None) -> list[SupportTicket]:
    where: dict = {}
    if status is not None:
        where["status"] = status
    return await prisma.supportticket.find_many(
        where=where, include=INCLUDE, order={"createdAt": "desc"}, take=LIST_LIMIT
    )


async def resolve(ticket_id: str, *, resolved_by_id: str, resolution_note: str) -> SupportTicket:
    return await prisma.supportticket.update(
        where={"id": ticket_id},
        data={
            "status": "resolved",
            "resolutionNote": resolution_note,
            "resolvedById": resolved_by_id,
            "resolvedAt": datetime.now(UTC),
        },
        include=INCLUDE,
    )


async def resolve_if_open(
    ticket_id: str, *, resolved_by_id: str, resolution_note: str
) -> SupportTicket | None:
    updated = await prisma.supportticket.update_many(
        where={"id": ticket_id, "status": "open"},
        data={
            "status": "resolved",
            "resolutionNote": resolution_note,
            "resolvedById": resolved_by_id,
            "resolvedAt": datetime.now(UTC),
        },
    )
    return await find_by_id(ticket_id) if updated == 1 else None


async def reopen(ticket_id: str) -> SupportTicket:
    return await prisma.supportticket.update(
        where={"id": ticket_id}, data={"status": "open"}, include=INCLUDE
    )


async def reopen_if_resolved(ticket_id: str) -> SupportTicket | None:
    updated = await prisma.supportticket.update_many(
        where={"id": ticket_id, "status": "resolved"}, data={"status": "open"}
    )
    return await find_by_id(ticket_id) if updated == 1 else None


async def close(ticket_id: str) -> SupportTicket:
    return await prisma.supportticket.update(
        where={"id": ticket_id},
        data={"status": "closed", "closedAt": datetime.now(UTC)},
        include=INCLUDE,
    )


async def close_if_resolved(ticket_id: str) -> SupportTicket | None:
    updated = await prisma.supportticket.update_many(
        where={"id": ticket_id, "status": "resolved"},
        data={"status": "closed", "closedAt": datetime.now(UTC)},
    )
    return await find_by_id(ticket_id) if updated == 1 else None
