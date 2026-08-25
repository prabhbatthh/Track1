from fastapi import HTTPException, status
from prisma.models import User

from app.modules.guardian import repository as guardian_repository
from app.modules.members import repository as members_repository
from app.modules.visits import repository
from app.modules.visits.schemas import (
    ChildVisitStatusOut,
    LibraryVisitOut,
    MemberVisitStatusOut,
)


async def check_in_member(recorded_by: User, member_id: str) -> LibraryVisitOut:
    member = await members_repository.find_by_id(member_id)
    if member is None or not member.isActive or member.deletedAt is not None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found or inactive",
        )

    open_visit = await repository.find_open_visit_for_member(member_id)
    if open_visit is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Member is already checked in.",
        )

    visit = await repository.create_check_in(member_id, recorded_by.id)
    if visit is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record check-in",
        )
    return LibraryVisitOut.from_prisma(visit)


async def check_out_member(recorded_by: User, member_id: str) -> LibraryVisitOut:
    member = await members_repository.find_by_id(member_id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found",
        )

    open_visit = await repository.find_open_visit_for_member(member_id)
    if open_visit is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Member is not currently checked in.",
        )

    visit = await repository.close_visit(open_visit.id)
    if visit is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to record check-out",
        )
    return LibraryVisitOut.from_prisma(visit)


async def list_active_visits() -> list[LibraryVisitOut]:
    visits = await repository.list_active_visits()
    return [LibraryVisitOut.from_prisma(visit) for visit in visits]


async def get_member_status(user: User) -> MemberVisitStatusOut:
    latest = await repository.get_latest_visit_for_member(user.id)
    if latest is None:
        return MemberVisitStatusOut(
            member_id=user.id,
            is_in_library=False,
            checked_in_at=None,
            last_checked_out_at=None,
            latest_visit_id=None,
        )

    is_in_library = latest.checkedOutAt is None
    return MemberVisitStatusOut(
        member_id=user.id,
        is_in_library=is_in_library,
        checked_in_at=latest.checkedInAt if is_in_library else None,
        last_checked_out_at=latest.checkedOutAt if not is_in_library else None,
        latest_visit_id=latest.id,
    )


async def get_children_status(guardian: User) -> list[ChildVisitStatusOut]:
    children = await guardian_repository.list_children(guardian.id)
    results: list[ChildVisitStatusOut] = []
    for child in children:
        latest = await repository.get_latest_visit_for_member(child.id)
        if latest is None:
            results.append(
                ChildVisitStatusOut(
                    child_id=child.id,
                    child_name=child.fullName,
                    child_email=child.email,
                    is_in_library=False,
                    checked_in_at=None,
                    last_checked_out_at=None,
                )
            )
        else:
            is_in_library = latest.checkedOutAt is None
            results.append(
                ChildVisitStatusOut(
                    child_id=child.id,
                    child_name=child.fullName,
                    child_email=child.email,
                    is_in_library=is_in_library,
                    checked_in_at=latest.checkedInAt if is_in_library else None,
                    last_checked_out_at=latest.checkedOutAt if not is_in_library else None,
                )
            )
    return results


async def export_active_visits_csv() -> str:
    import csv
    import io

    visits = await list_active_visits()
    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(
        [
            "Member ID",
            "Member Name",
            "Email",
            "Check-In Date",
            "Check-In Time",
            "Status",
        ]
    )
    for visit in visits:
        dt = visit.checked_in_at
        date_str = dt.strftime("%Y-%m-%d")
        time_str = dt.strftime("%I:%M %p")
        writer.writerow(
            [
                visit.member_id,
                visit.member_name,
                visit.member_email,
                date_str,
                time_str,
                "Currently in Library",
            ]
        )
    return output.getvalue()
