from typing import Annotated

from fastapi import APIRouter, Depends
from prisma.models import User

from app.api.deps import require_role
from app.core.constants import Role
from app.modules.pricing_plans import service
from app.modules.pricing_plans.schemas import PricingPlanOut, PricingPlanUpdate

router = APIRouter(prefix="/pricing-plans", tags=["pricing-plans"])

manage_plans = require_role(Role.ADMIN)


@router.get("", response_model=list[PricingPlanOut])
async def list_plans() -> list[PricingPlanOut]:
    return await service.list_plans()


@router.patch("/{plan_id}", response_model=PricingPlanOut)
async def update_plan(
    plan_id: str, payload: PricingPlanUpdate, user: Annotated[User, Depends(manage_plans)]
) -> PricingPlanOut:
    return await service.update_plan(plan_id, user.id, payload)
