from datetime import UTC, datetime

from pydantic import BaseModel, Field, field_validator


def _reject_past_dates(value: datetime | None) -> datetime | None:
    """Events are scheduled, not recorded — a past date at creation is always a typo.

    Left unchecked, a mistyped year also pins the bad record to the top of every
    listing, since events are ordered by date ascending.

    Deliberately applied to creation only. Events legitimately become past ones by
    elapsing, and the edit form resends every field including `date` — so enforcing
    this on update would make a finished event impossible to edit at all.
    """
    if value is not None and value < datetime.now(UTC):
        raise ValueError("Event date must be in the future")
    return value


class EventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    location: str = Field(min_length=1, max_length=255)
    date: datetime
    capacity: int = Field(gt=0)
    manager_ids: list[str] = Field(default_factory=list)

    _future_date = field_validator("date")(_reject_past_dates)


class EventUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    location: str | None = Field(default=None, min_length=1, max_length=255)
    date: datetime | None = None
    capacity: int | None = Field(default=None, gt=0)
    # None = leave assignments unchanged; a list (even empty) replaces the whole set.
    manager_ids: list[str] | None = None


class RegistrantOut(BaseModel):
    id: str
    full_name: str
    email: str


class EventOut(BaseModel):
    id: str
    title: str
    description: str | None
    location: str
    date: datetime
    capacity: int
    attendees: int
    registered: bool
    registrants: list[RegistrantOut]
    assigned_managers: list[RegistrantOut]
    created_at: datetime

    @staticmethod
    def from_prisma(event, *, member_id: str | None = None) -> "EventOut":
        registrants = event.registrations or []
        assignments = event.managerAssignments or []
        return EventOut(
            id=event.id,
            title=event.title,
            description=event.description,
            location=event.location,
            date=event.date,
            capacity=event.capacity,
            attendees=len(registrants),
            registered=any(r.memberId == member_id for r in registrants) if member_id else False,
            registrants=[
                RegistrantOut(
                    id=r.member.id,
                    full_name=r.member.fullName,
                    email=r.member.email,
                )
                for r in registrants
            ],
            assigned_managers=[
                RegistrantOut(
                    id=a.manager.id,
                    full_name=a.manager.fullName,
                    email=a.manager.email,
                )
                for a in assignments
            ],
            created_at=event.createdAt,
        )


class EventListResponse(BaseModel):
    items: list[EventOut]
    total: int


class AttendanceSummary(BaseModel):
    total_events_this_month: int
    total_attendees: int
    average_attendance_rate: float


class EventAnalyticsRegistrant(BaseModel):
    id: str
    full_name: str
    email: str
    role: str
    registered_at: datetime


class RoleBreakdown(BaseModel):
    role: str
    count: int


class EventAnalytics(BaseModel):
    event_id: str
    title: str
    date: datetime
    location: str
    capacity: int
    total_registered: int
    fill_rate: float
    registrants_by_role: list[RoleBreakdown]
    registrants: list[EventAnalyticsRegistrant]
