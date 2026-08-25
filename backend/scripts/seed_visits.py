"""Seed demo library visit data.

Creates:
- 8 members currently checked in (no checked_out_at)
- ~30 historical visits from the past 7 days (already checked out)

Idempotent: skips entirely if active visits already exist.
"""

import asyncio
import random
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from prisma import Prisma


async def main() -> None:
    db = Prisma()
    await db.connect()

    try:
        # Idempotency check — skip if active visits already exist
        existing = await db.libraryvisit.count(where={"checkedOutAt": None})
        if existing > 0:
            print(f"visits already seeded ({existing} active), skipping")
            return

        # Pick a staff member to be the recorder
        staff = await db.user.find_first(
            where={"role": {"is": {"name": {"in": ["manager", "librarian", "admin"]}}}}
        )
        if staff is None:
            print("no staff found, skipping visit seed")
            return

        # Pick members to seed visits for
        members = await db.user.find_many(
            where={"role": {"is": {"name": "member"}}, "isActive": True},
            take=40,
            order={"createdAt": "asc"},
        )
        if not members:
            print("no members found, skipping visit seed")
            return

        random.shuffle(members)
        now = datetime.now(UTC)

        # ── Currently checked in (8 members, checked in 15–90 mins ago) ──
        currently_in = members[:8]
        for i, member in enumerate(currently_in):
            checked_in_at = now - timedelta(minutes=15 + i * 10)
            await db.libraryvisit.create(
                data={
                    "memberId": member.id,
                    "recordedById": staff.id,
                    "checkedInAt": checked_in_at,
                }
            )

        # ── Historical visits over the past 7 days (already checked out) ──
        historical_members = members[8:38] if len(members) >= 38 else members[8:]
        for member in historical_members:
            days_ago = random.randint(0, 6)
            checked_in_at = now - timedelta(
                days=days_ago, hours=random.randint(1, 4), minutes=random.randint(0, 59)
            )
            duration_minutes = random.randint(30, 180)
            checked_out_at = checked_in_at + timedelta(minutes=duration_minutes)
            # Don't create a future checkout
            if checked_out_at > now:
                checked_out_at = now - timedelta(minutes=5)
            await db.libraryvisit.create(
                data={
                    "memberId": member.id,
                    "recordedById": staff.id,
                    "checkedInAt": checked_in_at,
                    "checkedOutAt": checked_out_at,
                }
            )

        active_count = await db.libraryvisit.count(where={"checkedOutAt": None})
        total_count = await db.libraryvisit.count()
        print(f"seeded {total_count} visits ({active_count} currently active)")

    finally:
        await db.disconnect()


asyncio.run(main())
