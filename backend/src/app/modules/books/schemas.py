import re
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

BookSort = Literal["newest", "rating", "recommended"]

_ISBN_CHARS = re.compile(r"[- ]")
_ISBN_10 = re.compile(r"^\d{9}[\dX]$")
_ISBN_13 = re.compile(r"^\d{13}$")
_EARLIEST_PRINT_YEAR = 1450
_MAX_PUBLISHED_YEAR = date.today().year + 1


def _validate_isbn(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = _ISBN_CHARS.sub("", value).upper()
    if not (_ISBN_10.match(normalized) or _ISBN_13.match(normalized)):
        raise ValueError("isbn must be a 10 or 13 digit ISBN (hyphens/spaces allowed)")
    return normalized


class BookCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    author: str = Field(min_length=1, max_length=150)
    category: str = Field(min_length=1, max_length=80)
    isbn: str | None = Field(default=None, max_length=20)
    description: str | None = None
    publisher: str | None = Field(default=None, max_length=150)
    published_year: int | None = Field(
        default=None, ge=_EARLIEST_PRINT_YEAR, le=_MAX_PUBLISHED_YEAR
    )
    language: str | None = Field(default=None, max_length=40)
    cover_image_url: str | None = Field(default=None, max_length=8_000_000)
    total_copies: int = Field(default=0, ge=0)
    shelf_location: str | None = Field(default=None, max_length=120)

    _validate_isbn = field_validator("isbn")(_validate_isbn)


class BookUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    author: str | None = Field(default=None, min_length=1, max_length=150)
    category: str | None = Field(default=None, min_length=1, max_length=80)
    isbn: str | None = Field(default=None, max_length=20)
    description: str | None = None
    publisher: str | None = Field(default=None, max_length=150)
    published_year: int | None = Field(
        default=None, ge=_EARLIEST_PRINT_YEAR, le=_MAX_PUBLISHED_YEAR
    )
    language: str | None = Field(default=None, max_length=40)
    cover_image_url: str | None = Field(default=None, max_length=8_000_000)
    total_copies: int | None = Field(default=None, ge=0)
    shelf_location: str | None = Field(default=None, max_length=120)

    _validate_isbn = field_validator("isbn")(_validate_isbn)


class BookOut(BaseModel):
    id: str
    title: str
    author: str
    category: str
    isbn: str | None
    description: str | None
    publisher: str | None
    published_year: int | None
    language: str | None
    cover_image_url: str | None
    total_copies: int
    shelf_location: str | None
    available: bool
    average_rating: float | None
    review_count: int
    created_at: datetime
    updated_at: datetime

    @staticmethod
    def from_prisma(
        book, *, average_rating: float | None = None, review_count: int = 0
    ) -> "BookOut":
        return BookOut(
            id=book.id,
            title=book.title,
            author=book.author,
            category=book.category,
            isbn=book.isbn,
            description=book.description,
            publisher=book.publisher,
            published_year=book.publishedYear,
            language=book.language,
            cover_image_url=book.coverImageUrl,
            total_copies=book.totalCopies,
            shelf_location=book.shelfLocation,
            available=book.totalCopies > 0,
            average_rating=average_rating,
            review_count=review_count,
            created_at=book.createdAt,
            updated_at=book.updatedAt,
        )


class BookInsightsOut(BaseModel):
    summary: str
    key_concepts: list[str]
    themes: list[str]
    difficulty: str
    technical_difficulty: str
    vocabulary_complexity: str
    prerequisites: list[str]
    why_read: str


class BookListResponse(BaseModel):
    items: list[BookOut]
    total: int
    page: int
    page_size: int


class SuggestDescriptionRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    author: str = Field(min_length=1, max_length=150)
    category: str | None = Field(default=None, max_length=80)


class SuggestDescriptionResponse(BaseModel):
    description: str


class IdentifyCoverRequest(BaseModel):
    # data: URL, same "no object storage yet" convention as community post images —
    # generous max_length covers a ~5MB image's base64 blow-up.
    image: str = Field(min_length=1, max_length=8_000_000)


class IdentifiedBookFields(BaseModel):
    """Every field is a best-effort suggestion, never trusted further than a manually
    typed one — the caller (AddBookModal) only ever pre-fills the form with these and
    still requires staff to review/submit. title/author/isbn/publisher/published_year/
    language come from a real book-metadata lookup (Open Library) whenever the cover
    photo yields enough to search on; only description falls back to the vision model's
    own reading of the cover when Open Library has none."""

    title: str | None = None
    author: str | None = None
    isbn: str | None = None
    category: str | None = None
    description: str | None = None
    publisher: str | None = None
    published_year: int | None = None
    language: str | None = None
    verified: bool = False
