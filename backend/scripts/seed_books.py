"""One-off import of assets/library_novels_400_updated.csv into the books table.

Run from backend/: `uv run python scripts/seed_books.py`
Safe to re-run — upserts on ISBN, so existing rows are updated in place rather than duplicated.
"""

import asyncio
import csv
import os
import random
import re
from pathlib import Path

from app.core.config import get_settings
from app.db.prisma import prisma

CSV_PATH = Path(__file__).resolve().parents[2] / "assets" / "library_novels_400_updated.csv"

# The CSV has no copy-count column; assign a plausible spread so some books are
# checked out (0 copies) and most have a handful available, matching real usage.
_COPY_WEIGHTS = [0, 1, 2, 3, 4, 5, 6]
_COPY_CHANCES = [10, 25, 25, 20, 10, 6, 4]


def _clean_isbn(raw: str) -> str:
    return re.sub(r"[- ]", "", raw).upper()


def _total_copies(book_id: str) -> int:
    rng = random.Random(f"book-copies-{book_id}")
    return rng.choices(_COPY_WEIGHTS, weights=_COPY_CHANCES, k=1)[0]


def _row_to_book_data(row: dict) -> dict:
    return {
        "title": row["title"].strip(),
        "author": row["author"].strip(),
        "category": "Fiction",
        "isbn": _clean_isbn(row["isbn"]),
        "description": row["summary"].strip(),
        "publishedYear": int(row["publication_year"]),
        "language": row["language"].strip(),
        "totalCopies": _total_copies(row["book_id"]),
    }


async def main() -> None:
    settings = get_settings()
    os.environ.setdefault("DATABASE_URL", settings.database_url)
    await prisma.connect()

    try:
        with CSV_PATH.open(encoding="utf-8") as f:
            rows = list(csv.DictReader(f))

        created = 0
        updated = 0
        for row in rows:
            data = _row_to_book_data(row)
            existing = await prisma.book.find_unique(where={"isbn": data["isbn"]})
            await prisma.book.upsert(
                where={"isbn": data["isbn"]},
                data={"create": data, "update": data},
            )
            if existing is None:
                created += 1
            else:
                updated += 1

        print(f"Seeded {len(rows)} books ({created} created, {updated} updated).")
    finally:
        await prisma.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
