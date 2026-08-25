"""AI Book Insights: one Ollama call producing summary + key concepts + themes +
difficulty + vocabulary complexity + prerequisites + why-read, all in one structured
JSON response (see core.llm.build_chat_llm / extract_json_object — the same factory and
parser already used by recommendations' describe-to-quiz and books' cover identification).

Cached on Book.aiInsights so a page load never re-calls the model once generated; cleared
by books/service.py::update_book whenever title/author/category/description change.
"""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from prisma.models import Book

from app.core.llm import build_chat_llm, extract_json_object

logger = logging.getLogger(__name__)

_DIFFICULTY_VALUES = {"Beginner", "Intermediate", "Advanced", "Unknown"}
_VOCAB_VALUES = {"Low", "Medium", "High", "Unknown"}
_DESCRIPTION_MAX_CHARS = 500
_MAX_LIST_ITEMS = 5

_SYSTEM_PROMPT = """You are a library cataloging assistant. Given a book's title, author,
category, and description, output ONLY a JSON object with exactly these keys:
- summary: 2-3 sentence plain-language summary
- key_concepts: 3-5 short phrases (key ideas/topics the book covers)
- themes: 2-3 short phrases (its main themes)
- difficulty: one of "Beginner", "Intermediate", "Advanced", "Unknown"
- technical_difficulty: one of "Beginner", "Intermediate", "Advanced", "Unknown" — use
  "Unknown" for fiction or books with no technical content
- vocabulary_complexity: one of "Low", "Medium", "High", "Unknown"
- prerequisites: 0-3 short phrases of prior knowledge helpful before reading (empty list
  if none)
- why_read: 1-2 sentences on why someone should read it

Base every field only on the text given below. If you cannot judge a field from that
text, use "Unknown" (or an empty list for a list field) rather than guessing. Output
nothing but the JSON object: no explanation, no markdown formatting, no reasoning."""


def _clean_str_list(value: Any, *, max_items: int = _MAX_LIST_ITEMS) -> list[str]:
    if not isinstance(value, list):
        return []
    cleaned = [str(item).strip() for item in value if isinstance(item, str | int | float)]
    return [item for item in cleaned if item][:max_items]


def _clean_enum(value: Any, allowed: set[str]) -> str:
    return value if isinstance(value, str) and value in allowed else "Unknown"


def _clean_text(value: Any) -> str:
    return value.strip() if isinstance(value, str) and value.strip() else "Unknown"


def _normalize(parsed: dict) -> dict:
    return {
        "summary": _clean_text(parsed.get("summary")),
        "key_concepts": _clean_str_list(parsed.get("key_concepts")),
        "themes": _clean_str_list(parsed.get("themes"), max_items=3),
        "difficulty": _clean_enum(parsed.get("difficulty"), _DIFFICULTY_VALUES),
        "technical_difficulty": _clean_enum(parsed.get("technical_difficulty"), _DIFFICULTY_VALUES),
        "vocabulary_complexity": _clean_enum(parsed.get("vocabulary_complexity"), _VOCAB_VALUES),
        "prerequisites": _clean_str_list(parsed.get("prerequisites"), max_items=3),
        "why_read": _clean_text(parsed.get("why_read")),
    }


def _book_prompt_text(book: Book) -> str:
    description = (book.description or "")[:_DESCRIPTION_MAX_CHARS]
    return (
        f"Title: {book.title}\n"
        f"Author: {book.author}\n"
        f"Category: {book.category}\n"
        f"Description: {description or '(none provided)'}"
    )


async def ensure_insights(book: Book) -> dict | None:
    """Returns the book's cached AI insights, generating them first if missing.

    Returns None (never a fabricated result) if the call fails or the model's reply
    isn't parseable JSON — the caller renders an "AI unavailable" state rather than
    treating a missing result as an error, and nothing gets cached so a later retry
    (once Ollama's back, or the model is pulled) can still succeed.
    """
    if book.aiInsights:
        return book.aiInsights

    try:
        llm = build_chat_llm()
        result = await llm.ainvoke(
            [SystemMessage(content=_SYSTEM_PROMPT), HumanMessage(content=_book_prompt_text(book))]
        )
        parsed = extract_json_object(str(result.content))
    except Exception:
        logger.exception("Failed to compute AI insights for book %s", book.id)
        return None

    if parsed is None:
        logger.warning("AI insights response for book %s was not valid JSON", book.id)
        return None

    data = _normalize(parsed)

    from app.modules.books import repository

    await repository.save_ai_insights(book.id, data)
    return data
