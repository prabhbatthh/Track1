from fastapi import APIRouter, Depends, HTTPException, status
from prisma.models import User

from app.api.deps import get_current_user
from app.core.constants import Role
from app.modules.guardian_autopay import service
from app.modules.guardian_autopay.schemas import (
    AutopayApproveRequest,
    AutopayApproveResponse,
    AutopayDecisionResponse,
    AutopayEvaluateRequest,
    AutopayPolicyOut,
    AutopayPolicyUpdate,
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
    """Explicit Guardian Approval Consent Gate: Re-evaluates policy and creates bounded Razorpay order.

    Requires guardian authentication & verified GuardianLink relationship.
    Authoritative amount is derived strictly from PostgreSQL Loan record.
    Extra client-supplied financial fields are forbidden by Pydantic schema validation.
    """
    return await service.approve_and_create_autopay_order(current_user.id, payload)
