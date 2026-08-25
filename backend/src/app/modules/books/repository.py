from datetime import UTC, datetime

from prisma import Json
from prisma.models import Book, Loan, Review

from app.db.pagination import paginate
from app.db.prisma import prisma


def _list_where(search: str | None, category: str | None) -> dict:
    where: dict = {"deletedAt": None}
    if search:
        where["OR"] = [
            {"title": {"contains": search, "mode": "insensitive"}},
            {"author": {"contains": search, "mode": "insensitive"}},
            {"description": {"contains": search, "mode": "insensitive"}},
        ]
    if category and category.lower() != "all":
        where["category"] = category
    return where


async def find_by_id(book_id: str) -> Book | None:
    book = await prisma.book.find_unique(where={"id": book_id})
    if book is None or book.deletedAt is not None:
        return None
    return book


async def list_by_ids(book_ids: list[str]) -> list[Book]:
    if not book_ids:
        return []
    return await prisma.book.find_many(where={"id": {"in": book_ids}, "deletedAt": None})


async def list_ratings_for_books(book_ids: list[str]) -> list[Review]:
    if not book_ids:
        return []
    return await prisma.review.find_many(where={"bookId": {"in": book_ids}})


async def save_review_digest(book_id: str, *, digest: str, review_count: int) -> None:
    await prisma.book.update(
        where={"id": book_id},
        data={"reviewDigest": digest, "reviewDigestReviewCount": review_count},
    )


async def save_embedding(book_id: str, vector: list[float]) -> None:
    await prisma.book.update(where={"id": book_id}, data={"embedding": vector})


async def save_ai_insights(book_id: str, data: dict) -> None:
    await prisma.book.update(where={"id": book_id}, data={"aiInsights": Json(data)})


async def list_active_excluding(book_id: str) -> list[Book]:
    """Every non-deleted book but the one being related against — the candidate pool
    for embedding-similarity ranking. Small enough catalog (~400 books) that fetching
    it whole and ranking in Python beats standing up vector-index infrastructure."""
    return await prisma.book.find_many(where={"deletedAt": None, "id": {"not": book_id}})


async def list_books(
    *, search: str | None, category: str | None, page: int, page_size: int
) -> tuple[list[Book], int]:
    return await paginate(
        prisma.book,
        where=_list_where(search, category),
        order={"createdAt": "desc"},
        skip=(page - 1) * page_size,
        take=page_size,
    )


async def list_books_by_rating(
    *, search: str | None, category: str | None, skip: int, take: int
) -> tuple[list[Book], int]:
    """Sorts books by their average rating (highest first) entirely in SQL.

    Rating order used to mean loading the entire matching catalogue plus every review
    for it, sorting in Python and slicing — on a list endpoint the chat tool also hits.
    Unreviewed books sort last (NULLS LAST) rather than as if they scored zero.
    """
    like = f"%{search}%" if search else None
    wants_category = bool(category and category.lower() != "all")

    conditions = ["b.deleted_at IS NULL"]
    params: list = []
    if like is not None:
        params.append(like)
        i = len(params)
        conditions.append(
            f"(b.title ILIKE ${i} OR b.author ILIKE ${i} OR b.description ILIKE ${i})"
        )
    if wants_category:
        params.append(category)
        conditions.append(f"b.category = ${len(params)}")
    where_sql = " AND ".join(conditions)

    total_rows = await prisma.query_raw(
        f"SELECT COUNT(*)::bigint AS total FROM books b WHERE {where_sql}", *params
    )
    total = int(total_rows[0]["total"]) if total_rows else 0

    params.extend([take, skip])
    rows = await prisma.query_raw(
        f"""SELECT b.id::text AS id
            FROM books b
            LEFT JOIN reviews rv ON rv.book_id = b.id
            WHERE {where_sql}
            GROUP BY b.id
            ORDER BY AVG(rv.rating) DESC NULLS LAST, b.created_at DESC
            LIMIT ${len(params) - 1} OFFSET ${len(params)}""",
        *params,
    )
    ids = [row["id"] for row in rows]
    if not ids:
        return [], total
    books = await prisma.book.find_many(where={"id": {"in": ids}})
    order = {book_id: index for index, book_id in enumerate(ids)}
    return sorted(books, key=lambda book: order[book.id]), total


async def find_all_matching(search: str | None, category: str | None) -> list[Book]:
    return await prisma.book.find_many(where=_list_where(search, category))


async def list_loans_for_member(member_id: str) -> list[Loan]:
    return await prisma.loan.find_many(where={"memberId": member_id}, include={"book": True})


async def find_co_borrowed(book_id: str, *, limit: int) -> list[Book]:
    borrower_loans = await prisma.loan.find_many(where={"bookId": book_id})
    member_ids = {loan.memberId for loan in borrower_loans}
    if not member_ids:
        return []

    other_loans = await prisma.loan.find_many(
        where={"memberId": {"in": list(member_ids)}, "bookId": {"not": book_id}},
        include={"book": True},
    )

    counts: dict[str, int] = {}
    books: dict[str, Book] = {}
    for loan in other_loans:
        if loan.book.deletedAt is not None:
            continue
        counts[loan.bookId] = counts.get(loan.bookId, 0) + 1
        books[loan.bookId] = loan.book

    ranked = sorted(books.values(), key=lambda b: counts[b.id], reverse=True)
    return ranked[:limit]


async def find_by_category_or_author(
    *, category: str, author: str, exclude_ids: list[str], limit: int
) -> list[Book]:
    return await prisma.book.find_many(
        where={
            "id": {"notIn": exclude_ids},
            "deletedAt": None,
            "OR": [{"category": category}, {"author": author}],
        },
        order={"createdAt": "desc"},
        take=limit,
    )


async def create_book(data: dict) -> Book:
    return await prisma.book.create(data=data)


async def update_book(book_id: str, data: dict) -> Book:
    return await prisma.book.update(where={"id": book_id}, data=data)


async def update_book_with_inventory_guard(
    book_id: str, data: dict
) -> tuple[Book | None, str | None]:
    """Keep copy-count edits serialized with loan issuance for this book."""
    async with prisma.tx() as tx:
        await tx.execute_raw("SELECT pg_advisory_xact_lock(hashtext($1))", book_id)
        book = await tx.book.find_unique(where={"id": book_id})
        if book is None or book.deletedAt is not None:
            return None, "not_found"
        requested_total = data.get("totalCopies")
        if requested_total is not None:
            active_loans = await tx.loan.count(where={"bookId": book_id, "returnedAt": None})
            if requested_total < active_loans:
                return book, "active_loans"
        updated = await tx.book.update(where={"id": book_id}, data=data)
        return updated, None


async def soft_delete_book(book_id: str) -> Book:
    return await prisma.book.update(where={"id": book_id}, data={"deletedAt": datetime.now(UTC)})
