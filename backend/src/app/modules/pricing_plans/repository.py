from prisma.models import PricingPlan

from app.db.prisma import prisma


async def list_all() -> list[PricingPlan]:
    return await prisma.pricingplan.find_many(order={"months": "asc"})


async def find_by_id(plan_id: str) -> PricingPlan | None:
    return await prisma.pricingplan.find_unique(where={"id": plan_id})


async def find_by_plan_code(plan_code: str) -> PricingPlan | None:
    return await prisma.pricingplan.find_unique(where={"planId": plan_code})


async def find_by_months(months: int) -> PricingPlan | None:
    return await prisma.pricingplan.find_first(where={"months": months})


async def update(plan_id: str, *, price: int, save_percent: int) -> PricingPlan:
    return await prisma.pricingplan.update(
        where={"id": plan_id}, data={"price": price, "savePercent": save_percent}
    )
