from fastapi import HTTPException, status
from prisma.errors import ForeignKeyViolationError

from app.modules.book_records import repository
from app.modules.book_records.schemas import BookRecordCreate, BookRecordOut


async def create_record(logged_by_id: str, payload: BookRecordCreate) -> BookRecordOut:
    try:
        record = await repository.create(
            book_id=payload.book_id,
            type_=payload.type,
            note=payload.note,
            logged_by_id=logged_by_id,
        )
    except ForeignKeyViolationError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found") from exc
    return BookRecordOut.from_prisma(record)


async def list_records() -> list[BookRecordOut]:
    records = await repository.list_all()
    return [BookRecordOut.from_prisma(r) for r in records]
