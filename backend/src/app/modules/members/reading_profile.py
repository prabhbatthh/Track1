"""Personal AI Reading Profile: aggregates a member's loans/reviews/reservations into
compact category/author/rating counts (never raw history — see _activity_signal), sends
just that summary to Ollama for a short structured profile, and caches it on the User
row. Regenerated only when the member's total activity count has grown since the cached
version was made — mirrors Book.reviewDigest/reviewDigestReviewCount's staleness-by-count
pattern, so a profile page visit is a pure cache hit unless something new happened.

Also reuses Book.aiInsights (books/insights.py) for a difficulty signal instead of a
second AI call — see the "recently borrowed" difficulty tally below.
"""

from __future__ import annotations

import logging
from collections import Counter
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from prisma.models import User

from app.core.llm import build_chat_llm, extract_json_object
from app.modules.books import repository as books_repository
from app.modules.reservations import repository as reservations_repository
from app.modules.reviews import repository as reviews_repository

logger = logging.getLogger(__name__)

_DIFFICULTY_VALUES = {"Beginner", "Intermediate", "Advanced", "Unknown"}
_PREFERENCE_VALUES = {"Practical", "Theoretical", "Mixed", "Unknown"}
_TOP_INTERESTS = 3

_SYSTEM_PROMPT = """You are a library assistant that writes a short reading profile for
a member, given a compact summary of their borrowing/review/reservation activity (never
their full history — just aggregate counts). Output ONLY a JSON object with exactly
these keys:
- interests: up to 3 short category/topic names, most-engaged first
- difficulty: one of "Beginner", "Intermediate", "Advanced", "Unknown"
- preference: one of "Practical", "Theoretical", "Mixed", "Unknown"
- insight: one short sentence describing their reading habits

Base every field only on the data given below. If the data is too sparse to judge a
field, use "Unknown" rather than guessing. Output nothing but the JSON object: no
explanation, no markdown formatting, no reasoning."""


def _clean_interests(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    cleaned = [str(item).strip() for item in value if isinstance(item, str | int | float)]
    return [item for item in cleaned if item][:_TOP_INTERESTS]


def _clean_enum(value: Any, allowed: set[str]) -> str:
    return value if isinstance(value, str) and value in allowed else "Unknown"


def _normalize(parsed: dict) -> dict:
    insight = parsed.get("insight")
    return {
        "interests": _clean_interests(parsed.get("interests")),
        "difficulty": _clean_enum(parsed.get("difficulty"), _DIFFICULTY_VALUES),
        "preference": _clean_enum(parsed.get("preference"), _PREFERENCE_VALUES),
        "insight": insight.strip() if isinstance(insight, str) and insight.strip() else "Unknown",
    }


async def _activity_signal(member_id: str) -> tuple[int, str]:
    """Returns (total_activity_count, compact_prompt_text). total_activity_count is what
    gets cached alongside the profile to detect when regeneration is actually needed —
    the prompt text itself is aggregate counts only, never a per-item history dump."""
    loans = await books_repository.list_loans_for_member(member_id)
    reviews = await reviews_repository.list_for_member(member_id)
    reservations = await reservations_repository.list_for_member(member_id)

    category_counts: Counter[str] = Counter()
    author_counts: Counter[str] = Counter()
    difficulty_counts: Counter[str] = Counter()

    for loan in loans:
        category_counts[loan.book.category] += 1
        author_counts[loan.book.author] += 1
        book_insights = loan.book.aiInsights
        if isinstance(book_insights, dict):
            difficulty = book_insights.get("difficulty")
            if difficulty and difficulty != "Unknown":
                difficulty_counts[difficulty] += 1

    for review in reviews:
        category_counts[review.book.category] += 1

    for reservation in reservations:
        category_counts[reservation.book.category] += 1

    ratings = [review.rating for review in reviews]
    avg_rating = round(sum(ratings) / len(ratings), 1) if ratings else None

    top_categories = ", ".join(f"{c} ({n})" for c, n in category_counts.most_common(5)) or "none"
    top_authors = ", ".join(f"{a} ({n})" for a, n in author_counts.most_common(3)) or "none"
    difficulty_line = (
        ", ".join(f"{d} ({n})" for d, n in difficulty_counts.most_common()) or "unknown"
    )

    text = (
        f"Books borrowed: {len(loans)}\n"
        f"Reviews written: {len(reviews)} "
        f"(average rating given: {avg_rating if avg_rating is not None else 'n/a'})\n"
        f"Reservations made: {len(reservations)}\n"
        f"Top categories engaged with: {top_categories}\n"
        f"Top authors borrowed: {top_authors}\n"
        f"Difficulty of recently borrowed books (from cached AI analysis): {difficulty_line}"
    )
    return len(loans) + len(reviews) + len(reservations), text


async def ensure_reading_profile(user: User) -> dict | None:
    """None means "nothing to profile yet" (zero activity) or "unavailable right now"
    (LLM call failed) with no prior cache to fall back on — the caller renders an
    unavailable state, never a fabricated profile. A transient LLM failure with an
    existing cached profile keeps returning that stale-but-real profile rather than
    blanking it out, matching "existing functionality continues working normally".
    """
    activity_count, prompt_text = await _activity_signal(user.id)

    if user.readingProfile and user.readingProfileActivityCount == activity_count:
        return user.readingProfile

    if activity_count == 0:
        return None

    try:
        llm = build_chat_llm()
        result = await llm.ainvoke(
            [SystemMessage(content=_SYSTEM_PROMPT), HumanMessage(content=prompt_text)]
        )
        parsed = extract_json_object(str(result.content))
    except Exception:
        logger.exception("Failed to compute reading profile for member %s", user.id)
        return user.readingProfile

    if parsed is None:
        logger.warning("Reading profile response for member %s was not valid JSON", user.id)
        return user.readingProfile

    data = _normalize(parsed)

    from app.modules.members import repository

    await repository.save_reading_profile(user.id, data, activity_count=activity_count)
    return data
