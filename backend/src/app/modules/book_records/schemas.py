from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

BookRecordType = Literal["lost", "donated", "purchased"]


class BookRecordCreate(BaseModel):
    book_id: str
    type: BookRecordType
    note: str | None = Field(default=None, max_length=500)


class BookRecordOut(BaseModel):
    id: str
    book_id: str
    book_title: str
    type: str
    note: str | None
    logged_by_name: str
    created_at: datetime

    @staticmethod
    def from_prisma(record) -> "BookRecordOut":
        return BookRecordOut(
            id=record.id,
            book_id=record.bookId,
            book_title=record.book.title,
            type=record.type,
            note=record.note,
            logged_by_name=record.loggedBy.fullName,
            created_at=record.createdAt,
        )
