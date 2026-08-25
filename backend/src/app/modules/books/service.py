import logging
from collections import Counter, defaultdict
from typing import Any

import httpx
from fastapi import HTTPException, status
from langchain_core.messages import HumanMessage, SystemMessage
from prisma import Json
from prisma.errors import UniqueViolationError
from prisma.models import Book

from app.core.llm import build_chat_llm, extract_json_object
from app.modules.books import embeddings, insights, repository
from app.modules.books.schemas import (
    BookCreate,
    BookInsightsOut,
    BookListResponse,
    BookOut,
    BookSort,
    BookUpdate,
    IdentifiedBookFields,
    SuggestDescriptionRequest,
)

logger = logging.getLogger(__name__)

# Category match counts less than an author match — a reader who's borrowed several
# Agatha Christie mysteries is more likely chasing "more Christie" than "more mystery".
_RECOMMENDATION_CATEGORY_WEIGHT = 2
_RECOMMENDATION_AUTHOR_WEIGHT = 3


async def _ratings_by_book(book_ids: list[str]) -> dict[str, tuple[float, int]]:
    reviews = await repository.list_ratings_for_books(book_ids)
    ratings: dict[str, list[int]] = defaultdict(list)
    for review in reviews:
        ratings[review.bookId].append(review.rating)
    return {
        book_id: (round(sum(values) / len(values), 1), len(values))
        for book_id, values in ratings.items()
    }


def _book_out(book: Book, ratings: dict[str, tuple[float, int]]) -> BookOut:
    average_rating, review_count = ratings.get(book.id, (None, 0))
    return BookOut.from_prisma(book, average_rating=average_rating, review_count=review_count)


async def _recommend(member_id: str, candidates: list[Book]) -> tuple[list[Book], dict[str, int]]:
    """Ranks candidates the member hasn't already borrowed by how closely they match
    the categories/authors of books the member *has* borrowed. Returns the filtered
    candidate list (already-borrowed books dropped) alongside each book's score."""
    loans = await repository.list_loans_for_member(member_id)
    borrowed_ids = {loan.bookId for loan in loans}
    categories = Counter(loan.book.category for loan in loans)
    authors = Counter(loan.book.author for loan in loans)

    unread = [book for book in candidates if book.id not in borrowed_ids]
    scores = {
        book.id: (
            categories.get(book.category, 0) * _RECOMMENDATION_CATEGORY_WEIGHT
            + authors.get(book.author, 0) * _RECOMMENDATION_AUTHOR_WEIGHT
        )
        for book in unread
    }
    return unread, scores


async def list_books(
    *,
    search: str | None,
    category: str | None,
    page: int,
    page_size: int,
    sort: BookSort = "newest",
    member_id: str | None = None,
) -> BookListResponse:
    if sort == "newest":
        items, total = await repository.list_books(
            search=search, category=category, page=page, page_size=page_size
        )
        ratings = await _ratings_by_book([item.id for item in items])
        return BookListResponse(
            items=[_book_out(item, ratings) for item in items],
            total=total,
            page=page,
            page_size=page_size,
        )

    if sort == "rating":
        # Ranked and paginated in SQL — only the page's reviews are then loaded for
        # display, instead of the whole catalogue and every review it has.
        items, total = await repository.list_books_by_rating(
            search=search, category=category, skip=(page - 1) * page_size, take=page_size
        )
        ratings = await _ratings_by_book([item.id for item in items])
        return BookListResponse(
            items=[_book_out(item, ratings) for item in items],
            total=total,
            page=page,
            page_size=page_size,
        )

    # "recommended" scores every candidate against this member's borrowing history,
    # so it genuinely needs the whole matching set before it can pick a page.
    all_books = await repository.find_all_matching(search, category)
    ratings = await _ratings_by_book([book.id for book in all_books])

    if sort == "recommended":
        scores: dict[str, int] = {}
        if member_id:
            all_books, scores = await _recommend(member_id, all_books)
        all_books.sort(
            key=lambda b: (scores.get(b.id, 0), ratings.get(b.id, (0.0, 0))[0]), reverse=True
        )

    total = len(all_books)
    start = (page - 1) * page_size
    page_items = all_books[start : start + page_size]
    return BookListResponse(
        items=[_book_out(book, ratings) for book in page_items],
        total=total,
        page=page,
        page_size=page_size,
    )


async def get_book(book_id: str) -> BookOut:
    book = await repository.find_by_id(book_id)
    if book is None or book.deletedAt is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    ratings = await _ratings_by_book([book_id])
    return _book_out(book, ratings)


RELATED_BOOKS_LIMIT = 6


async def get_related_books(book_id: str) -> list[BookOut]:
    """Ranked by embedding cosine similarity (see books/embeddings.py) — semantic
    similarity across title/author/category/description, not a same-category or
    same-author lookup. Falls back to the old co-borrow + category/author signals only
    to fill out the list when too few catalog books have a usable embedding yet (e.g.
    LLM_MODE is misconfigured, or the backfill script hasn't run) — never invents a
    result, just degrades to the previous behavior for whatever slots embeddings can't
    fill.
    """
    book = await repository.find_by_id(book_id)
    if book is None or book.deletedAt is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")

    target_vector = await embeddings.ensure_embedding(book)

    related: list[Book] = []
    if target_vector:
        candidates = await repository.list_active_excluding(book_id)
        related = embeddings.rank_by_similarity(
            target_vector, candidates, limit=RELATED_BOOKS_LIMIT
        )

    if len(related) < RELATED_BOOKS_LIMIT:
        exclude_ids = [book_id] + [b.id for b in related]
        fallback = await repository.find_co_borrowed(book_id, limit=RELATED_BOOKS_LIMIT)
        fallback = [b for b in fallback if b.id not in exclude_ids]
        related += fallback

    if len(related) < RELATED_BOOKS_LIMIT:
        exclude_ids = [book_id] + [b.id for b in related]
        related += await repository.find_by_category_or_author(
            category=book.category,
            author=book.author,
            exclude_ids=exclude_ids,
            limit=RELATED_BOOKS_LIMIT - len(related),
        )

    ratings = await _ratings_by_book([b.id for b in related])
    return [_book_out(b, ratings) for b in related]


async def get_book_insights(book_id: str) -> BookInsightsOut | None:
    """None means "not available right now" (LLM unreachable, bad output) — distinct
    from 404, which is raised for a missing book before this is ever called. The router
    returns 200 with a null body either way; the frontend renders an "AI unavailable"
    state rather than an error."""
    book = await repository.find_by_id(book_id)
    if book is None or book.deletedAt is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")

    data = await insights.ensure_insights(book)
    return BookInsightsOut(**data) if data else None


_DESCRIPTION_SYSTEM_PROMPT = """You write short library-catalog descriptions.

Given a book's title, author, and category, write a 2-3 sentence description a member
would see on the book's page. Rules:
- No spoilers, no invented plot specifics (character names, twists, endings) unless
  you are confident they are accurate for this exact book.
- If you don't recognize this specific title, write a general, honest description
  based on the title, author, and category alone — do not invent a plot.
- Plain prose only: no headings, no bullet points, no quotation marks around the
  whole thing.
- Output only the description text, nothing else."""


async def suggest_description(payload: SuggestDescriptionRequest) -> str:
    """Drafts a book description for staff to edit or discard — never saved directly.

    Grounded on purpose: the prompt explicitly tells the model to stay generic rather
    than invent plot details for a book it doesn't actually recognize, since a small
    local model's knowledge of less-famous titles is thin. Staff always see this in an
    editable field before anything is written to the catalog (see create_book/update_book).
    """
    human = f"Title: {payload.title}\nAuthor: {payload.author}"
    if payload.category:
        human += f"\nCategory: {payload.category}"

    try:
        llm = build_chat_llm()
        result = await llm.ainvoke(
            [SystemMessage(content=_DESCRIPTION_SYSTEM_PROMPT), HumanMessage(content=human)]
        )
    except Exception as exc:
        logger.exception("suggest_description failed for %r by %r", payload.title, payload.author)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The description assistant is unavailable right now. Please try again shortly.",
        ) from exc

    description = str(result.content).strip()
    if not description:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The description assistant is unavailable right now. Please try again shortly.",
        )
    return description


_COVER_VISION_PROMPT = """Look at this photo of a book's front cover. Output ONLY a JSON
object with these exact keys: title, author, isbn. Read them directly off the cover —
title and author are almost always printed on the front; isbn is only there if a
barcode/number is visible. Use null for anything not actually visible in the image.
Never guess a title, author, or ISBN you can't actually read there. Output nothing but
the JSON object — no explanation, no markdown formatting."""

# Mirrors the fixed category set the Add Book form offers (see ManagerBooksPage.tsx's
# CATEGORIES) — an Open Library subject list that matches none of these leaves category
# unset rather than guessing wrong, since staff pick from that same fixed list anyway.
#
# Order matters: "science fiction" (an extremely common Open Library subject) contains
# "science" as a substring, so "fiction" must be checked first or every science-fiction
# novel would get miscategorized as Science. Same reasoning puts "non-fiction" ahead of
# the plain "fiction" check.
_CATEGORY_KEYWORDS: list[tuple[str, str]] = [
    ("non-fiction", "Non-Fiction"),
    ("nonfiction", "Non-Fiction"),
    ("fiction", "Fiction"),
    ("self-help", "Self-Help"),
    ("self help", "Self-Help"),
    ("biography", "Biography"),
    ("autobiography", "Biography"),
    ("technology", "Technology"),
    ("computer", "Technology"),
    ("science", "Science"),
]

_LANGUAGE_CODES = {
    "eng": "English",
    "hin": "Hindi",
    "pan": "Punjabi",
    "fre": "French",
    "fra": "French",
    "ger": "German",
    "deu": "German",
    "spa": "Spanish",
    "ita": "Italian",
    "jpn": "Japanese",
    "chi": "Chinese",
    "zho": "Chinese",
    "ara": "Arabic",
    "rus": "Russian",
}


def _map_category(subjects: list[str]) -> str | None:
    lowered = [subject.lower() for subject in subjects]
    for keyword, category in _CATEGORY_KEYWORDS:
        if any(keyword in subject for subject in lowered):
            return category
    return None


async def _vision_identify(image: str) -> dict[str, Any]:
    """Reads whatever's actually printed on the cover — nothing more. Returns {} on any
    failure (unreachable backend, a text-only model, unparseable reply) rather than
    raising: a photo that doesn't identify is a normal outcome here, not an error —
    manual entry stays available either way.
    """
    try:
        llm = build_chat_llm()
        result = await llm.ainvoke(
            [
                HumanMessage(
                    content=[
                        {"type": "text", "text": _COVER_VISION_PROMPT},
                        {"type": "image_url", "image_url": {"url": image}},
                    ]
                )
            ]
        )
    except Exception:
        logger.exception("cover vision identification failed")
        return {}
    return extract_json_object(str(result.content)) or {}


async def _lookup_metadata(
    *, isbn: str | None, title: str | None, author: str | None
) -> dict[str, Any]:
    """Open Library is the source of truth for anything that gets saved beyond "what's
    visible in the photo" — this is what stands between a vision guess and the catalog,
    per the "don't hallucinate ISBN/metadata" requirement. Best-effort: any network or
    parsing failure just yields no match, leaving the vision guess (or a blank field for
    staff to fill by hand) as the only fallback.
    """
    query: dict[str, str] = {}
    if isbn:
        query["isbn"] = isbn
    if title:
        query["title"] = title
    if author:
        query["author"] = author
    if not query:
        return {}

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(
                "https://openlibrary.org/search.json",
                params={
                    **query,
                    "limit": 1,
                    "fields": "title,author_name,first_publish_year,isbn,publisher,"
                    "language,subject,key",
                },
            )
            response.raise_for_status()
            docs = response.json().get("docs") or []
            if not docs:
                return {}
            doc = docs[0]

            description = None
            work_key = doc.get("key")
            if work_key:
                try:
                    work_response = await client.get(f"https://openlibrary.org{work_key}.json")
                    work_response.raise_for_status()
                    raw_description = work_response.json().get("description")
                    description = (
                        raw_description.get("value")
                        if isinstance(raw_description, dict)
                        else raw_description
                        if isinstance(raw_description, str)
                        else None
                    )
                except httpx.HTTPError:
                    pass  # Description is a bonus, not worth failing the whole lookup over.
    except (httpx.HTTPError, ValueError):
        logger.exception("Open Library lookup failed for isbn=%r title=%r", isbn, title)
        return {}

    doc_isbn = (doc.get("isbn") or [None])[0]
    return {
        "title": doc.get("title"),
        "author": (doc.get("author_name") or [None])[0],
        "isbn": doc_isbn.replace("-", "") if doc_isbn else None,
        "publisher": (doc.get("publisher") or [None])[0],
        "published_year": doc.get("first_publish_year"),
        "language": _LANGUAGE_CODES.get((doc.get("language") or [None])[0] or ""),
        "category": _map_category(doc.get("subject") or []),
        "description": description,
    }


async def identify_cover(image: str) -> IdentifiedBookFields:
    """The full "upload a cover, get a pre-filled form" pipeline: a vision model reads
    whatever it can off the photo, then a real book-metadata API verifies/fills in the
    rest. Nothing here is ever written to the catalog directly — the caller only uses
    this to pre-fill AddBookModal's fields, which staff still review and submit through
    the normal create_book path above.
    """
    guess = await _vision_identify(image)
    verified = await _lookup_metadata(
        isbn=guess.get("isbn"), title=guess.get("title"), author=guess.get("author")
    )

    def pick(key: str) -> Any:
        return verified.get(key) or guess.get(key)

    return IdentifiedBookFields(
        title=pick("title"),
        author=pick("author"),
        isbn=pick("isbn"),
        category=verified.get("category"),
        description=verified.get("description"),
        publisher=verified.get("publisher"),
        published_year=verified.get("published_year"),
        language=verified.get("language"),
        verified=bool(verified),
    )


async def create_book(payload: BookCreate) -> BookOut:
    try:
        book = await repository.create_book(
            {
                "title": payload.title,
                "author": payload.author,
                "category": payload.category,
                "isbn": payload.isbn,
                "description": payload.description,
                "publisher": payload.publisher,
                "publishedYear": payload.published_year,
                "language": payload.language,
                "coverImageUrl": payload.cover_image_url,
                "totalCopies": payload.total_copies,
                "shelfLocation": payload.shelf_location,
            }
        )
    except UniqueViolationError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A book with this ISBN already exists",
        ) from exc

    return BookOut.from_prisma(book)


async def update_book(book_id: str, payload: BookUpdate) -> BookOut:
    existing = await repository.find_by_id(book_id)
    if existing is None or existing.deletedAt is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")

    fields_set = payload.model_fields_set
    data: dict = {}
    if payload.title is not None:
        data["title"] = payload.title
    if payload.author is not None:
        data["author"] = payload.author
    if payload.category is not None:
        data["category"] = payload.category
    if "isbn" in fields_set:
        data["isbn"] = payload.isbn
    if "description" in fields_set:
        data["description"] = payload.description
    if "publisher" in fields_set:
        data["publisher"] = payload.publisher
    if "published_year" in fields_set:
        data["publishedYear"] = payload.published_year
    if "language" in fields_set:
        data["language"] = payload.language
    if "cover_image_url" in fields_set:
        data["coverImageUrl"] = payload.cover_image_url
    if payload.total_copies is not None:
        data["totalCopies"] = payload.total_copies
    if "shelf_location" in fields_set:
        data["shelfLocation"] = payload.shelf_location

    if not data:
        return BookOut.from_prisma(existing)

    # Any edit to the fields the cached embedding was built from (see
    # books/embeddings.py::embedding_text) invalidates it — cleared here rather than
    # recomputed inline so an LLM call never blocks a catalog edit; the next read of
    # GET /books/{id}/related lazily recomputes it instead.
    if {"title", "author", "category", "description"} & data.keys():
        data["embedding"] = []
        data["aiInsights"] = Json(None)

    try:
        updated, error = await repository.update_book_with_inventory_guard(book_id, data)
        if error == "not_found":
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Book not found")
        if error == "active_loans":
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Total copies cannot be lower than the number of active loans",
            )
    except UniqueViolationError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A book with this ISBN already exists",
        ) from exc

    return BookOut.from_prisma(updated)


async def delete_book(book_id: str) -> None:
    existing = await repository.find_by_id(book_id)
    if existing is None or existing.deletedAt is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")

    await repository.soft_delete_book(book_id)
