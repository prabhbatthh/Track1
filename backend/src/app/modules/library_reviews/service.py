from fastapi import HTTPException, status

from app.core.constants import Role
from app.db.prisma import prisma
from app.modules.audit_log import service as audit_log_service
from app.modules.audit_log.constants import AuditAction
from app.modules.library_reviews import repository
from app.modules.library_reviews.schemas import LibraryReviewCreate, LibraryReviewOut
from app.modules.notifications import service as notifications_service

# How many approved testimonials the public homepage shows.
APPROVED_LIMIT = 20

_DECISION_ACTIONS = {
    "approved": AuditAction.LIBRARY_REVIEW_APPROVED,
    "rejected": AuditAction.LIBRARY_REVIEW_REJECTED,
}


async def list_pending_reviews() -> list[LibraryReviewOut]:
    rows = await repository.list_pending()
    return [LibraryReviewOut.from_prisma(row) for row in rows]


async def list_approved_reviews() -> list[LibraryReviewOut]:
    rows = await repository.list_approved(APPROVED_LIMIT)
    return [LibraryReviewOut.from_prisma(row) for row in rows]


async def get_my_review(member_id: str) -> LibraryReviewOut | None:
    row = await repository.find_latest_for_member(member_id)
    return LibraryReviewOut.from_prisma(row) if row else None


async def submit_review(member_id: str, payload: LibraryReviewCreate) -> LibraryReviewOut:
    # ponytail: no one-pending-per-member guard — a resubmit just files a new row rather
    # than editing in place. Add a uniqueness/edit path if members start double-filing.
    row = await repository.create(
        member_id=member_id, rating=payload.rating, comment=payload.comment
    )
    await notifications_service.notify_roles(
        [Role.ADMIN],
        "pending-request",
        f"{row.member.fullName} left a library review for approval.",
    )
    return LibraryReviewOut.from_prisma(row)


async def approve_review(review_id: str, decided_by_id: str) -> LibraryReviewOut:
    return await _decide(review_id, decided_by_id, "approved")


async def reject_review(review_id: str, decided_by_id: str) -> LibraryReviewOut:
    return await _decide(review_id, decided_by_id, "rejected")


async def _decide(review_id: str, decided_by_id: str, status_value: str) -> LibraryReviewOut:
    existing = await repository.find_by_id(review_id)
    if existing is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review not found")
    if existing.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "This review has already been decided")

    async with prisma.tx() as tx:
        row = await repository.decide_if_pending(
            review_id, status=status_value, decided_by_id=decided_by_id, client=tx
        )
        if row is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "This review has already been decided")
        await audit_log_service.record(
            actor_id=decided_by_id,
            action=_DECISION_ACTIONS[status_value],
            metadata={"memberName": row.member.fullName},
            client=tx,
        )
    return LibraryReviewOut.from_prisma(row)
