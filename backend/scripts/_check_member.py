import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from app.core.config import get_settings  # noqa: E402
from app.db.prisma import prisma  # noqa: E402


async def main():
    settings = get_settings()
    os.environ.setdefault("DATABASE_URL", settings.database_url)
    await prisma.connect()
    try:
        user = await prisma.user.find_unique(where={"email": "member0316@seed-demo.example.com"})
        print(user)
        total_members = await prisma.user.count(
            where={"email": {"endswith": "@seed-demo.example.com"}}
        )
        print("total seed-demo users:", total_members)
        seats = await prisma.seatbooking.count()
        print("total seat bookings:", seats)
        visits = await prisma.libraryvisit.count()
        print("total library visits:", visits)
    finally:
        await prisma.disconnect()


asyncio.run(main())
