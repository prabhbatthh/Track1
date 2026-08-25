from datetime import UTC, datetime

from prisma.models import Event, EventRegistration

from app.core.constants import Role
from app.db.pagination import paginate
from app.db.prisma import prisma

_INCLUDE = {
    "registrations": {"include": {"member": True}},
    "managerAssignments": {"include": {"manager": True}},
}


async def list_events(*, skip: int, take: int, timeframe: str = "all") -> tuple[list[Event], int]:
    """List events, optionally restricted to upcoming or past ones.

    The timeframe filter has to happen here, not in the caller. Ordering is by date
    ascending across every event, so filtering a page client-side means filtering the
    *oldest* events: past a hundred finished events the "upcoming" view went empty
    while upcoming events sat unfetched on later pages.
    """
    where: dict = {"deletedAt": None}
    now = datetime.now(UTC)
    if timeframe == "upcoming":
        where["date"] = {"gte": now}
    elif timeframe == "past":
        where["date"] = {"lt": now}

    return await paginate(
        prisma.event,
        where=where,
        include=_INCLUDE,
        # Upcoming reads soonest-first; past reads most-recent-first.
        order={"date": "desc" if timeframe == "past" else "asc"},
        skip=skip,
        take=take,
    )


async def find_by_id(event_id: str) -> Event | None:
    return await prisma.event.find_unique(where={"id": event_id}, include=_INCLUDE)


_ANALYTICS_INCLUDE = {
    "registrations": {"include": {"member": {"include": {"role": True}}}},
}


async def find_by_id_for_analytics(event_id: str) -> Event | None:
    return await prisma.event.find_unique(where={"id": event_id}, include=_ANALYTICS_INCLUDE)


async def create_event(data: dict) -> Event:
    return await prisma.event.create(data=data, include=_INCLUDE)


async def update_event(event_id: str, data: dict) -> Event:
    return await prisma.event.update(where={"id": event_id}, data=data, include=_INCLUDE)


async def update_event_with_capacity_guard(
    event_id: str, data: dict
) -> tuple[Event | None, str | None]:
    """Update under the same lock used by registration capacity checks."""
    async with prisma.tx() as tx:
        await tx.execute_raw("SELECT pg_advisory_xact_lock(hashtext($1))", event_id)
        event = await tx.event.find_unique(where={"id": event_id}, include=_INCLUDE)
        if event is None or event.deletedAt is not None:
            return None, "not_found"
        requested_capacity = data.get("capacity")
        if requested_capacity is not None:
            registrations = len(event.registrations or [])
            if requested_capacity < registrations:
                return event, "capacity"
        updated = await tx.event.update(where={"id": event_id}, data=data, include=_INCLUDE)
        return updated, None


async def soft_delete_event(event_id: str) -> None:
    await prisma.event.update(where={"id": event_id}, data={"deletedAt": datetime.now(UTC)})


async def find_registration(event_id: str, member_id: str) -> EventRegistration | None:
    return await prisma.eventregistration.find_unique(
        where={"eventId_memberId": {"eventId": event_id, "memberId": member_id}}
    )


async def create_registration(event_id: str, member_id: str) -> EventRegistration:
    return await prisma.eventregistration.create(data={"eventId": event_id, "memberId": member_id})


async def create_registration_if_space(
    event_id: str, member_id: str
) -> tuple[Event | None, str | None]:
    """Atomically register a member, returning an error code when rejected."""
    async with prisma.tx() as tx:
        await tx.execute_raw("SELECT pg_advisory_xact_lock(hashtext($1))", event_id)
        event = await tx.event.find_unique(where={"id": event_id}, include=_INCLUDE)
        if event is None or event.deletedAt is not None:
            return None, "not_found"
        if any(row.memberId == member_id for row in event.registrations or []):
            return event, "duplicate"
        if len(event.registrations or []) >= event.capacity:
            return event, "capacity"
        await tx.eventregistration.create(data={"eventId": event_id, "memberId": member_id})
        updated = await tx.event.find_unique(where={"id": event_id}, include=_INCLUDE)
        return updated, None


async def delete_registration(event_id: str, member_id: str) -> None:
    await prisma.eventregistration.delete(
        where={"eventId_memberId": {"eventId": event_id, "memberId": member_id}}
    )


async def count_events_this_month() -> int:
    now = datetime.now(UTC)
    start = datetime(now.year, now.month, 1, tzinfo=UTC)
    return await prisma.event.count(where={"deletedAt": None, "date": {"gte": start}})


async def count_total_registrations() -> int:
    return await prisma.eventregistration.count()


async def sum_capacity() -> int:
    """Total seats across every live event, aggregated in SQL rather than in Python."""
    rows = await prisma.query_raw(
        "SELECT COALESCE(SUM(capacity), 0)::bigint AS total FROM events WHERE deleted_at IS NULL"
    )
    return int(rows[0]["total"]) if rows else 0


async def list_manager_ids(candidate_ids: list[str]) -> list[str]:
    if not candidate_ids:
        return []
    rows = await prisma.user.find_many(
        where={
            "id": {"in": candidate_ids},
            "isActive": True,
            "deletedAt": None,
            "role": {"name": Role.MANAGER.value},
        }
    )
    return [row.id for row in rows]


async def set_manager_assignments(event_id: str, manager_ids: list[str]) -> None:
    await prisma.eventmanagerassignment.delete_many(where={"eventId": event_id})
    for manager_id in manager_ids:
        await prisma.eventmanagerassignment.create(
            data={"eventId": event_id, "managerId": manager_id}
        )
