"""Computes and caches the similarity embedding for every book that doesn't have one yet.

get_related_books() (books/service.py) already computes embeddings lazily on first
request, so this script isn't required for correctness — it just means a fresh clone's
first page of "You may also like" results doesn't wait on ~400 sequential embed calls,
and demo/seeded data looks right immediately. Safe to re-run: only books with an empty
embedding are touched.

Run from backend/: `uv run python scripts/backfill_book_embeddings.py`
"""

import asyncio
import os

from app.core.config import get_settings
from app.db.prisma import prisma
from app.modules.books import embeddings

# A real provider outage (Ollama not running, no OpenAI key, etc.) fails fast and
# consistently — stop after a short run of consecutive failures instead of burning
# through the whole catalog making calls that will not succeed.
MAX_CONSECUTIVE_FAILURES = 5


async def main() -> None:
    settings = get_settings()
    os.environ.setdefault("DATABASE_URL", settings.database_url)
    await prisma.connect()

    try:
        books = await prisma.book.find_many(where={"deletedAt": None})
        missing = [book for book in books if not book.embedding]
        if not missing:
            print(f"All {len(books)} books already have a cached embedding.")
            return

        computed = 0
        consecutive_failures = 0
        for book in missing:
            vector = await embeddings.ensure_embedding(book)
            if vector:
                computed += 1
                consecutive_failures = 0
            else:
                consecutive_failures += 1
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                    print(
                        f"Stopping after {consecutive_failures} consecutive failures — "
                        f"computed {computed}/{len(missing)} before the embedding "
                        "provider stopped responding. Check LLM_MODE and its "
                        "credentials/model."
                    )
                    return

        print(f"Computed embeddings for {computed}/{len(missing)} books missing one.")
    finally:
        await prisma.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
