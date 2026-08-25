from datetime import UTC, datetime

from fastapi import HTTPException, status

from app.modules.events import repository
from app.modules.events.schemas import (
    AttendanceSummary,
    EventAnalytics,
    EventAnalyticsRegistrant,
    EventCreate,
    EventListResponse,
    EventOut,
    EventUpdate,
    RoleBreakdown,
)


async def list_events(
    *, page: int, page_size: int, member_id: str | None, timeframe: str = "all"
) -> EventListResponse:
    items, total = await repository.list_events(
        skip=(page - 1) * page_size, take=page_size, timeframe=timeframe
    )
    return EventListResponse(
        items=[EventOut.from_prisma(e, member_id=member_id) for e in items],
        total=total,
    )


async def get_event(event_id: str, *, member_id: str | None) -> EventOut:
    event = await repository.find_by_id(event_id)
    if event is None or event.deletedAt is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return EventOut.from_prisma(event, member_id=member_id)


async def create_event(payload: EventCreate, *, creator_id: str) -> EventOut:
    manager_ids: list[str] = []
    if payload.manager_ids:
        manager_ids = await repository.list_manager_ids(payload.manager_ids)
        if set(manager_ids) != set(payload.manager_ids):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Every assigned manager must be an active manager account",
            )

    event = await repository.create_event(
        {
            "title": payload.title,
            "description": payload.description,
            "location": payload.location,
            "date": payload.date,
            "capacity": payload.capacity,
            "createdBy": creator_id,
        }
    )

    if manager_ids:
        await repository.set_manager_assignments(event.id, manager_ids)
        event = await repository.find_by_id(event.id)

    return EventOut.from_prisma(event, member_id=creator_id)


async def update_event(event_id: str, payload: EventUpdate) -> EventOut:
    event = await repository.find_by_id(event_id)
    if event is None or event.deletedAt is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    data: dict = {}
    if payload.title is not None:
        data["title"] = payload.title
    if "description" in payload.model_fields_set:
        data["description"] = payload.description
    if payload.location is not None:
        data["location"] = payload.location
    if payload.date is not None:
        data["date"] = payload.date
    if payload.capacity is not None:
        data["capacity"] = payload.capacity

    if data:
        updated, error = await repository.update_event_with_capacity_guard(event_id, data)
        if error == "not_found":
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
        if error == "capacity":
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Capacity cannot be lower than the current registration count",
            )
    else:
        updated = event

    if payload.manager_ids is not None:
        manager_ids = await repository.list_manager_ids(payload.manager_ids)
        if set(manager_ids) != set(payload.manager_ids):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "Every assigned manager must be an active manager account",
            )
        await repository.set_manager_assignments(event_id, manager_ids)
        updated = await repository.find_by_id(event_id)

    return EventOut.from_prisma(updated)


async def delete_event(event_id: str) -> None:
    event = await repository.find_by_id(event_id)
    if event is None or event.deletedAt is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    await repository.soft_delete_event(event_id)


async def register(event_id: str, member_id: str) -> EventOut:
    event, error = await repository.create_registration_if_space(event_id, member_id)
    if error == "not_found":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    if error == "capacity":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Event is at capacity")
    if error == "duplicate":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already registered")
    return EventOut.from_prisma(event, member_id=member_id)


async def unregister(event_id: str, member_id: str, *, viewer_id: str | None = None) -> EventOut:
    event = await repository.find_by_id(event_id)
    if event is None or event.deletedAt is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    existing = await repository.find_registration(event_id, member_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not registered")

    await repository.delete_registration(event_id, member_id)
    updated = await repository.find_by_id(event_id)
    # viewer_id lets staff remove someone else's registration without the response's
    # `registered` flag flipping to reflect the removed member instead of themselves.
    return EventOut.from_prisma(updated, member_id=viewer_id or member_id)


async def get_event_analytics(event_id: str) -> EventAnalytics:
    event = await repository.find_by_id_for_analytics(event_id)
    if event is None or event.deletedAt is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    if event.date > datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Analytics are available once the event has taken place",
        )

    registrations = sorted(event.registrations or [], key=lambda r: r.createdAt)

    role_counts: dict[str, int] = {}
    registrants: list[EventAnalyticsRegistrant] = []
    for r in registrations:
        role_name = r.member.role.name if r.member.role else "unknown"
        role_counts[role_name] = role_counts.get(role_name, 0) + 1
        registrants.append(
            EventAnalyticsRegistrant(
                id=r.member.id,
                full_name=r.member.fullName,
                email=r.member.email,
                role=role_name,
                registered_at=r.createdAt,
            )
        )

    total_registered = len(registrants)
    fill_rate = total_registered / event.capacity if event.capacity > 0 else 0.0

    return EventAnalytics(
        event_id=event.id,
        title=event.title,
        date=event.date,
        location=event.location,
        capacity=event.capacity,
        total_registered=total_registered,
        fill_rate=round(fill_rate, 2),
        registrants_by_role=[
            RoleBreakdown(role=role, count=count) for role, count in sorted(role_counts.items())
        ],
        registrants=registrants,
    )


async def get_attendance_summary() -> AttendanceSummary:
    events_this_month = await repository.count_events_this_month()
    total_registrations = await repository.count_total_registrations()
    # Summing capacity over a take=1000 page while counting *every* registration made
    # the ratio climb past 100% once the library passed a thousand events. Both sides
    # of the fraction now cover the same set.
    total_capacity = await repository.sum_capacity()
    avg_rate = total_registrations / total_capacity if total_capacity > 0 else 0.0
    return AttendanceSummary(
        total_events_this_month=events_this_month,
        total_attendees=total_registrations,
        average_attendance_rate=round(avg_rate, 2),
    )
