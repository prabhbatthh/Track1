from collections import Counter
from datetime import UTC, datetime

from prisma.models import GuardianLink, User

from app.db.prisma import prisma

CHILD_INCLUDE = {"role": True}


async def create_link(*, guardian_id: str, member_id: str) -> GuardianLink:
    return await prisma.guardianlink.create(data={"guardianId": guardian_id, "memberId": member_id})


async def upsert_link(*, guardian_id: str, member_id: str) -> GuardianLink:
    """Point this member's single link at `guardian_id`, creating it if absent.

    memberId is unique, so one upsert covers both "link" and "change guardian" without a
    delete-then-create window that could leave the member with no guardian if the second
    step failed. lastDigestSentAt is deliberately reset: a new guardian hasn't been sent
    this month's digest yet.
    """
    return await prisma.guardianlink.upsert(
        where={"memberId": member_id},
        data={
            "create": {"guardianId": guardian_id, "memberId": member_id},
            "update": {"guardianId": guardian_id, "lastDigestSentAt": None},
        },
    )


async def delete_link_for_member(member_id: str) -> int:
    """Returns how many links were removed (0 when the member had no guardian)."""
    return await prisma.guardianlink.delete_many(where={"memberId": member_id})


async def list_children(guardian_id: str) -> list[User]:
    links = await prisma.guardianlink.find_many(
        where={"guardianId": guardian_id}, include={"member": {"include": CHILD_INCLUDE}}
    )
    return [link.member for link in links]


async def find_guardian_for_child(member_id: str) -> User | None:
    link = await find_link_for_member(member_id)
    return link.guardian if link else None


async def find_link_for_member(member_id: str) -> GuardianLink | None:
    """The link row itself (guardian hydrated) — callers that need createdAt, not just who."""
    return await prisma.guardianlink.find_first(
        where={"memberId": member_id}, include={"guardian": {"include": {"role": True}}}
    )


async def list_all_links() -> list[GuardianLink]:
    """Every guardian-child pair, for the monthly digest sweep — small table, no
    pagination needed at this scale (mirrors list_active_loans's own reasoning)."""
    return await prisma.guardianlink.find_many(include={"guardian": True, "member": True})


async def mark_digest_sent(link_id: str) -> None:
    await prisma.guardianlink.update(
        where={"id": link_id}, data={"lastDigestSentAt": datetime.now(UTC)}
    )


async def count_completed_in_range(
    member_id: str, start: datetime, end: datetime
) -> tuple[int, str | None]:
    """(count, most-common book category) among books marked completed in [start, end)."""
    rows = await prisma.readingprogress.find_many(
        where={
            "memberId": member_id,
            "status": "completed",
            "updatedAt": {"gte": start, "lt": end},
        },
        include={"book": True},
    )
    if not rows:
        return 0, None
    categories = Counter(row.book.category for row in rows if row.book is not None)
    top_category = categories.most_common(1)[0][0] if categories else None
    return len(rows), top_category
