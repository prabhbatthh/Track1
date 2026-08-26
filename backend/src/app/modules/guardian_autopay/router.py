from fastapi import APIRouter, Depends, HTTPException, status
from prisma.models import User

from app.api.deps import get_current_user
from app.core.constants import Role
from app.modules.guardian_autopay import service
from app.modules.guardian_autopay.schemas import (
    AutopayApproveRequest,
    AutopayApproveResponse,
    AutopayAutonomousResponse,
    AutopayDecisionResponse,
    AutopayEvaluateRequest,
    AutopayExecuteAutonomousRequest,
    AutopayPolicyOut,
    AutopayPolicyUpdate,
    AutopaySimulateTrustRequest,
    AutopayTrustStatusResponse,
)

router = APIRouter(prefix="/guardian/autopay", tags=["Guardian Auto-Pay"])


def _require_guardian_user(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role is None or current_user.role.name != Role.GUARDIAN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only guardian accounts are authorized to manage auto-pay policies",
        )
    return current_user


@router.get("/policy/{child_id}", response_model=AutopayPolicyOut)
async def get_policy(
    child_id: str,
    current_user: User = Depends(_require_guardian_user),
):
    """Retrieve Guardian Auto-Pay policy for a linked child."""
    return await service.get_or_create_policy(current_user.id, child_id)


@router.put("/policy/{child_id}", response_model=AutopayPolicyOut)
async def update_policy(
    child_id: str,
    payload: AutopayPolicyUpdate,
    current_user: User = Depends(_require_guardian_user),
):
    """Update Guardian Auto-Pay policy limits or enabled state."""
    return await service.update_policy(current_user.id, child_id, payload)


@router.post("/evaluate", response_model=AutopayDecisionResponse)
async def evaluate_charge(
    payload: AutopayEvaluateRequest,
    current_user: User = Depends(_require_guardian_user),
):
    """Read-only deterministic policy evaluation for fine charges."""
    if payload.guardian_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot evaluate policy for another guardian",
        )
    return await service.evaluate_autopay(payload)


@router.post("/approve", response_model=AutopayApproveResponse)
async def approve_and_create_order(
    payload: AutopayApproveRequest,
    current_user: User = Depends(_require_guardian_user),
):
    """Explicit Guardian Approval Consent Gate: Re-evaluates policy and creates bounded Razorpay order."""
    return await service.approve_and_create_autopay_order(current_user.id, payload)


@router.post("/execute-autonomous", response_model=AutopayAutonomousResponse)
async def execute_autonomous_settlement(
    payload: AutopayExecuteAutonomousRequest,
    current_user: User = Depends(_require_guardian_user),
):
    """Zero-click Autonomous Payment Execution Endpoint."""
    from app.db.prisma import prisma
    from app.modules.guardian import service as guardian_service

    loan = await prisma.loan.find_unique(where={"id": payload.loan_id})
    if loan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Loan record not found",
        )

    await guardian_service._find_child_or_403(current_user.id, loan.memberId)
    return await service.execute_autonomous_autopay(payload.loan_id, guardian_id=current_user.id)


@router.get("/demo-loans")
async def get_demo_loans(
    current_user: User = Depends(_require_guardian_user),
):
    """Retrieve or initialize deterministic demo loans for Guardian Auto-Pay simulator."""
    return await service.get_or_create_demo_loans(current_user.id)


@router.get("/trust-status", response_model=AutopayTrustStatusResponse)
async def get_trust_status(
    current_user: User = Depends(_require_guardian_user),
):
    """Retrieve current deterministic trust status and effective cap for guardian's linked child."""
    return await service.get_trust_status(current_user.id)


@router.post("/simulate-trust-history", response_model=AutopayTrustStatusResponse)
async def simulate_trust_history(
    payload: AutopaySimulateTrustRequest,
    current_user: User = Depends(_require_guardian_user),
):
    """Demo-only endpoint for live hackathon simulation of trust tier changes (e.g. late returns)."""
    return await service.simulate_trust_history(current_user.id, payload.action)




