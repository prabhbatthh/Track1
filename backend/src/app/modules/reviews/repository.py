from prisma.models import Review

from app.db.prisma import prisma

REVIEW_INCLUDE = {"book": True, "member": True}

# list_for_book() is naturally bounded (one book's reviews) and left uncapped;
# list_all() backs the staff moderation queue across every book, so it isn't.
LIST_LIMIT = 200


async def list_for_book(book_id: str) -> list[Review]:
    return await prisma.review.find_many(
        where={"bookId": book_id}, include=REVIEW_INCLUDE, order={"createdAt": "desc"}
    )


async def list_for_member(member_id: str) -> list[Review]:
    return await prisma.review.find_many(
        where={"memberId": member_id}, include=REVIEW_INCLUDE, order={"createdAt": "desc"}
    )


async def list_all() -> list[Review]:
    return await prisma.review.find_many(
        include=REVIEW_INCLUDE, order={"createdAt": "desc"}, take=LIST_LIMIT
    )


async def find_by_id(review_id: str) -> Review | None:
    return await prisma.review.find_unique(where={"id": review_id}, include=REVIEW_INCLUDE)


async def create(
    *, book_id: str, member_id: str, rating: int, comment: str, images: list[str]
) -> Review:
    return await prisma.review.create(
        data={
            "bookId": book_id,
            "memberId": member_id,
            "rating": rating,
            "comment": comment,
            "images": images,
        },
        include=REVIEW_INCLUDE,
    )


async def update(review_id: str, *, rating: int, comment: str, images: list[str]) -> Review:
    return await prisma.review.update(
        where={"id": review_id},
        data={"rating": rating, "comment": comment, "images": images},
        include=REVIEW_INCLUDE,
    )


async def delete(review_id: str) -> None:
    await prisma.review.delete(where={"id": review_id})
