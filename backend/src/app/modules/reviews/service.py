import logging

from fastapi import HTTPException, status
from langchain_core.messages import HumanMessage, SystemMessage
from prisma.errors import ForeignKeyViolationError, UniqueViolationError

from app.core.constants import Role
from app.core.llm import build_chat_llm
from app.modules.books import repository as books_repository
from app.modules.reviews import repository
from app.modules.reviews.schemas import (
    BookReviewsOut,
    RatingBreakdownEntry,
    ReviewCreate,
    ReviewOut,
    ReviewUpdate,
)

logger = logging.getLogger(__name__)

MODERATOR_ROLES = {Role.ADMIN.value, Role.IT_HEAD.value}

_DIGEST_SYSTEM_PROMPT = """You summarize real reader reviews for a library catalog page.

Given a book's title and a list of its reviews (rating + comment), write a 2-3 sentence
summary of what reviewers actually said — the real throughline of praise and criticism
across them. Rules:
- Base this ONLY on the review text given. Never invent an opinion, a plot detail, or a
  fact that isn't actually present in the reviews.
- No spoilers.
- Plain prose only: no headings, no bullet points, no quotation marks around the whole
  thing, and don't just restate the star rating as a number.
- Output only the summary text, nothing else."""

# Bounds prompt size for books with a lot of reviews — the most recent N is a reasonable
# proxy for "current sentiment" without needing every review ever written.
_MAX_REVIEWS_IN_DIGEST = 20


async def _generate_digest(book_title: str, reviews: list) -> str | None:
    """Best-effort — a stale or missing digest degrades the page, not the endpoint.

    Unlike suggest_description (its own dedicated staff action), this is supplementary
    data riding along with the review list, so a failure here must not turn a normal
    GET /books/{id}/reviews into an error.
    """
    sample = reviews[:_MAX_REVIEWS_IN_DIGEST]
    review_lines = "\n".join(f"- {review.rating}/5: {review.comment}" for review in sample)
    human = f"Book: {book_title}\n\nReviews:\n{review_lines}"

    try:
        llm = build_chat_llm()
        result = await llm.ainvoke(
            [SystemMessage(content=_DIGEST_SYSTEM_PROMPT), HumanMessage(content=human)]
        )
    except Exception:
        logger.exception("review digest generation failed for %r", book_title)
        return None

    digest = str(result.content).strip()
    return digest or None


async def _review_digest(book_id: str, reviews: list, total: int) -> str | None:
    if total == 0:
        return None
    book = await books_repository.find_by_id(book_id)
    if book is None:
        return None
    # A cache hit is "the digest already covers exactly this many reviews" — any change
    # to the review count (new review, edit doesn't change count, delete) invalidates it.
    if book.reviewDigest is not None and book.reviewDigestReviewCount == total:
        return book.reviewDigest

    digest = await _generate_digest(book.title, reviews)
    if digest is not None:
        await books_repository.save_review_digest(book_id, digest=digest, review_count=total)
    return digest


async def get_book_reviews(book_id: str, *, viewer_id: str) -> BookReviewsOut:
    reviews = await repository.list_for_book(book_id)
    total = len(reviews)
    average = round(sum(review.rating for review in reviews) / total, 1) if total else 0.0
    return BookReviewsOut(
        items=[ReviewOut.from_prisma(review, current_user_id=viewer_id) for review in reviews],
        average_rating=average,
        total_reviews=total,
        breakdown=_build_breakdown(reviews),
        review_digest=await _review_digest(book_id, reviews, total),
    )


async def get_all_reviews(*, viewer_id: str) -> list[ReviewOut]:
    reviews = await repository.list_all()
    return [ReviewOut.from_prisma(review, current_user_id=viewer_id) for review in reviews]


async def get_my_reviews(member_id: str) -> list[ReviewOut]:
    reviews = await repository.list_for_member(member_id)
    return [ReviewOut.from_prisma(review, current_user_id=member_id) for review in reviews]


async def create_review(book_id: str, member_id: str, payload: ReviewCreate) -> ReviewOut:
    try:
        review = await repository.create(
            book_id=book_id,
            member_id=member_id,
            rating=payload.rating,
            comment=payload.comment,
            images=payload.images,
        )
    except UniqueViolationError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You've already reviewed this book — edit your review instead",
        ) from exc
    except ForeignKeyViolationError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found") from exc

    return ReviewOut.from_prisma(review, current_user_id=member_id)


async def update_review(review_id: str, member_id: str, payload: ReviewUpdate) -> ReviewOut:
    existing = await repository.find_by_id(review_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    if existing.memberId != member_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="You can only edit your own review"
        )

    updated = await repository.update(
        review_id, rating=payload.rating, comment=payload.comment, images=payload.images
    )
    return ReviewOut.from_prisma(updated, current_user_id=member_id)


async def delete_review(review_id: str, *, user_id: str, user_role: str) -> None:
    existing = await repository.find_by_id(review_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    if existing.memberId != user_id and user_role not in MODERATOR_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="You can't delete this review"
        )

    await repository.delete(review_id)


def _build_breakdown(reviews: list) -> list[RatingBreakdownEntry]:
    total = len(reviews)
    counts = dict.fromkeys(range(1, 6), 0)
    for review in reviews:
        counts[review.rating] = counts.get(review.rating, 0) + 1

    return [
        RatingBreakdownEntry(
            stars=stars,
            percent=round((counts[stars] / total) * 100, 1) if total else 0.0,
        )
        for stars in range(5, 0, -1)
    ]
