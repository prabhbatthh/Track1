"""Seed the minimal records required by browser layout contracts.

Run from backend/: ``uv run python scripts/seed_e2e_fixtures.py``.
The fixed unique keys make this safe to run repeatedly on a developer database.
"""

import asyncio
import os

from app.core.config import get_settings
from app.db.prisma import prisma

FIXTURE_DOMAIN = "e2e-fixture.internal"
FIXTURE_ISBN = "9780000000042"


async def main() -> None:
    settings = get_settings()
    os.environ.setdefault("DATABASE_URL", settings.database_url)
    await prisma.connect()

    try:
        member_role = await prisma.role.find_unique(where={"name": "member"})
        if member_role is None:
            raise RuntimeError("Seed role accounts before E2E fixtures")

        # Access-control pagination uses five rows per page. Six deterministic
        # members ensure its responsive controls are exercised on a fresh CI DB.
        for number in range(1, 7):
            email = f"member-{number}@{FIXTURE_DOMAIN}"
            await prisma.user.upsert(
                where={"email": email},
                data={
                    "create": {
                        "email": email,
                        "fullName": f"E2E Fixture Member {number}",
                        "roleId": member_role.id,
                    },
                    "update": {
                        "fullName": f"E2E Fixture Member {number}",
                        "roleId": member_role.id,
                        "isActive": True,
                        "deletedAt": None,
                    },
                },
            )

        # The responsive route audit includes real book detail and review pages.
        await prisma.book.upsert(
            where={"isbn": FIXTURE_ISBN},
            data={
                "create": {
                    "title": "E2E Responsive Layout Fixture",
                    "author": "ShelfSpace Test Suite",
                    "category": "Testing",
                    "isbn": FIXTURE_ISBN,
                    "description": "Stable content for browser layout contracts.",
                    "language": "English",
                    "totalCopies": 1,
                },
                "update": {
                    "deletedAt": None,
                    "totalCopies": 1,
                },
            },
        )
        print("Seeded minimal E2E layout fixtures")
    finally:
        await prisma.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
