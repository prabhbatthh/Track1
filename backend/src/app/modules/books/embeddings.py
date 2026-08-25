"""Embedding-based book similarity for GET /books/{id}/related.

Replaces the old "same category or same author" fallback with real semantic similarity:
each book's title/author/category/description is embedded once (via core.llm.build_embeddings,
same LLM_MODE-driven provider switch as chat) and cached on Book.embedding. Ranking is then
a plain cosine similarity over cached vectors — no vector-index infrastructure needed for a
~400-book catalog, and no extra service beyond the Postgres the rest of the app already uses.

Embeddings are computed lazily (on first request that needs one) and invalidated by
books/service.py whenever an edit touches title/author/category/description, so this module
only ever computes what's actually missing.
"""

from __future__ import annotations

import logging
import math

from prisma.models import Book

from app.core.llm import build_embeddings

logger = logging.getLogger(__name__)


def embedding_text(book: Book) -> str:
    parts = [book.title, book.author, book.category]
    if book.description:
        parts.append(book.description)
    return "\n".join(parts)


async def ensure_embedding(book: Book) -> list[float]:
    """Returns book's cached embedding, computing and persisting it first if missing.

    Failures (provider unreachable, model not pulled, etc.) are logged and swallowed —
    the caller treats an empty vector as "no signal for this book" and falls back
    gracefully rather than 500ing the whole related-books request over one bad embed call.
    """
    if book.embedding:
        return book.embedding

    from app.modules.books import repository

    try:
        embeddings = build_embeddings()
        vector = await embeddings.aembed_query(embedding_text(book))
    except Exception:
        logger.exception("Failed to compute embedding for book %s", book.id)
        return []

    await repository.save_embedding(book.id, vector)
    return vector


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


def rank_by_similarity(target: list[float], candidates: list[Book], *, limit: int) -> list[Book]:
    """Highest-cosine-similarity-first, dropping any candidate with no usable embedding
    (an empty vector scores 0.0 via cosine_similarity's guard, but excluding it outright
    keeps a same-scored coincidence from ever outranking a real embedded match)."""
    scored = [
        (book, cosine_similarity(target, book.embedding)) for book in candidates if book.embedding
    ]
    scored.sort(key=lambda pair: pair[1], reverse=True)
    return [book for book, _score in scored[:limit]]
