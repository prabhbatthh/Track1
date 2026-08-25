from prisma.models import BookRecord

from app.db.prisma import prisma

RECORD_INCLUDE = {"book": True, "loggedBy": True}

LIST_LIMIT = 200


async def create(*, book_id: str, type_: str, note: str | None, logged_by_id: str) -> BookRecord:
    return await prisma.bookrecord.create(
        data={"bookId": book_id, "type": type_, "note": note, "loggedById": logged_by_id},
        include=RECORD_INCLUDE,
    )


async def list_all() -> list[BookRecord]:
    return await prisma.bookrecord.find_many(
        include=RECORD_INCLUDE, order={"createdAt": "desc"}, take=LIST_LIMIT
    )
