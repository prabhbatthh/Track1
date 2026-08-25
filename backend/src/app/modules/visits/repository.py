from datetime import UTC, datetime

from prisma.models import LibraryVisit

from app.db.prisma import prisma

VISIT_INCLUDE = {"member": True, "recordedBy": True}


async def find_open_visit_for_member(member_id: str) -> LibraryVisit | None:
    return await prisma.libraryvisit.find_first(
        where={"memberId": member_id, "checkedOutAt": None},
        include=VISIT_INCLUDE,
    )


async def create_check_in(member_id: str, recorded_by_id: str) -> LibraryVisit | None:
    now = datetime.now(UTC)
    return await prisma.libraryvisit.create(
        data={
            "memberId": member_id,
            "recordedById": recorded_by_id,
            "checkedInAt": now,
        },
        include=VISIT_INCLUDE,
    )


async def close_visit(visit_id: str) -> LibraryVisit | None:
    now = datetime.now(UTC)
    return await prisma.libraryvisit.update(
        where={"id": visit_id},
        data={"checkedOutAt": now},
        include=VISIT_INCLUDE,
    )


async def list_active_visits() -> list[LibraryVisit]:
    return await prisma.libraryvisit.find_many(
        where={"checkedOutAt": None},
        order={"checkedInAt": "desc"},
        include=VISIT_INCLUDE,
    )


async def get_latest_visit_for_member(member_id: str) -> LibraryVisit | None:
    return await prisma.libraryvisit.find_first(
        where={"memberId": member_id},
        order={"checkedInAt": "desc"},
        include=VISIT_INCLUDE,
    )


async def list_check_ins_between(start: datetime, end: datetime) -> list[LibraryVisit]:
    """Every visit that started in [start, end) — one bulk fetch for footfall analytics
    to bucket by day/hour/duration in Python, rather than one query per bucket."""
    return await prisma.libraryvisit.find_many(
        where={"checkedInAt": {"gte": start, "lt": end}},
        order={"checkedInAt": "asc"},
    )
