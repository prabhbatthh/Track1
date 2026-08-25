from typing import Annotated

from fastapi import APIRouter, Depends, status
from prisma.models import User

from app.api.deps import get_current_user, require_role
from app.core.constants import Role
from app.modules.reviews import service
from app.modules.reviews.schemas import BookReviewsOut, ReviewCreate, ReviewOut, ReviewUpdate

router = APIRouter(tags=["reviews"])

view_all_reviews = require_role(Role.ADMIN, Role.MANAGER, Role.LIBRARIAN, Role.IT_HEAD)


@router.get("/books/{book_id}/reviews", response_model=BookReviewsOut)
async def list_book_reviews(
    book_id: str, user: Annotated[User, Depends(get_current_user)]
) -> BookReviewsOut:
    return await service.get_book_reviews(book_id, viewer_id=user.id)


@router.post(
    "/books/{book_id}/reviews", response_model=ReviewOut, status_code=status.HTTP_201_CREATED
)
async def create_review(
    book_id: str, payload: ReviewCreate, user: Annotated[User, Depends(get_current_user)]
) -> ReviewOut:
    return await service.create_review(book_id, user.id, payload)


@router.get("/reviews/me", response_model=list[ReviewOut])
async def list_my_reviews(user: Annotated[User, Depends(get_current_user)]) -> list[ReviewOut]:
    return await service.get_my_reviews(user.id)


@router.get("/reviews", response_model=list[ReviewOut])
async def list_all_reviews(user: Annotated[User, Depends(view_all_reviews)]) -> list[ReviewOut]:
    return await service.get_all_reviews(viewer_id=user.id)


@router.put("/reviews/{review_id}", response_model=ReviewOut)
async def update_review(
    review_id: str, payload: ReviewUpdate, user: Annotated[User, Depends(get_current_user)]
) -> ReviewOut:
    return await service.update_review(review_id, user.id, payload)


@router.delete("/reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review(review_id: str, user: Annotated[User, Depends(get_current_user)]) -> None:
    await service.delete_review(review_id, user_id=user.id, user_role=user.role.name)
