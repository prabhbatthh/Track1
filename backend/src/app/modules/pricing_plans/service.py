from fastapi import HTTPException, status

from app.modules.audit_log import service as audit_log_service
from app.modules.audit_log.constants import AuditAction
from app.modules.pricing_plans import repository
from app.modules.pricing_plans.schemas import PricingPlanOut, PricingPlanUpdate


async def list_plans() -> list[PricingPlanOut]:
    rows = await repository.list_all()
    return [PricingPlanOut.from_prisma(row) for row in rows]


async def update_plan(plan_id: str, admin_id: str, payload: PricingPlanUpdate) -> PricingPlanOut:
    existing = await repository.find_by_id(plan_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    row = await repository.update(plan_id, price=payload.price, save_percent=payload.save_percent)
    await audit_log_service.record(
        actor_id=admin_id,
        action=AuditAction.PRICING_PLAN_UPDATED,
        metadata={"planId": row.planId, "price": row.price},
    )
    return PricingPlanOut.from_prisma(row)
