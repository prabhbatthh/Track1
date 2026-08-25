"""Pure scoring logic for the recommendation quiz — no Prisma, no I/O, fully unit-testable.

The relaxation ladder (service.py) only changes which candidates get *fetched* (the hard
author/era filter). Scoring here always weighs every answer as a soft signal regardless
of whether that same field is currently also a hard filter upstream — for a hard-filtered
field every remaining candidate already matches it, so its bonus becomes a constant
offset that doesn't change relative order. That keeps the original answers influencing
the ranking at every relaxation level, per the "never discard preferences" rule, without
the fetch and scoring layers needing to agree on which fields are "currently strict".
"""

from collections import Counter
from dataclasses import dataclass, field

from prisma.models import Book

from app.modules.recommendations.schemas import NO_PREFERENCE, QuizAnswers

# Fixed content taxonomy for the "story type" question — not derived from a frequency
# count like author/era, since it's matched against free-text descriptions rather than a
# structured column. Every book has a description (401/401 in the current catalog), so
# this is grounded in real text, just not an exact-match field the way author/era are.
STORY_TYPES: list[tuple[str, str, list[str]]] = [
    (
        "mystery_thriller",
        "Gripping mystery or thriller",
        ["mystery", "murder", "detective", "thriller", "suspense", "crime", "investigat"],
    ),
    (
        "heartwarming",
        "Heartwarming and reflective",
        ["family", "friendship", "heartwarming", "self-discovery", "warmth", "relationship"],
    ),
    (
        "mythology_folklore",
        "Timeless mythology and folklore",
        ["mythology", "folklore", "fable", "legend", "ancient", "gods", "epic tale", "retelling"],
    ),
    (
        "motivational",
        "Motivational and inspiring",
        ["motivat", "self-help", "inspir", "success", "growth", "habit", "mindset"],
    ),
    (
        "adventure",
        "Epic and adventurous",
        ["adventure", "quest", "journey", "battle", "explore", "war", "epic"],
    ),
    (
        "humorous",
        "Witty and humorous",
        ["humor", "humour", "witty", "funny", "comic", "satire"],
    ),
]
STORY_TYPE_KEYWORDS: dict[str, list[str]] = {key: kws for key, _, kws in STORY_TYPES}
_STORY_TYPE_LABELS: dict[str, str] = {key: label for key, label, _ in STORY_TYPES}

AUTHOR_MATCH_WEIGHT = 5
ERA_MATCH_WEIGHT = 4
STORY_TYPE_HIT_WEIGHT = 1
STORY_TYPE_MAX_HITS = 4
POPULARITY_WEIGHT = 2
# Ambient, not a question — only 11% of the catalog has any review, too sparse a signal
# to dedicate a quiz question to (see the recommendations module's design notes). Any
# book with a strong average rating gets this automatically; the member never picks it.
RATING_BOOST = 2
RATING_BOOST_THRESHOLD = 4.0
# Between story type's max (+4) and popularity's (+2): being borrowable *today* is
# genuinely valuable to a "find my next book" feature, so it outweighs the softer
# behavioral signals, but a real content mismatch can still beat it — this is a scoring
# bonus, not a dominant sort tier, so a highly relevant unavailable book can still
# outrank a barely relevant available one.
AVAILABILITY_WEIGHT = 3
# Small on purpose — a returning member's borrowing history is a bonus signal, not
# something that should drown out what they told the quiz just now.
HISTORY_AUTHOR_WEIGHT = 1
# Same tier as HISTORY_AUTHOR_WEIGHT: the AI reading profile (members/reading_profile.py)
# is another soft behavioral signal, not a replacement for what the member just told the
# quiz. Reading profile_interests is optional and defaults to empty, so a member with no
# cached profile yet scores identically to before this existed.
PROFILE_INTEREST_WEIGHT = 1


def _era_key_for_year(year: int | None) -> str | None:
    if year is None:
        return None
    if year < 1950:
        return "pre_1950"
    if year < 1990:
        return "1950_1989"
    if year < 2010:
        return "1990_2009"
    return "2010_plus"


@dataclass
class ScoredBook:
    book: Book
    score: float
    reasons: list[str] = field(default_factory=list)


def score_candidates(
    books: list[Book],
    answers: QuizAnswers,
    *,
    ratings: dict[str, tuple[float, int]],
    loan_counts: dict[str, int],
    history_authors: Counter[str],
    profile_interests: frozenset[str] = frozenset(),
) -> list[ScoredBook]:
    scored: list[ScoredBook] = []
    for book in books:
        score = 0.0
        reasons: list[str] = []

        authors = [answers.author] if isinstance(answers.author, str) else (answers.author or [])
        if book.author in authors and book.author != NO_PREFERENCE:
            score += AUTHOR_MATCH_WEIGHT
            reasons.append(f"By {book.author}, the author you picked")

        eras = [answers.era] if isinstance(answers.era, str) else (answers.era or [])
        book_era = _era_key_for_year(book.publishedYear)
        if book_era and book_era in eras and book_era != NO_PREFERENCE:
            score += ERA_MATCH_WEIGHT
            reasons.append("Matches the era you picked")

        story_types = (
            [answers.story_type]
            if isinstance(answers.story_type, str)
            else (answers.story_type or [])
        )
        if book.description:
            for st in story_types:
                if st != NO_PREFERENCE:
                    keywords = STORY_TYPE_KEYWORDS.get(st, [])
                    text = book.description.lower()
                    hits = min(sum(1 for kw in keywords if kw in text), STORY_TYPE_MAX_HITS)
                    if hits:
                        score += hits * STORY_TYPE_HIT_WEIGHT
                        reasons.append(f"Themes that fit {_STORY_TYPE_LABELS[st].lower()}")
                        break

        pops = (
            [answers.popularity]
            if isinstance(answers.popularity, str)
            else (answers.popularity or [])
        )
        loan_count = loan_counts.get(book.id, 0)
        if "trending" in pops and loan_count > 0:
            score += POPULARITY_WEIGHT
            reasons.append("Popular with other members")
        elif "hidden_gems" in pops and loan_count == 0:
            score += POPULARITY_WEIGHT
            reasons.append("A hidden gem — not widely borrowed yet")

        avg_rating, _review_count = ratings.get(book.id, (None, 0))
        if avg_rating is not None and avg_rating >= RATING_BOOST_THRESHOLD:
            score += RATING_BOOST
            reasons.append(f"Highly rated ({avg_rating:.1f}★ from other readers)")

        if book.totalCopies > 0:
            score += AVAILABILITY_WEIGHT
            reasons.append("Available to borrow right now")

        history_hits = history_authors.get(book.author, 0)
        if history_hits:
            score += history_hits * HISTORY_AUTHOR_WEIGHT
            reasons.append(f"You've enjoyed other books by {book.author}")

        if book.category in profile_interests:
            score += PROFILE_INTEREST_WEIGHT
            reasons.append("Matches your AI reading profile's interests")

        scored.append(ScoredBook(book=book, score=score, reasons=reasons))

    scored.sort(key=lambda sb: sb.score, reverse=True)
    return scored
