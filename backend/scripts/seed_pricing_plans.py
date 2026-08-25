"""Seeds the 4 fixed pricing plans (1m/3m/6m/12m) that the public Pricing page and
Payment page read prices from (see pricing_plans module). Rows are never created or
deleted through the API — admins only ever adjust price/save_percent on existing rows.

The baseline rows now also ship as a migration (see
prisma/migrations/20260808000000_seed_pricing_plans), so every environment that runs
`prisma migrate deploy` has them regardless of whether this script is ever run. This
script remains useful for resetting months/badge back to defaults on an existing
database without touching admin-edited price/save_percent.

Run from backend/: `uv run python scripts/seed_pricing_plans.py`
Safe to re-run — upserts by plan_id, so it only resets months/badge back to defaults
(price/savePercent edits made via the admin UI are intentionally left untouched).
"""

import asyncio
import os

from app.core.config import get_settings
from app.db.prisma import prisma

PLANS = [
    {"planId": "1m", "months": 1, "price": 999, "savePercent": 0, "badge": None},
    {"planId": "3m", "months": 3, "price": 2697, "savePercent": 10, "badge": "mostPopular"},
    {"planId": "6m", "months": 6, "price": 4915, "savePercent": 18, "badge": None},
    {"planId": "12m", "months": 12, "price": 8991, "savePercent": 25, "badge": "bestValue"},
]


async def main() -> None:
    settings = get_settings()
    os.environ.setdefault("DATABASE_URL", settings.database_url)
    await prisma.connect()

    try:
        for plan in PLANS:
            await prisma.pricingplan.upsert(
                where={"planId": plan["planId"]},
                data={
                    "create": plan,
                    "update": {"months": plan["months"], "badge": plan["badge"]},
                },
            )
            print(f"Seeded plan {plan['planId']}")
    finally:
        await prisma.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
