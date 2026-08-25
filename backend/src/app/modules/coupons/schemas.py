from datetime import datetime

from pydantic import BaseModel, Field


class CouponCreate(BaseModel):
    discount_percent: int = Field(gt=0, le=100)
    max_uses: int = Field(gt=0)


class CouponOut(BaseModel):
    id: str
    code: str
    discount_percent: int
    max_uses: int
    uses_count: int
    created_at: datetime

    @staticmethod
    def from_prisma(coupon) -> "CouponOut":
        return CouponOut(
            id=coupon.id,
            code=coupon.code,
            discount_percent=coupon.discountPercent,
            max_uses=coupon.maxUses,
            uses_count=coupon.usesCount,
            created_at=coupon.createdAt,
        )


class CouponValidationOut(BaseModel):
    code: str
    discount_percent: int
