from prisma import Prisma
from prisma.models import Coupon

from app.db.prisma import prisma

LIST_LIMIT = 200


async def list_all() -> list[Coupon]:
    return await prisma.coupon.find_many(order={"createdAt": "desc"}, take=LIST_LIMIT)


async def find_by_code(code: str, *, client: Prisma | None = None) -> Coupon | None:
    db = client or prisma
    return await db.coupon.find_unique(where={"code": code})


async def create(*, code: str, discount_percent: int, max_uses: int, created_by_id: str) -> Coupon:
    return await prisma.coupon.create(
        data={
            "code": code,
            "discountPercent": discount_percent,
            "maxUses": max_uses,
            "createdById": created_by_id,
        }
    )


async def increment_uses(coupon_id: str) -> Coupon:
    return await prisma.coupon.update(where={"id": coupon_id}, data={"usesCount": {"increment": 1}})


async def increment_uses_if_available(coupon_id: str, *, client: Prisma) -> bool:
    changed = await client.execute_raw(
        """UPDATE coupons
           SET uses_count = uses_count + 1
           WHERE id = $1::uuid AND uses_count < max_uses""",
        coupon_id,
    )
    return changed == 1
