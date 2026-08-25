from prisma.models import Book, Review

from app.db.prisma import prisma

# publishedYear boundaries for the "era" question. Fixed buckets rather than
# DB-derived quantiles — stable across catalog changes, and matches how a member
# would actually describe "old" vs "new" rather than an arbitrary statistical split.
ERA_BOUNDS: dict[str, tuple[int | None, int | None]] = {
    "pre_1950": (None, 1949),
    "1950_1989": (1950, 1989),
    "1990_2009": (1990, 2009),
    "2010_plus": (2010, None),
}


async def count_books_by_author(min_books: int, limit: int) -> list[tuple[str, int]]:
    """Authors with at least `min_books` active books, most-represented first."""
    rows = await prisma.query_raw(
        """SELECT author, COUNT(*)::int AS cnt
           FROM books
           WHERE deleted_at IS NULL
           GROUP BY author
           HAVING COUNT(*) >= $1
           ORDER BY cnt DESC, author ASC
           LIMIT $2""",
        min_books,
        limit,
    )
    return [(row["author"], row["cnt"]) for row in rows]


async def count_books_by_era() -> dict[str, int]:
    """Active book count per era bucket. 'unknown' (missing publishedYear) is included
    so callers can see it, but it is never offered as a selectable quiz option."""
    rows = await prisma.query_raw(
        """SELECT
             CASE
               WHEN published_year IS NULL THEN 'unknown'
               WHEN published_year < 1950 THEN 'pre_1950'
               WHEN published_year < 1990 THEN '1950_1989'
               WHEN published_year < 2010 THEN '1990_2009'
               ELSE '2010_plus'
             END AS era,
             COUNT(*)::int AS cnt
           FROM books
           WHERE deleted_at IS NULL
           GROUP BY era"""
    )
    return {row["era"]: row["cnt"] for row in rows}


async def count_loaned_books() -> tuple[int, int]:
    """(books borrowed at least once, books never borrowed), among active books."""
    rows = await prisma.query_raw(
        """SELECT
             COUNT(*) FILTER (WHERE l.loan_count > 0)::int AS borrowed,
             COUNT(*) FILTER (WHERE l.loan_count IS NULL OR l.loan_count = 0)::int AS never_borrowed
           FROM books b
           LEFT JOIN (
             SELECT book_id, COUNT(*) AS loan_count FROM loans GROUP BY book_id
           ) l ON l.book_id = b.id
           WHERE b.deleted_at IS NULL"""
    )
    row = rows[0]
    return row["borrowed"], row["never_borrowed"]


async def count_active_books() -> int:
    return await prisma.book.count(where={"deletedAt": None})


async def count_described_books() -> int:
    return await prisma.book.count(
        where={
            "deletedAt": None,
            "AND": [{"description": {"not": None}}, {"description": {"not": ""}}],
        }
    )


async def find_candidates(
    *,
    author: str | list[str] | None = None,
    era: str | list[str] | None = None,
    exclude_ids: set[str] | None = None,
) -> list[Book]:
    """With neither `author` nor `era`, this is the whole-catalog fallback stage —
    mirrors books/repository.py::find_all_matching, the same "everything active" fetch
    the existing "recommended" sort already relies on.
    """
    where: dict = {"deletedAt": None}
    if author:
        if isinstance(author, list):
            where["author"] = {"in": author} if len(author) > 1 else (author[0] if author else None)
        else:
            where["author"] = author
    if era:
        eras = [era] if isinstance(era, str) else era
        valid_eras = [e for e in eras if e in ERA_BOUNDS]
        if len(valid_eras) == 1:
            year_min, year_max = ERA_BOUNDS[valid_eras[0]]
            year_filter: dict = {}
            if year_min is not None:
                year_filter["gte"] = year_min
            if year_max is not None:
                year_filter["lte"] = year_max
            where["publishedYear"] = year_filter
        elif len(valid_eras) > 1:
            or_conditions = []
            for e in valid_eras:
                ymin, ymax = ERA_BOUNDS[e]
                yf: dict = {}
                if ymin is not None:
                    yf["gte"] = ymin
                if ymax is not None:
                    yf["lte"] = ymax
                or_conditions.append({"publishedYear": yf})
            where["OR"] = or_conditions
    if exclude_ids:
        where["id"] = {"notIn": list(exclude_ids)}
    return await prisma.book.find_many(where=where)


async def list_reviews_for_books(book_ids: list[str]) -> list[Review]:
    if not book_ids:
        return []
    return await prisma.review.find_many(where={"bookId": {"in": book_ids}})


async def count_loans_for_books(book_ids: list[str]) -> dict[str, int]:
    if not book_ids:
        return {}
    rows = await prisma.query_raw(
        """SELECT book_id, COUNT(*)::int AS cnt
           FROM loans
           WHERE book_id = ANY($1::uuid[])
           GROUP BY book_id""",
        book_ids,
    )
    return {row["book_id"]: row["cnt"] for row in rows}
