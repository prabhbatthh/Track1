from datetime import UTC, datetime

from prisma import Prisma
from prisma.models import LibraryReview

from app.db.prisma import prisma

INCLUDE = {"member": {"include": {"role": True}}}

# Mirrors billing_requests.repository's own limit/reasoning.
LIST_LIMIT = 200


async def list_pending() -> list[LibraryReview]:
    return await prisma.libraryreview.find_many(
        where={"status": "pending"}, include=INCLUDE, order={"createdAt": "asc"}, take=LIST_LIMIT
    )


async def list_approved(limit: int) -> list[LibraryReview]:
    return await prisma.libraryreview.find_many(
        where={"status": "approved"}, include=INCLUDE, order={"decidedAt": "desc"}, take=limit
    )


async def find_latest_for_member(member_id: str) -> LibraryReview | None:
    rows = await prisma.libraryreview.find_many(
        where={"memberId": member_id}, include=INCLUDE, order={"createdAt": "desc"}, take=1
    )
    return rows[0] if rows else None


async def find_by_id(review_id: str) -> LibraryReview | None:
    return await prisma.libraryreview.find_unique(where={"id": review_id}, include=INCLUDE)


async def create(*, member_id: str, rating: int, comment: str) -> LibraryReview:
    return await prisma.libraryreview.create(
        data={"memberId": member_id, "rating": rating, "comment": comment}, include=INCLUDE
    )


async def decide_if_pending(
    review_id: str, *, status: str, decided_by_id: str, client: Prisma
) -> LibraryReview | None:
    updated = await client.libraryreview.update_many(
        where={"id": review_id, "status": "pending"},
        data={"status": status, "decidedById": decided_by_id, "decidedAt": datetime.now(UTC)},
    )
    if updated != 1:
        return None
    return await client.libraryreview.find_unique(where={"id": review_id}, include=INCLUDE)
