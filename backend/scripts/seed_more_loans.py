"""One-off top-up: adds more Loan records to the already-seeded demo dataset so
loan-derived dashboard charts (Most Borrowed Books, Library/Member Activity,
Overdue & Fines) show realistic higher volume. Purely additive — reuses the same
member/staff/book pool and borrow/return/fine distribution as seed_demo_data.py's
_seed_loans (just run for more rounds), and skips any (member, book) pair that
already has a loan so nothing already-seeded gets duplicated.

Deliberately does not seed ReadingProgress/Review rows for these extra loans —
that's out of scope for what this script is for (bulking up loan-count charts),
so those loans just won't show up in reading-progress-based features.

Not idempotent and not wired into app startup: run manually, once.
Run from backend/: `uv run python scripts/seed_more_loans.py`
"""

import asyncio
import os
import sys
from datetime import timedelta
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).parent))
import seed_demo_data as sdd  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.constants import Role  # noqa: E402
from app.db.prisma import prisma  # noqa: E402
from app.modules.loans.constants import FINE_PER_DAY, LOAN_PERIOD_DAYS  # noqa: E402

ROUNDS = 3  # on top of the ~1x seed_demo_data.py already created => ~4x total


async def _add_loan_round(members: list, books: list, issuers: list, used_pairs: set) -> int:
    now = sdd.NOW
    created = 0
    for member in members:
        if sdd.RNG.random() >= 0.5:
            continue
        loan_count = sdd.RNG.choices([1, 2, 3], weights=[55, 30, 15], k=1)[0]
        for _ in range(loan_count):
            book = sdd.RNG.choice(books)
            pair = (member.id, book.id)
            if pair in used_pairs:
                continue
            used_pairs.add(pair)

            earliest = member.createdAt + timedelta(hours=sdd.RNG.randint(1, 72))
            if earliest >= now:
                continue
            borrowed_at = sdd._random_dt_between(earliest, now)
            due_date = borrowed_at + timedelta(days=LOAN_PERIOD_DAYS)
            issuer = sdd.RNG.choice(issuers)

            data = {
                "bookId": book.id,
                "memberId": member.id,
                "borrowedAt": borrowed_at,
                "dueDate": due_date,
                "createdById": issuer.id,
                "createdAt": borrowed_at,
            }

            fine_amount = 0
            outcome = (
                sdd.RNG.choices(
                    ["on_time", "late", "overdue_unreturned"], weights=[55, 25, 20], k=1
                )[0]
                if due_date <= now
                else "active"
            )

            if outcome == "on_time":
                data["returnedAt"] = sdd._random_dt_between(
                    borrowed_at + timedelta(days=1), due_date
                )
            elif outcome == "late":
                returned_at = sdd._random_dt_between(
                    due_date + timedelta(days=1), min(due_date + timedelta(days=10), now)
                )
                data["returnedAt"] = returned_at
                days_late = max(1, (returned_at.date() - due_date.date()).days)
                fine_amount = days_late * FINE_PER_DAY
                data["finePaid"] = sdd.RNG.random() < 0.6
            elif outcome == "overdue_unreturned":
                days_late = max(1, (now.date() - due_date.date()).days)
                fine_amount = days_late * FINE_PER_DAY
                data["finePaid"] = False

            await prisma.loan.create(data=data)
            created += 1

            if outcome == "late" and data.get("finePaid"):
                label = "Fines cleared by guardian" if sdd.RNG.random() < 0.2 else "Overdue fine"
                await prisma.payment.create(
                    data={
                        "userId": member.id,
                        "amount": fine_amount,
                        "label": label,
                        "createdAt": data["returnedAt"] + timedelta(hours=1),
                    }
                )
            if outcome == "overdue_unreturned":
                await prisma.notification.create(
                    data={
                        "userId": member.id,
                        "type": "fine-reminder",
                        "message": f"Your fine of ₹{fine_amount} for '{book.title}' is overdue.",
                        "createdAt": due_date + timedelta(days=1),
                    }
                )
    return created


async def main() -> None:
    settings = get_settings()
    if settings.app_env not in sdd.SEEDABLE_ENVIRONMENTS:
        sys.exit(
            f"refusing to top up demo loans with APP_ENV={settings.app_env!r} — "
            f"allowed only in {sorted(sdd.SEEDABLE_ENVIRONMENTS)}"
        )
    os.environ.setdefault("DATABASE_URL", settings.database_url)
    await prisma.connect()

    try:
        members = await prisma.user.find_many(
            where={"role": {"name": Role.MEMBER}, "email": {"endswith": f"@{sdd.SEED_DOMAIN}"}}
        )
        issuers = await prisma.user.find_many(
            where={
                "role": {"name": {"in": [Role.MANAGER, Role.LIBRARIAN]}},
                "email": {"endswith": f"@{sdd.SEED_DOMAIN}"},
            }
        )
        books = await prisma.book.find_many()
        if not members or not issuers or not books:
            sys.exit("No seed-demo members/staff/books found — run seed_demo_data.py first.")

        existing_loans = await prisma.loan.find_many(
            where={"memberId": {"in": [m.id for m in members]}}
        )
        used_pairs: set[tuple[str, str]] = {(loan.memberId, loan.bookId) for loan in existing_loans}

        total_created = 0
        for round_num in range(1, ROUNDS + 1):
            created = await _add_loan_round(members, books, issuers, used_pairs)
            total_created += created
            print(f"Round {round_num}/{ROUNDS}: added {created} loans.")

        print(
            f"\nDone. Added {total_created} loans on top of {len(existing_loans)} existing "
            f"({len(members)} members, {len(books)} books)."
        )
    finally:
        await prisma.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
