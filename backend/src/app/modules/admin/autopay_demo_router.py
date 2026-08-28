from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.api.deps import require_role
from app.core.constants import Role
from app.modules.guardian_autopay import service as guardian_autopay_service

router = APIRouter(prefix="/admin/autopay-demo", tags=["Admin Auto-Pay Judge Demo"])

# Strict Role Restriction: Admin and IT Head roles ONLY
_require_admin_or_it_head = Depends(require_role(Role.ADMIN, Role.IT_HEAD))


class AdminDemoSimulateRequest(BaseModel):
    scenario: str = Field(
        ...,
        description="Scenario to simulate: 'within_limit', 'boundary_100', 'over_monthly_101', 'over_limit', 'custom', or 'simulate_failure'",
    )
    amount: int | None = Field(
        None,
        description="Arbitrary custom fine amount in INR for scenario='custom'",
    )


class AdminDemoTrustSimulateRequest(BaseModel):
    action: str = Field(
        ...,
        description="Trust simulation action: 'responsible', 'late', or 'reset'",
    )


class AdminDemoPolicyUpdateRequest(BaseModel):
    enabled: bool | None = Field(None, description="Toggle Auto-Pay authorization state")
    per_transaction_cap: int | None = Field(None, description="Per-transaction limit in INR")


class AdminDemoMonthlySpendRequest(BaseModel):
    action: str = Field(
        ...,
        description="Monthly spend simulation action: 'simulate_900' or 'reset'",
    )


@router.get("/overview", dependencies=[_require_admin_or_it_head])
async def get_demo_overview():
    """Retrieve comprehensive demo child trust & safety diagnostics for Admin Judge Demo Controls."""
    return await guardian_autopay_service.get_admin_autopay_demo_overview()


@router.post("/simulate", dependencies=[_require_admin_or_it_head])
async def simulate_demo_scenario(payload: AdminDemoSimulateRequest):
    """Execute bounded or custom payment demo scenario for Admin Judge Demo Controls."""
    return await guardian_autopay_service.simulate_admin_autopay_demo_scenario(
        scenario=payload.scenario, amount=payload.amount
    )


@router.post("/simulate-trust", dependencies=[_require_admin_or_it_head])
async def simulate_demo_trust(payload: AdminDemoTrustSimulateRequest):
    """Simulate member return history to observe live trust engine recalculations for Admin Judge Demo Controls."""
    return await guardian_autopay_service.admin_simulate_trust_history(payload.action)


@router.post("/simulate-monthly-spend", dependencies=[_require_admin_or_it_head])
async def simulate_demo_monthly_spend(payload: AdminDemoMonthlySpendRequest):
    """Simulate monthly spending state (e.g. ₹900 spend out of ₹1000 cap) for Admin Judge Controls."""
    return await guardian_autopay_service.simulate_admin_autopay_demo_monthly_spend(payload.action)


@router.post("/update-policy", dependencies=[_require_admin_or_it_head])
async def update_demo_policy(payload: AdminDemoPolicyUpdateRequest):
    """Interactively modify demo guardian policy state and cap for Admin Judge Controls."""
    return await guardian_autopay_service.update_admin_autopay_demo_policy(
        enabled=payload.enabled, per_transaction_cap=payload.per_transaction_cap
    )


@router.get("/audit-trail", dependencies=[_require_admin_or_it_head])
async def get_demo_audit_trail():
    """Retrieve real Prisma audit trail entries for AI Auto-Pay events."""
    return await guardian_autopay_service.get_admin_autopay_demo_audit_trail()
