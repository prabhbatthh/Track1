from typing import Annotated

from fastapi import APIRouter, Depends, status
from prisma.models import User

from app.api.deps import get_current_user, require_role
from app.core.constants import Role
from app.modules.library_reviews import service
from app.modules.library_reviews.schemas import LibraryReviewCreate, LibraryReviewOut

router = APIRouter(prefix="/library-reviews", tags=["library-reviews"])

decide_review = require_role(Role.ADMIN)


@router.get("/approved", response_model=list[LibraryReviewOut])
async def list_approved() -> list[LibraryReviewOut]:
    """Public — feeds the homepage's 'What Our Members Say' section, no auth required."""
    return await service.list_approved_reviews()


@router.get("", response_model=list[LibraryReviewOut])
async def list_pending(_: Annotated[User, Depends(decide_review)]) -> list[LibraryReviewOut]:
    return await service.list_pending_reviews()


@router.get("/me", response_model=LibraryReviewOut | None)
async def get_my_review(
    user: Annotated[User, Depends(get_current_user)],
) -> LibraryReviewOut | None:
    return await service.get_my_review(user.id)


@router.post("", response_model=LibraryReviewOut, status_code=status.HTTP_201_CREATED)
async def submit_review(
    payload: LibraryReviewCreate, user: Annotated[User, Depends(get_current_user)]
) -> LibraryReviewOut:
    return await service.submit_review(user.id, payload)


@router.post("/{review_id}/approve", response_model=LibraryReviewOut)
async def approve_review(
    review_id: str, user: Annotated[User, Depends(decide_review)]
) -> LibraryReviewOut:
    return await service.approve_review(review_id, user.id)


@router.post("/{review_id}/reject", response_model=LibraryReviewOut)
async def reject_review(
    review_id: str, user: Annotated[User, Depends(decide_review)]
) -> LibraryReviewOut:
    return await service.reject_review(review_id, user.id)
