"""Daily freshness top-up for demo data.

seed_demo_data.py seeds one historical batch and then skips forever once it finds a
@seed-demo.example.com user — good for not re-exploding the member count on every
boot, but it means a handful of facts that are inherently "as of today" (this
month's reading-goal progress, today's seat occupancy, whether any event is still
upcoming) silently go stale the day after that batch was seeded.

This script is a top-up, re-run automatically on every backend boot (see
app.main's lifespan): it mostly adds rows to close a gap it finds *right now*
(reviews, loans, tickets, events, seat bookings), plus two narrow in-place fixes —
rewriting a post's own `content` when it's under the word-count floor, and deleting
a fixed, hardcoded list of retired first-draft post templates — both scoped to
specific rows by exact content match, never a blanket edit/delete. Every check is a
count/lookup first, so a day that's already topped up is a fast no-op — safe to
leave running forever, past any specific event date, with nobody needing to re-seed
by hand. Operates on whichever members/books/staff already exist, so it works
whether they came from seed_demo_data.py, seed_e2e_fixtures.py, or real signups in
a dev database.

Run from backend/: `uv run python scripts/seed_daily_refresh.py`
"""

import asyncio
import contextlib
import hashlib
import math
import os
import random
import re
import sys
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).parent))
from prisma.errors import UniqueViolationError  # noqa: E402
from seed_demo_data import REVIEW_TEMPLATES, SUPPORT_DESCRIPTIONS  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.constants import Role  # noqa: E402
from app.db.prisma import prisma  # noqa: E402
from app.modules.loans.constants import LOAN_PERIOD_DAYS  # noqa: E402
from app.modules.members.repository import count_completed_reading_progress  # noqa: E402
from app.modules.seat_booking.constants import SEAT_LABELS  # noqa: E402

SEEDABLE_ENVIRONMENTS = {"development", "test", "e2e"}

# Restricts the accounts this script will attach demo activity to. seed_demo_data.py
# creates every demo user under this domain, so it also excludes real dev logins and,
# importantly, the *-test.example.com users a local pytest run leaves behind.
SEED_EMAIL_DOMAIN = "@seed-demo.example.com"
DEMO_ONLY = {"email": {"endswith": SEED_EMAIL_DOMAIN}}

# Deterministic within a day (so re-running the same day doesn't reshuffle choices
# already made), but different from one day to the next.
RNG = random.Random(int(datetime.now(UTC).strftime("%Y%m%d")))

TOTAL_SEATS = len(SEAT_LABELS)
DAY_HOURS = range(9, 21)
PEAK_HOURS = {13, 18}
DAY_TARGET = math.ceil(TOTAL_SEATS * 0.6)
NIGHT_TARGET = math.ceil(TOTAL_SEATS * 0.3)

POPULAR_BOOK_REVIEWS = (10, 16)
NORMAL_BOOK_REVIEWS = (6, 7)
POPULAR_FRACTION = 0.2
MEMBER_TICKET_CATEGORIES = [
    "book_reservation",
    "payment",
    "seat_booking",
    "harassment",
    "offline_library",
    "other",
]
MIN_TICKETS_PER_MEMBER = 2
MIN_MONTHLY_BOOKS = 4
MIN_UPCOMING_EVENTS = 3
EXTRA_EVENT_TITLES = [
    "New Arrivals Showcase",
    "Weekend Writing Workshop",
    "Teen Book Swap",
    "Classic Literature Circle",
    "Local Author Meet & Greet",
    "Study Skills & Speed Reading Session",
]


def _seat_target(hour: int) -> int:
    if hour in PEAK_HOURS:
        return TOTAL_SEATS
    return DAY_TARGET if hour in DAY_HOURS else NIGHT_TARGET


async def _top_up_seat_occupancy(members: list) -> None:
    """Today only — "today" resets to zero bookings every day, so this is the one
    piece that must actually run daily rather than just being safe to."""
    today = datetime.now(UTC).date()
    day_key = datetime(today.year, today.month, today.day, tzinfo=UTC)
    added = 0
    for hour in range(24):
        target = _seat_target(hour)
        existing = await prisma.seatbooking.find_many(where={"date": day_key, "hour": hour})
        needed = target - len(existing)
        if needed <= 0:
            continue
        taken_seats = {b.seatLabel for b in existing}
        taken_members = {b.memberId for b in existing}
        free_seats = [s for s in SEAT_LABELS if s not in taken_seats]
        candidates = [m for m in members if m.id not in taken_members]
        RNG.shuffle(free_seats)
        RNG.shuffle(candidates)
        for seat, member in zip(free_seats, candidates[:needed], strict=False):
            try:
                await prisma.seatbooking.create(
                    data={"memberId": member.id, "seatLabel": seat, "date": day_key, "hour": hour}
                )
                added += 1
            except UniqueViolationError:
                pass
    print(f"Seat occupancy top-up: added {added} bookings for {today.isoformat()}.")


async def _top_up_reading_activity(members: list, books: list, issuers: list) -> None:
    """Ensures a reading goal exists and this month's completed-book count is >= 4,
    creating a fast on-time loan + completed progress + review for each book needed
    to close the gap — so "read" and "reviewed" stay true together."""
    now = datetime.now(UTC)
    month_start = datetime(now.year, now.month, 1, tzinfo=UTC)
    goals_created = 0
    loans_created = 0
    reviews_created = 0

    for member in members:
        if await prisma.readinggoal.find_unique(where={"memberId": member.id}) is None:
            await prisma.readinggoal.create(
                data={"memberId": member.id, "yearlyGoal": 48, "monthlyGoal": MIN_MONTHLY_BOOKS}
            )
            goals_created += 1

        completed = await count_completed_reading_progress(member.id, since=month_start)
        if completed >= MIN_MONTHLY_BOOKS:
            continue

        already_read = await prisma.readingprogress.find_many(where={"memberId": member.id})
        read_ids = {row.bookId for row in already_read}
        pool = [b for b in books if b.id not in read_ids]
        RNG.shuffle(pool)

        for book in pool[: MIN_MONTHLY_BOOKS - completed]:
            span_start = max(month_start, member.createdAt)
            borrowed_at = span_start + timedelta(
                seconds=RNG.randint(0, max(1, int((now - span_start).total_seconds())))
            )
            latest_borrow = now - timedelta(hours=2)
            if borrowed_at > latest_borrow:
                borrowed_at = latest_borrow
            returned_at = borrowed_at + timedelta(hours=RNG.randint(6, 96))
            if returned_at >= now:
                returned_at = now - timedelta(minutes=RNG.randint(5, 60))
            if returned_at <= borrowed_at:
                returned_at = borrowed_at + timedelta(minutes=30)

            issuer = RNG.choice(issuers)
            await prisma.loan.create(
                data={
                    "bookId": book.id,
                    "memberId": member.id,
                    "borrowedAt": borrowed_at,
                    "dueDate": borrowed_at + timedelta(days=LOAN_PERIOD_DAYS),
                    "returnedAt": returned_at,
                    "createdById": issuer.id,
                    "createdAt": borrowed_at,
                }
            )
            loans_created += 1
            await prisma.readingprogress.create(
                data={
                    "memberId": member.id,
                    "bookId": book.id,
                    "status": "completed",
                    "percentComplete": 100,
                    "updatedAt": returned_at,
                }
            )
            try:
                await prisma.review.create(
                    data={
                        "bookId": book.id,
                        "memberId": member.id,
                        "rating": RNG.choices([3, 4, 5, 2], weights=[25, 40, 25, 10], k=1)[0],
                        "comment": RNG.choice(REVIEW_TEMPLATES),
                        "images": [],
                        # Clamped to now: a book returned today plus the review lag
                        # landed in tomorrow, and future-dated rows sort above real
                        # ones in the newest-first review lists (which are capped, so
                        # genuinely new reviews fell off the end entirely).
                        "createdAt": min(
                            returned_at + timedelta(hours=RNG.randint(1, 20)),
                            datetime.now(UTC),
                        ),
                    }
                )
                reviews_created += 1
            except UniqueViolationError:
                pass

    print(
        f"Reading-goal top-up: {goals_created} goals created, {loans_created} catch-up "
        f"loans (+matching reviews: {reviews_created}) so every member has "
        f"{MIN_MONTHLY_BOOKS}+ books completed this month."
    )


async def _top_up_book_reviews(books: list, members: list) -> None:
    """Independent of who actually borrowed a book — every book gets a review-count
    floor (more for popular ones), since a rarely-borrowed book still needs reviews
    to look real."""
    loan_rows = await prisma.query_raw(
        "SELECT book_id::text AS book_id, COUNT(*)::int AS n FROM loans GROUP BY book_id"
    )
    loan_counts = {row["book_id"]: row["n"] for row in loan_rows}
    ranked = sorted(books, key=lambda b: loan_counts.get(b.id, 0), reverse=True)
    popular_ids = {b.id for b in ranked[: max(1, int(len(ranked) * POPULAR_FRACTION))]}

    reviewers_by_book: dict[str, set[str]] = defaultdict(set)
    for review in await prisma.review.find_many():
        reviewers_by_book[review.bookId].add(review.memberId)

    created = 0
    for book in books:
        have = reviewers_by_book[book.id]
        low, high = POPULAR_BOOK_REVIEWS if book.id in popular_ids else NORMAL_BOOK_REVIEWS
        # Keyed by the book's own id rather than drawn from the shared RNG stream,
        # so the target for a given book is the same on every run regardless of how
        # much other work happened earlier in the run (the shared-stream version
        # kept nudging a few books' targets up or down each run and never settled).
        target = low + _stable_index(book.id, high - low + 1)
        needed = target - len(have)
        if needed <= 0:
            continue
        candidates = [m for m in members if m.id not in have]
        RNG.shuffle(candidates)
        for member in candidates[:needed]:
            await prisma.review.create(
                data={
                    "bookId": book.id,
                    "memberId": member.id,
                    "rating": RNG.choices([3, 4, 5, 2, 1], weights=[28, 35, 24, 9, 4], k=1)[0],
                    "comment": RNG.choice(REVIEW_TEMPLATES),
                    "images": [],
                    "createdAt": datetime.now(UTC)
                    - timedelta(days=RNG.randint(0, 60), hours=RNG.randint(0, 23)),
                }
            )
            created += 1
            have.add(member.id)
    print(f"Book review top-up: added {created} reviews across {len(books)} books.")


# First-generation multilingual posts were one-liners ("Finished {title} — great
# book!") — read as obviously generated. Deleted outright and replaced below with
# the long-form templates, since they're brand new with zero real comments/likes on
# them yet, so nothing genuine is lost.
_RETIRED_SHORT_POST_TEMPLATES = [
    "{title} ਹੁਣੇ ਖਤਮ ਕੀਤੀ — ਬਹੁਤ ਵਧੀਆ ਕਿਤਾਬ ਸੀ! ਸਾਰਿਆਂ ਨੂੰ ਪੜ੍ਹਨ ਦੀ ਸਲਾਹ ਦਿੰਦਾ ਹਾਂ।",
    "ਇਸ ਮਹੀਨੇ ਦੀ ਬੁੱਕ ਕਲੱਬ ਚੋਣ: {title}। ਹੇਠਾਂ ਆਪਣੇ ਵਿਚਾਰ ਸਾਂਝੇ ਕਰੋ।",
    "{title} ಓದಿ ಮುಗಿಸಿದೆ — ಅದ್ಭುತ ಪುಸ್ತಕ! ಎಲ್ಲರಿಗೂ ಶಿಫಾರಸು ಮಾಡುತ್ತೇನೆ.",
    "{title} ಪುಸ್ತಕವನ್ನು ಮತ್ತೊಮ್ಮೆ ಓದುತ್ತಿದ್ದೇನೆ, ಇನ್ನೂ ಹೊಸ ಸಂಗತಿಗಳು ಸಿಗುತ್ತಿವೆ.",
    "{title} படித்து முடித்தேன் — மிகவும் அருமையான புத்தகம்! அனைவருக்கும் பரிந்துரைக்கிறேன்.",
    "இந்த மாத புத்தக கிளப் தேர்வு: {title}. கீழே உங்கள் கருத்துகளைப் பகிரவும்.",
    "{title} नुकतेच वाचून पूर्ण केले — खूप छान पुस्तक होते! सर्वांना वाचण्याची शिफारस करतो.",
    "या महिन्याची बुक क्लब निवड: {title}. खाली तुमचे विचार मांडा.",
    "{title} अभी-अभी पूरी की — बहुत ही शानदार किताब थी! सभी को पढ़ने की सलाह देता हूं।",
    "{title} বইটি এইমাত্র শেষ করলাম — দারুণ বই! সবাইকে পড়ার পরামর্শ দিচ্ছি।",
    "{title} పుస్తకం చదవడం పూర్తి చేశాను — చాలా బాగుంది! అందరికీ సిఫారసు చేస్తున్నాను.",
    "{title} വായിച്ചു തീർത്തു — വളരെ നല്ല പുസ്തകം! എല്ലാവരോടും ശുപാർശ ചെയ്യുന്നു.",
]

# (language, template) — "{title}" is filled in from a fixed book/member per template
# (not randomized) so the resulting content string is deterministic and can be checked
# for exact existence below, the same one-time-only idempotency style as the rest of
# this codebase's seed scripts (e.g. seed_pricing_plans.py's upsert-by-planId).
# Long-form and first-person on purpose — a specific moment, an honest complaint, a
# feeling — instead of generic one-line praise, which is what read as AI-written.
HUMANIZED_POST_TEMPLATES = [
    (
        "English",
        "I picked up {title} on a whim because the cover caught my eye at the "
        "return desk, and I honestly wasn't expecting to get hooked the way I "
        "did. I ended up reading half of it in one sitting on a Sunday "
        "afternoon, ignoring three text messages and a cup of tea going cold "
        "beside me. The middle section dragged a little, if I'm being honest, "
        "but the ending completely made up for it. If anyone else here has "
        "read it, I'd love to talk about that last chapter — I'm still "
        "thinking about it two days later.",
    ),
    (
        "English",
        "Not going to lie, {title} sat on my nightstand for almost a month "
        "before I actually opened it — work had me exhausted and reading felt "
        "like one more thing on the to-do list. But once I started, I "
        "couldn't put it down. There's a scene about halfway through that "
        "genuinely caught me off guard on the metro, which was mildly "
        "embarrassing but also kind of nice. It's rare a book makes me feel "
        "something that strongly. Borrowing it from here was honestly one of "
        "the better decisions I've made this month.",
    ),
    (
        "English",
        "My book club picked {title} for this month and I'll admit I went in "
        "with low expectations, since the last two picks weren't really my "
        "thing. This one surprised me. The characters felt real in a way "
        "that's hard to describe — flawed, a little annoying sometimes, but "
        "real. We're meeting this weekend to discuss it and I already have a "
        "list of questions I want to bring up, especially about how the "
        "story wraps up. Curious what everyone else here made of it.",
    ),
    (
        "English",
        "Finished {title} late last night and immediately regretted staying "
        "up, since I had work in a few hours, but zero regrets about the "
        "book itself. It's the kind of story that sneaks up on you — nothing "
        "feels particularly dramatic chapter by chapter, and then suddenly "
        "you're emotionally wrecked by page two hundred and not entirely "
        "sure how you got there. Already thinking about who I can lend my "
        "next pick to so we can talk about this one properly.",
    ),
    (
        "English",
        "A friend recommended {title} to me weeks ago and I finally got "
        "around to borrowing it last weekend, mostly because I'd run out of "
        "other things on my list. I wasn't prepared for how much it would "
        "stick with me. There's a subplot involving a secondary character "
        "that I actually think might be my favorite part of the whole book, "
        "which isn't something I expected going in. Already planning to "
        "pass the recommendation along to at least two other people I know.",
    ),
    (
        "English",
        "I read {title} mostly on my daily commute, a few pages at a time "
        "squeezed in between stops, which honestly isn't the ideal way to "
        "experience a book like this but it's what I had. Even in short "
        "bursts it managed to pull me in every single time I opened it. By "
        "the last week I was deliberately taking the longer route home just "
        "to get a few extra pages in. Worth every minute, even the ones I "
        "probably should've spent doing something else.",
    ),
    (
        "English",
        "It rained pretty much the entire weekend, so I curled up with "
        "{title} and didn't leave the couch for most of Saturday. That's "
        "usually a sign a book is doing something right, and this one "
        "definitely was. A couple of the plot choices near the middle felt "
        "a little convenient, if I'm nitpicking, but I was too invested by "
        "that point to actually mind. Would happily read it again on the "
        "next rainy weekend that comes along.",
    ),
    (
        "English",
        "My younger sibling kept insisting I read {title}, and after "
        "putting it off for way too long I finally borrowed a copy last "
        "week. We've been texting back and forth about it ever since, "
        "comparing notes on which parts hit hardest. It's rare that we "
        "actually agree on a book this much. If anyone else here has read "
        "it, I'm curious whether you saw the ending coming, because we "
        "definitely didn't.",
    ),
    (
        "Punjabi",
        "{title} ਮੈਂ ਪਿਛਲੇ ਹਫ਼ਤੇ ਪੜ੍ਹਨੀ ਸ਼ੁਰੂ ਕੀਤੀ ਸੀ, ਬਸ ਐਵੇਂ ਹੀ, ਬਿਨਾਂ ਕੋਈ ਖਾਸ "
        "ਉਮੀਦ ਰੱਖੇ। ਪਰ ਪਹਿਲੇ ਕੁਝ ਸਫ਼ਿਆਂ ਤੋਂ ਬਾਅਦ ਹੀ ਮੈਨੂੰ ਲੱਗਾ ਕਿ ਇਹ ਕਿਤਾਬ "
        "ਵੱਖਰੀ ਹੈ। ਇੱਕ ਰਾਤ ਤਾਂ ਮੈਂ ਸੌਣਾ ਹੀ ਭੁੱਲ ਗਿਆ, ਬੱਸ ਪੜ੍ਹਦਾ ਹੀ ਰਿਹਾ ਕਿਉਂਕਿ "
        "ਕਹਾਣੀ ਛੱਡਣ ਦਾ ਦਿਲ ਨਹੀਂ ਕਰ ਰਿਹਾ ਸੀ। ਵਿਚਕਾਰ ਥੋੜ੍ਹਾ ਹੌਲੀ ਲੱਗੀ, ਪਰ ਅੰਤ "
        "ਪੜ੍ਹ ਕੇ ਸੱਚੀਂ ਅੱਖਾਂ ਵਿੱਚ ਪਾਣੀ ਆ ਗਿਆ, ਇਹ ਮੰਨਣ ਵਿੱਚ ਕੋਈ ਸ਼ਰਮ ਨਹੀਂ। ਇਸ "
        "ਕਹਾਣੀ ਦੇ ਮੁੱਖ ਕਿਰਦਾਰ ਨੇ ਜੋ ਫ਼ੈਸਲੇ ਲਏ, ਉਹ ਹਾਲੇ ਵੀ ਦਿਮਾਗ਼ ਵਿੱਚ ਘੁੰਮ ਰਹੇ "
        "ਹਨ। ਜੇ ਕਿਸੇ ਹੋਰ ਨੇ ਵੀ ਪੜ੍ਹੀ ਹੈ, ਮੈਨੂੰ ਦੱਸਿਓ, ਗੱਲ ਕਰਨੀ ਹੈ ਇਸ ਬਾਰੇ।",
    ),
    (
        "Kannada",
        "{title} ಪುಸ್ತಕವನ್ನು ನಾನು ಗ್ರಂಥಾಲಯದಿಂದ ತೆಗೆದುಕೊಂಡಾಗ ಅಷ್ಟೇನೂ ನಿರೀಕ್ಷೆ "
        "ಇರಲಿಲ್ಲ, ಸುಮ್ಮನೆ ಸಮಯ ಕಳೆಯಲು ಎಂದು ಶುರು ಮಾಡಿದೆ. ಆದರೆ ಮೊದಲ ಅಧ್ಯಾಯದ "
        "ನಂತರವೇ ಪುಸ್ತಕ ಬಿಡಲು ಮನಸ್ಸಾಗಲಿಲ್ಲ. ಆಫೀಸಿನಲ್ಲಿ ಕೂಡ ಮನಸ್ಸು ಈ ಕಥೆಯ "
        "ಕಡೆಗೆ ಹೋಗುತ್ತಿತ್ತು, ಮನೆಗೆ ಬಂದ ತಕ್ಷಣ ಮತ್ತೆ ಓದಲು ಕುಳಿತುಕೊಳ್ಳುತ್ತಿದ್ದೆ. "
        "ಕೊನೆಯ ಪುಟಗಳಂತೂ ನನ್ನನ್ನು ನಿಜವಾಗಿಯೂ ಭಾವುಕನನ್ನಾಗಿ ಮಾಡಿದವು, ಕಣ್ಣಲ್ಲಿ "
        "ನೀರೂ ಬಂತು ಎಂದು ಒಪ್ಪಿಕೊಳ್ಳುತ್ತೇನೆ. ಇಂತಹ ಪುಸ್ತಕಗಳು ಸಿಗುವುದು ಅಪರೂಪ, ಈ "
        "ಗ್ರಂಥಾಲಯದಲ್ಲಿ ಸಿಕ್ಕಿದ್ದಕ್ಕೆ ತುಂಬಾ ಖುಷಿಯಾಗಿದೆ. ಯಾರಾದರೂ ಓದಿದ್ದರೆ "
        "ದಯವಿಟ್ಟು ಹೇಳಿ, ಈ ಬಗ್ಗೆ ಮಾತನಾಡೋಣ.",
    ),
    (
        "Tamil",
        "{title} புத்தகத்தை நான் எடுத்தபோது பெரிதாக எதிர்பார்ப்பு இல்லாமல்தான் "
        "ஆரம்பித்தேன், ஆனால் சில பக்கங்களுக்குள்ளேயே அந்த கதையின் மீது ஒரு "
        "பிடிப்பு ஏற்பட்டுவிட்டது. ஒரு வார இறுதியில் வேறு எந்த வேலையும் "
        "செய்யாமல் முழு புத்தகத்தையும் படித்து முடித்தேன், அப்படி ஒரு "
        "உணர்வு. நடுவில் சற்று மெதுவாக நகர்ந்தது, ஆனால் முடிவைப் படித்தபோது "
        "மனது கனத்தது, கண்களில் நீர் வந்தது என்பது உண்மை. இந்த கதையின் "
        "முக்கிய பாத்திரம் எடுக்கும் முடிவுகளை நான் இன்னும் "
        "யோசித்துக்கொண்டே இருக்கிறேன். யாராவது படித்திருந்தால் இதைப் "
        "பற்றி பேசலாமா?",
    ),
    (
        "Marathi",
        "{title} ही कादंबरी मी लायब्ररीतून घेतली तेव्हा फार अपेक्षा नव्हती, पण "
        "पहिली काही पाने वाचल्यावरच लक्षात आलं की ही गोष्ट वेगळी आहे. एका "
        "रात्री तर मी झोपायचं विसरूनच वाचत बसलो, इतकं गुंतवून टाकणारं होतं. "
        "मध्यभागी थोडं संथ वाटलं, पण शेवट वाचताना खरंच डोळ्यात पाणी आलं हे "
        "कबूल करायलाच हवं. या कथेतील मुख्य पात्राने घेतलेले निर्णय अजूनही "
        "डोक्यातून जात नाहीत. कोणी वाचलं असेल तर नक्की सांगा, याबद्दल खूप "
        "काही बोलण्यासारखं आहे.",
    ),
    (
        "Hindi",
        "{title} किताब मैंने लाइब्रेरी से बस यूं ही उठा ली थी, कोई खास उम्मीद "
        "नहीं थी। लेकिन शुरुआती कुछ पन्नों के बाद ही समझ आ गया कि यह कहानी "
        "अलग है। एक रात तो मैं सोना ही भूल गया, बस पढ़ता ही रहा क्योंकि "
        "कहानी छोड़ने का मन ही नहीं कर रहा था। बीच में थोड़ा धीमा लगा, "
        "लेकिन अंत पढ़ते हुए सच में आंखों में पानी आ गया, यह मानने में कोई "
        "शर्म नहीं। इस किताब के मुख्य किरदार ने जो फैसले लिए, वो अभी भी "
        "दिमाग में घूम रहे हैं। अगर किसी और ने भी पढ़ी है तो बताइए, बात "
        "करनी है।",
    ),
    (
        "Bengali",
        "{title} বইটা লাইব্রেরি থেকে নিয়েছিলাম তেমন কোনো প্রত্যাশা ছাড়াই, "
        "কিন্তু প্রথম কয়েক পাতা পড়েই বুঝলাম এই গল্পটা অন্যরকম। এক রাতে তো "
        "ঘুমাতেই ভুলে গিয়েছিলাম, শুধু পড়েই যাচ্ছিলাম, গল্পটা ছাড়তে মন "
        "চাইছিল না। মাঝখানে একটু ধীর মনে হয়েছিল, কিন্তু শেষটা পড়ে সত্যিই "
        "চোখে জল এসে গিয়েছিল, স্বীকার করতে দ্বিধা নেই। এই বইয়ের প্রধান "
        "চরিত্র যে সিদ্ধান্তগুলো নিয়েছে, সেগুলো এখনও মাথা থেকে সরছে না। "
        "কেউ পড়ে থাকলে জানাবেন, এই নিয়ে কথা বলতে চাই।",
    ),
    (
        "Telugu",
        "{title} పుస్తకం లైబ్రరీ నుండి తీసుకున్నప్పుడు పెద్దగా ఆశలు లేవు, "
        "కానీ మొదటి కొన్ని పేజీలు చదివాక ఈ కథ వేరు అని అర్థమైంది. ఒక రాత్రి "
        "నిద్ర పోవడం మర్చిపోయి చదువుతూనే ఉన్నాను, కథను వదలాలని అనిపించలేదు. "
        "మధ్యలో కొంచెం నెమ్మదిగా అనిపించింది, కానీ చివరిభాగం చదివేటప్పుడు "
        "నిజంగా కళ్ళలో నీళ్లు వచ్చాయి, ఇది ఒప్పుకోవడంలో సిగ్గు లేదు. ఈ "
        "పుస్తకంలో ముఖ్య పాత్ర తీసుకున్న నిర్ణయాలు ఇంకా నా మనసులో "
        "తిరుగుతూనే ఉన్నాయి. ఎవరైనా చదివి ఉంటే చెప్పండి, దీని గురించి "
        "మాట్లాడాలని ఉంది.",
    ),
    (
        "Malayalam",
        "{title} എന്ന പുസ്തകം ലൈബ്രറിയിൽ നിന്ന് എടുത്തപ്പോൾ വലിയ "
        "പ്രതീക്ഷയൊന്നും ഉണ്ടായിരുന്നില്ല, പക്ഷേ ആദ്യത്തെ കുറച്ച് പേജുകൾ "
        "വായിച്ചപ്പോൾ തന്നെ ഈ കഥ വ്യത്യസ്തമാണെന്ന് തോന്നി. ഒരു രാത്രി "
        "ഉറങ്ങാൻ മറന്ന് വായിച്ചുകൊണ്ടിരുന്നു, കഥ വിടാൻ തോന്നിയില്ല. നടുവിൽ "
        "അല്പം പതുക്കെ പോയെങ്കിലും, അവസാനഭാഗം വായിച്ചപ്പോൾ ശരിക്കും കണ്ണ് "
        "നിറഞ്ഞു എന്നത് സത്യമാണ്. ഈ കഥയിലെ പ്രധാന കഥാപാത്രം എടുത്ത "
        "തീരുമാനങ്ങൾ ഇപ്പോഴും മനസ്സിൽ നിന്ന് പോകുന്നില്ല. ആരെങ്കിലും "
        "വായിച്ചിട്ടുണ്ടെങ്കിൽ പറയൂ, ഇതിനെക്കുറിച്ച് സംസാരിക്കണം.",
    ),
]


MIN_POST_WORDS = 70
_ENGLISH_TEMPLATES = [t for lang, t in HUMANIZED_POST_TEMPLATES if lang == "English"]
# Devanagari through Malayalam is one contiguous Unicode block (covers every Indic
# script this seed data uses: Hindi/Marathi, Bengali, Gurmukhi, Tamil, Telugu,
# Kannada, Malayalam) — used to tell "genuinely non-English" apart from "English
# text that happens to contain a non-ASCII em dash or ₹ sign", which `.isascii()`
# can't (it flagged this file's own English templates as "non-English").
_INDIC_SCRIPT_RE = re.compile(r"[ऀ-ൿ]")


def _stable_index(key: str, modulus: int) -> int:
    """A book/member pick derived from the template's own text, not its position in
    the list — so inserting a new template elsewhere never reshuffles which book an
    existing template is paired with (that reshuffling is exactly what happened
    with the old `i % len(books)` scheme, and silently created duplicate posts)."""
    return int(hashlib.sha256(key.encode("utf-8")).hexdigest(), 16) % modulus


async def _lengthen_short_posts() -> None:
    """The original seed_demo_data.py posts were one-liners — this rewrites any
    post under the word-count floor in place (same id/author/createdAt), so
    comments/likes/saves attached to it (keyed by postId, not content) survive.
    Only touches posts with no Indic-script characters — a non-English post
    measuring under 70 by a naive whitespace split isn't actually thin, that script
    just tokenizes differently, so leave it alone rather than clobbering it with an
    English rewrite."""
    posts = await prisma.communitypost.find_many()
    rewritten = 0
    for post in posts:
        if _INDIC_SCRIPT_RE.search(post.content) or len(post.content.split()) >= MIN_POST_WORDS:
            continue
        title = post.bookTitle or "this book"
        template = _ENGLISH_TEMPLATES[rewritten % len(_ENGLISH_TEMPLATES)]
        await prisma.communitypost.update(
            where={"id": post.id}, data={"content": template.format(title=title)}
        )
        rewritten += 1
    print(f"Post lengthening: rewrote {rewritten} short posts to {MIN_POST_WORDS}+ words each.")


async def _top_up_humanized_posts(members: list, books: list) -> None:
    """Long-form, first-person community posts (English + 8 Indian languages) that
    read like a real member wrote them, not a one-line AI summary. One-time per
    template (not day-relative) — only ever creates the ones still missing."""
    retired = 0
    for old_template in _RETIRED_SHORT_POST_TEMPLATES:
        book = books[_stable_index(old_template, len(books))]
        old_content = old_template.format(title=book.title)
        deleted = await prisma.communitypost.delete_many(where={"content": old_content})
        retired += deleted

    created = 0
    for _language, template in HUMANIZED_POST_TEMPLATES:
        book = books[_stable_index(template, len(books))]
        author = members[_stable_index(template + "|author", len(members))]
        content = template.format(title=book.title)
        if await prisma.communitypost.find_first(where={"content": content}) is not None:
            continue
        await prisma.communitypost.create(
            data={
                "authorId": author.id,
                "bookTitle": book.title,
                "content": content,
                "images": [],
                "createdAt": datetime.now(UTC)
                - timedelta(days=RNG.randint(0, 30), hours=RNG.randint(0, 23)),
            }
        )
        created += 1
    languages = sorted({lang for lang, _ in HUMANIZED_POST_TEMPLATES})
    print(
        f"Humanized posts top-up: retired {retired} old one-liners, added {created} "
        f"long-form posts across {len(languages)} languages ({', '.join(languages)})."
    )


async def _top_up_support_tickets(members: list, staff_pool: list) -> None:
    created = 0
    for member in members:
        existing = await prisma.supportticket.count(where={"raisedById": member.id})
        if existing >= MIN_TICKETS_PER_MEMBER:
            continue
        for _ in range(MIN_TICKETS_PER_MEMBER - existing):
            category = RNG.choice(MEMBER_TICKET_CATEGORIES)
            created_at = datetime.now(UTC) - timedelta(
                days=RNG.randint(0, 25), hours=RNG.randint(0, 23)
            )
            status = RNG.choices(["open", "resolved", "closed"], weights=[40, 35, 25], k=1)[0]
            resolver = RNG.choice(staff_pool)
            resolved_at = (
                created_at + timedelta(days=RNG.randint(1, 4)) if status != "open" else None
            )
            closed_at = (
                resolved_at + timedelta(days=1) if status == "closed" and resolved_at else None
            )
            await prisma.supportticket.create(
                data={
                    "raisedById": member.id,
                    "category": category,
                    "description": SUPPORT_DESCRIPTIONS[category],
                    "status": status,
                    "resolutionNote": (
                        "Resolved after reviewing account activity." if status != "open" else None
                    ),
                    "resolvedById": resolver.id if status != "open" else None,
                    "resolvedAt": resolved_at,
                    "closedAt": closed_at,
                    "createdAt": created_at,
                }
            )
            created += 1
    print(
        f"Support-ticket top-up: added {created} tickets (every member now has "
        f"{MIN_TICKETS_PER_MEMBER}+)."
    )


async def _top_up_upcoming_events(
    creators: list, members: list, guardians: list, books: list
) -> None:
    now = datetime.now(UTC)
    upcoming = await prisma.event.count(where={"date": {"gt": now}, "deletedAt": None})
    if upcoming >= MIN_UPCOMING_EVENTS:
        print(f"Upcoming events: {upcoming} already scheduled — nothing to add.")
        return

    attendees_pool = members + guardians
    created = 0
    for _ in range(MIN_UPCOMING_EVENTS - upcoming):
        book = RNG.choice(books)
        creator = RNG.choice(creators)
        capacity = RNG.choice([15, 20, 25, 30])
        event = await prisma.event.create(
            data={
                "title": RNG.choice(EXTRA_EVENT_TITLES),
                "description": f"Join us to discuss {book.title} and connect with fellow readers.",
                "location": "Main Reading Hall",
                "date": now + timedelta(days=RNG.randint(3, 21), hours=RNG.randint(0, 10)),
                "capacity": capacity,
                "createdBy": creator.id,
            }
        )
        created += 1
        registrant_count = RNG.randint(3, max(3, capacity // 2))
        for member in RNG.sample(attendees_pool, k=min(len(attendees_pool), registrant_count)):
            with contextlib.suppress(UniqueViolationError):
                await prisma.eventregistration.create(
                    data={"eventId": event.id, "memberId": member.id}
                )
    print(f"Upcoming-events top-up: added {created} new events.")


async def main() -> None:
    settings = get_settings()
    if settings.app_env not in SEEDABLE_ENVIRONMENTS:
        print(
            f"Skipping daily refresh — APP_ENV={settings.app_env!r} is not a dev/demo environment."
        )
        return
    os.environ.setdefault("DATABASE_URL", settings.database_url)
    await prisma.connect()

    try:
        # Demo accounts only. Selecting every member would also sweep in the
        # *-test.example.com users a local pytest run leaves behind, and attaching
        # reading progress/goals to those breaks the suite's own teardown (it deletes
        # users but not their reading rows, so the FK blocks it on the next run).
        members = sorted(
            await prisma.user.find_many(
                where={"role": {"name": Role.MEMBER}, "deletedAt": None, **DEMO_ONLY}
            ),
            key=lambda m: m.id,
        )
        guardians = await prisma.user.find_many(
            where={"role": {"name": Role.GUARDIAN}, "deletedAt": None, **DEMO_ONLY}
        )
        managers_and_librarians = await prisma.user.find_many(
            where={"role": {"name": {"in": [Role.MANAGER, Role.LIBRARIAN]}}, "deletedAt": None}
        )
        staff_creators = await prisma.user.find_many(
            where={"role": {"name": {"in": [Role.MANAGER, Role.ADMIN]}}, "deletedAt": None}
        )
        staff_pool = await prisma.user.find_many(
            where={
                "role": {"name": {"in": [Role.ADMIN, Role.MANAGER, Role.IT_HEAD]}},
                "deletedAt": None,
            }
        )
        # Sorted by id (not insertion/query order, which Postgres doesn't guarantee
        # stable across calls) so `_stable_index` picks the same book for a given
        # template on every run — an unstable list order was silently reshuffling
        # the pairing and made the humanized-post top-up re-create "new" posts
        # forever instead of converging.
        books = sorted(await prisma.book.find_many(where={"deletedAt": None}), key=lambda b: b.id)

        if not members or not books or not managers_and_librarians:
            print("No seed data present yet (members/books/staff) — skipping daily refresh.")
            return

        await _top_up_book_reviews(books, members)
        await _top_up_reading_activity(members, books, managers_and_librarians)
        await _lengthen_short_posts()
        await _top_up_humanized_posts(members, books)
        await _top_up_support_tickets(members, staff_pool)
        await _top_up_upcoming_events(staff_creators, members, guardians, books)
        await _top_up_seat_occupancy(members)
        print("Daily refresh complete.")
    finally:
        await prisma.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
