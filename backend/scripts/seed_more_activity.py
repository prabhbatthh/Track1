"""One-off top-up on top of the already-seeded @seed-demo.example.com dataset, for a
same-day client demo:

  1. ~7x the historical seat-booking volume (same distribution seed_demo_data.py's
     _seed_seat_activity already uses, just run for more rounds).
  2. A peak-shaped fill of *today's* seat utilization (most hours near-full) so the
     Seat Utilization chart doesn't read as empty on demo day.
  3. 56 members checked into the library as of 7 PM IST today (left checked-in, so
     the Check-In/Check-Out card's "Currently in Library" count shows 56).
  4. For member0316@seed-demo.example.com specifically: a few newly borrowed books
     (two still active, one returned on time), one returned-late loan with an unpaid
     fine, and a live 7-day login streak — which crosses the leaderboard's
     "7_day_streak" badge threshold (see leaderboard/service.py's get_leaderboard).

Not idempotent and not wired into app startup: run manually, once.
Run from backend/: `uv run python scripts/seed_more_activity.py`
"""

import asyncio
import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).parent))
import seed_demo_data as sdd  # noqa: E402
from prisma import Json  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.constants import Role  # noqa: E402
from app.db.prisma import prisma  # noqa: E402
from app.modules.loans.constants import FINE_PER_DAY, LOAN_PERIOD_DAYS  # noqa: E402
from app.modules.seat_booking.constants import SEAT_LABELS  # noqa: E402

TARGET_MEMBER_EMAIL = "member0316@seed-demo.example.com"
TOTAL_SEATS = len(SEAT_LABELS)
SEAT_ROUNDS = 7
CHECKIN_COUNT = 56

# Manager dashboard's _today_window() compares against UTC calendar day, and "7 PM"
# for a demo happening in India means 7 PM IST — fixed UTC+5:30 offset, same as the
# rest of this codebase (no DST to worry about).
_NOW = datetime.now(UTC)
TODAY_7PM = datetime(_NOW.year, _NOW.month, _NOW.day, 13, 30, tzinfo=UTC)
TODAY_START = datetime(_NOW.year, _NOW.month, _NOW.day, tzinfo=UTC)
TODAY_ISO = TODAY_START.date().isoformat()

# Rough midday peak, tapering at open/close — not literally 100% all day, which would
# read as fake, but full enough that the utilization chart clearly isn't empty.
TODAY_OCCUPANCY_CURVE = {
    9: 40,
    10: 75,
    11: 100,
    12: 100,
    13: 90,
    14: 100,
    15: 85,
    16: 70,
    17: 60,
    18: 45,
    19: 30,
    20: 15,
}


async def _seat_activity_round(members: list, used_slots: set) -> int:
    """One pass of seed_demo_data._seed_seat_activity's own sampling, extended to
    today's real date instead of the stale NOW the original run was anchored to."""
    count = 0
    sample = sdd.RNG.sample(members, k=max(1, len(members) * 20 // 100))
    for member in sample:
        for _ in range(sdd.RNG.choice([1, 1, 2])):
            for _attempt in range(5):
                seat = sdd.RNG.choice(SEAT_LABELS)
                day = sdd._random_dt_between(
                    max(member.createdAt, sdd.MONTH_STARTS[0]), TODAY_7PM
                ).date()
                hour = sdd.RNG.randint(9, 20)
                day_iso = day.isoformat()
                seat_key = (seat, day_iso, hour)
                member_key = (member.id, day_iso, hour)
                if seat_key in used_slots or member_key in used_slots:
                    continue
                used_slots.add(seat_key)
                used_slots.add(member_key)

                is_today = day_iso == TODAY_ISO
                created_at = (
                    sdd._random_dt_between(TODAY_START, TODAY_7PM)
                    if is_today
                    else datetime(day.year, day.month, day.day, tzinfo=UTC) - timedelta(days=1)
                )
                await prisma.seatbooking.create(
                    data={
                        "memberId": member.id,
                        "seatLabel": seat,
                        "date": datetime(day.year, day.month, day.day, tzinfo=UTC),
                        "hour": hour,
                        "createdAt": created_at,
                    }
                )
                count += 1
                break
    return count


async def _fill_today_seats(members: list, used_slots: set) -> int:
    count = 0
    for hour, percent in TODAY_OCCUPANCY_CURVE.items():
        target = round(TOTAL_SEATS * percent / 100)

        free_seats = [s for s in SEAT_LABELS if (s, TODAY_ISO, hour) not in used_slots]
        sdd.RNG.shuffle(free_seats)
        seats_for_hour = free_seats[:target]

        free_members = [m for m in members if (m.id, TODAY_ISO, hour) not in used_slots]
        sdd.RNG.shuffle(free_members)
        chosen_members = free_members[: len(seats_for_hour)]

        for seat, member in zip(seats_for_hour, chosen_members, strict=False):
            await prisma.seatbooking.create(
                data={
                    "memberId": member.id,
                    "seatLabel": seat,
                    "date": TODAY_START,
                    "hour": hour,
                    "createdAt": sdd._random_dt_between(TODAY_START, TODAY_7PM),
                }
            )
            used_slots.add((seat, TODAY_ISO, hour))
            used_slots.add((member.id, TODAY_ISO, hour))
            count += 1
    return count


async def _seed_checkins(members: list, recorders: list, count: int) -> int:
    chosen = sdd.RNG.sample(members, k=min(count, len(members)))
    created = 0
    for member in chosen:
        checked_in_at = TODAY_7PM - timedelta(minutes=sdd.RNG.randint(0, 20))
        recorder = sdd.RNG.choice(recorders)
        await prisma.libraryvisit.create(
            data={
                "memberId": member.id,
                "recordedById": recorder.id,
                "checkedInAt": checked_in_at,
                "createdAt": checked_in_at,
            }
        )
        created += 1
    return created


async def _top_up_member(member, books: list, issuers: list) -> None:
    # Books borrowed: two still active, one already returned on time.
    for outcome, days_ago in (("active", 3), ("active", 7), ("on_time", 12)):
        book = sdd.RNG.choice(books)
        borrowed_at = TODAY_7PM - timedelta(days=days_ago)
        data = {
            "bookId": book.id,
            "memberId": member.id,
            "borrowedAt": borrowed_at,
            "dueDate": borrowed_at + timedelta(days=LOAN_PERIOD_DAYS),
            "createdById": sdd.RNG.choice(issuers).id,
            "createdAt": borrowed_at,
        }
        if outcome == "on_time":
            data["returnedAt"] = borrowed_at + timedelta(days=6)
        await prisma.loan.create(data=data)

    # A late return with an outstanding (unpaid) fine.
    book = sdd.RNG.choice(books)
    borrowed_at = TODAY_7PM - timedelta(days=20)
    due_date = borrowed_at + timedelta(days=LOAN_PERIOD_DAYS)
    days_late = 4
    returned_at = due_date + timedelta(days=days_late)
    fine_amount = days_late * FINE_PER_DAY
    await prisma.loan.create(
        data={
            "bookId": book.id,
            "memberId": member.id,
            "borrowedAt": borrowed_at,
            "dueDate": due_date,
            "returnedAt": returned_at,
            "finePaid": False,
            "createdById": sdd.RNG.choice(issuers).id,
            "createdAt": borrowed_at,
        }
    )
    print(
        f"  Added 3 borrowed-book loans (2 active, 1 on-time) + 1 late loan"
        f" (₹{fine_amount} unpaid fine)."
    )

    # Leaderboard achievement: a real 7-day login streak. get_leaderboard's
    # compute_streaks counts backward from today, so 7 consecutive days ending today
    # crosses the >=7 threshold that unlocks the "7_day_streak" badge (+50 score).
    existing = await prisma.loginactivity.find_many(where={"memberId": member.id})
    existing_dates = {row.date.date() for row in existing}
    today = TODAY_7PM.date()
    added = 0
    for offset in range(7):
        day = today - timedelta(days=offset)
        if day in existing_dates:
            continue
        await prisma.loginactivity.create(
            data={"memberId": member.id, "date": datetime(day.year, day.month, day.day, tzinfo=UTC)}
        )
        added += 1
    print(
        f"  Added {added} login-activity day(s) — completes a 7-day streak"
        f" (unlocks the leaderboard's '7_day_streak' badge)."
    )


async def _seed_mtd_expenses(admin) -> int:
    mtd_start = TODAY_START.replace(day=1)
    await prisma.expense.delete_many(where={"createdAt": {"gte": mtd_start}})

    sample_expenses = [
        ("staffSalaries", 4200, 2),
        ("bookProcurement", 1800, 5),
        ("utilities", 650, 10),
        ("marketing", 450, 12),
    ]

    count = 0
    for category, amount, days_ago in sample_expenses:
        created_at = TODAY_7PM - timedelta(days=days_ago)
        if created_at < mtd_start:
            created_at = mtd_start + timedelta(hours=10)
        await prisma.expense.create(
            data={
                "category": category,
                "amount": amount,
                "loggedById": admin.id,
                "createdAt": created_at,
            }
        )
        await prisma.auditlogentry.create(
            data={
                "actorId": admin.id,
                "action": "expenseApproved",
                "metadata": Json({"category": category, "amount": amount}),
                "createdAt": created_at,
            }
        )
        count += 1
    return count


async def main() -> None:
    settings = get_settings()
    if settings.app_env not in sdd.SEEDABLE_ENVIRONMENTS:
        sys.exit(
            f"refusing to top up demo data with APP_ENV={settings.app_env!r} — "
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

        admin = await prisma.user.find_first(where={"role": {"name": Role.ADMIN}})
        if admin:
            exp_count = await _seed_mtd_expenses(admin)
            print(f"Seeded {exp_count} MTD expenses for active month.")

        existing_bookings = await prisma.seatbooking.find_many()
        used_slots: set[tuple] = set()
        for row in existing_bookings:
            day_iso = row.date.date().isoformat()
            used_slots.add((row.seatLabel, day_iso, row.hour))
            used_slots.add((row.memberId, day_iso, row.hour))

        seat_total = 0
        for round_num in range(1, SEAT_ROUNDS + 1):
            added = await _seat_activity_round(members, used_slots)
            seat_total += added
            print(f"Seat-activity round {round_num}/{SEAT_ROUNDS}: added {added} bookings.")

        today_added = await _fill_today_seats(members, used_slots)
        seat_total += today_added
        print(f"Filled today's ({TODAY_ISO}) seat utilization: added {today_added} bookings.")

        checkin_count = await _seed_checkins(members, issuers, CHECKIN_COUNT)
        print(f"Checked in {checkin_count} members as of 7 PM IST today.")

        target_member = await prisma.user.find_unique(where={"email": TARGET_MEMBER_EMAIL})
        if target_member is None:
            print(f"WARNING: {TARGET_MEMBER_EMAIL} not found — skipping member top-up.")
        else:
            print(f"Topping up {TARGET_MEMBER_EMAIL} ({target_member.fullName})...")
            await _top_up_member(target_member, books, issuers)

        print(f"\nDone. +{seat_total} seat bookings, +{checkin_count} check-ins.")
    finally:
        await prisma.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
