from datetime import datetime

from pydantic import BaseModel


class CheckInCreate(BaseModel):
    member_id: str


class CheckOutCreate(BaseModel):
    member_id: str


class LibraryVisitOut(BaseModel):
    id: str
    member_id: str
    member_name: str
    member_email: str
    checked_in_at: datetime
    checked_out_at: datetime | None
    recorded_by_id: str
    recorded_by_name: str | None = None
    is_currently_inside: bool

    @staticmethod
    def from_prisma(visit) -> "LibraryVisitOut":
        member_name = visit.member.fullName if visit.member else ""
        member_email = visit.member.email if visit.member else ""
        recorded_by_name = visit.recordedBy.fullName if visit.recordedBy else None
        return LibraryVisitOut(
            id=visit.id,
            member_id=visit.memberId,
            member_name=member_name,
            member_email=member_email,
            checked_in_at=visit.checkedInAt,
            checked_out_at=visit.checkedOutAt,
            recorded_by_id=visit.recordedById,
            recorded_by_name=recorded_by_name,
            is_currently_inside=visit.checkedOutAt is None,
        )


class MemberVisitStatusOut(BaseModel):
    member_id: str
    is_in_library: bool
    checked_in_at: datetime | None = None
    last_checked_out_at: datetime | None = None
    latest_visit_id: str | None = None


class ChildVisitStatusOut(BaseModel):
    child_id: str
    child_name: str
    child_email: str
    is_in_library: bool
    checked_in_at: datetime | None = None
    last_checked_out_at: datetime | None = None
