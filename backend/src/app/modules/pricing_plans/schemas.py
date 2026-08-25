from datetime import datetime

from pydantic import BaseModel, Field


class PricingPlanOut(BaseModel):
    id: str
    plan_id: str
    months: int
    price: int
    save_percent: int
    badge: str | None
    updated_at: datetime

    @staticmethod
    def from_prisma(plan) -> "PricingPlanOut":
        return PricingPlanOut(
            id=plan.id,
            plan_id=plan.planId,
            months=plan.months,
            price=plan.price,
            save_percent=plan.savePercent,
            badge=plan.badge,
            updated_at=plan.updatedAt,
        )


class PricingPlanUpdate(BaseModel):
    price: int = Field(gt=0)
    save_percent: int = Field(ge=0, le=100)
