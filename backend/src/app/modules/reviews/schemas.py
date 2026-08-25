from datetime import datetime

from pydantic import BaseModel, Field


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(min_length=1, max_length=2000)
    images: list[str] = Field(default_factory=list, max_length=4)


class ReviewUpdate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(min_length=1, max_length=2000)
    images: list[str] = Field(default_factory=list, max_length=4)


class ReviewOut(BaseModel):
    id: str
    book_id: str
    book_title: str
    book_author: str
    reviewer_id: str
    reviewer_name: str
    reviewer_avatar_url: str | None
    rating: int
    comment: str
    images: list[str]
    created_at: datetime
    is_own: bool

    @staticmethod
    def from_prisma(review, *, current_user_id: str) -> "ReviewOut":
        return ReviewOut(
            id=review.id,
            book_id=review.bookId,
            book_title=review.book.title,
            book_author=review.book.author,
            reviewer_id=review.memberId,
            reviewer_name=review.member.fullName,
            reviewer_avatar_url=review.member.avatarUrl,
            rating=review.rating,
            comment=review.comment,
            images=review.images,
            created_at=review.createdAt,
            is_own=review.memberId == current_user_id,
        )


class RatingBreakdownEntry(BaseModel):
    stars: int
    percent: float


class BookReviewsOut(BaseModel):
    items: list[ReviewOut]
    average_rating: float
    total_reviews: int
    breakdown: list[RatingBreakdownEntry]
    # AI-generated "what readers are saying" summary — None until there's at least one
    # review, and while a fresh one is being generated for the first time.
    review_digest: str | None = None
