from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from prisma.models import User

from app.api.deps import get_current_user, get_optional_user, require_role
from app.core.constants import Role
from app.modules.events import service
from app.modules.events.schemas import (
    AttendanceSummary,
    EventAnalytics,
    EventCreate,
    EventListResponse,
    EventOut,
    EventUpdate,
)

router = APIRouter(prefix="/events", tags=["events"])

manage_events = require_role(Role.ADMIN, Role.MANAGER, Role.LIBRARIAN)
moderate_registrants = require_role(Role.ADMIN, Role.IT_HEAD)
view_analytics = require_role(Role.ADMIN)


@router.get("", response_model=EventListResponse)
async def list_events(
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    # Defaults to "all" so existing callers keep their current behaviour; the events
    # page and the chat tool both pass an explicit timeframe. Filtering here rather
    # than in the client is what stops pagination and filtering disagreeing.
    timeframe: Annotated[Literal["all", "upcoming", "past"], Query()] = "all",
    current_user: Annotated[User | None, Depends(get_optional_user)] = None,
) -> EventListResponse:
    member_id = current_user.id if current_user else None
    return await service.list_events(
        page=page, page_size=page_size, member_id=member_id, timeframe=timeframe
    )


@router.get("/summary", response_model=AttendanceSummary)
async def attendance_summary() -> AttendanceSummary:
    return await service.get_attendance_summary()


@router.get("/{event_id}", response_model=EventOut)
async def get_event(
    event_id: UUID,
    current_user: Annotated[User | None, Depends(get_optional_user)] = None,
) -> EventOut:
    member_id = current_user.id if current_user else None
    return await service.get_event(str(event_id), member_id=member_id)


@router.get("/{event_id}/analytics", response_model=EventAnalytics)
async def get_event_analytics(
    event_id: UUID,
    _: Annotated[User, Depends(view_analytics)],
) -> EventAnalytics:
    return await service.get_event_analytics(str(event_id))


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
async def create_event(
    payload: EventCreate,
    current_user: Annotated[User, Depends(manage_events)],
) -> EventOut:
    return await service.create_event(payload, creator_id=current_user.id)


@router.put("/{event_id}", response_model=EventOut)
async def update_event(
    event_id: UUID,
    payload: EventUpdate,
    _: Annotated[User, Depends(manage_events)],
) -> EventOut:
    return await service.update_event(str(event_id), payload)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: UUID,
    _: Annotated[User, Depends(manage_events)],
) -> None:
    await service.delete_event(str(event_id))


@router.post("/{event_id}/register", response_model=EventOut)
async def register(
    event_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
) -> EventOut:
    return await service.register(str(event_id), current_user.id)


@router.delete("/{event_id}/register", response_model=EventOut)
async def unregister(
    event_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
) -> EventOut:
    return await service.unregister(str(event_id), current_user.id)


@router.delete("/{event_id}/registrants/{member_id}", response_model=EventOut)
async def remove_registrant(
    event_id: UUID,
    member_id: UUID,
    current_user: Annotated[User, Depends(moderate_registrants)],
) -> EventOut:
    return await service.unregister(str(event_id), str(member_id), viewer_id=current_user.id)
