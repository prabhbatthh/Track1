from typing import Annotated

from fastapi import APIRouter, Depends
from prisma.models import User

from app.api.deps import get_current_user
from app.modules.agent_upsell.schemas import (
    AIAuditTrailResponse,
    AIFineSavingsEvaluateResponse,
    AgentCheckoutApproveOut,
    AgentCheckoutApproveRequest,
    AgentCheckoutProposalOut,
    AgentCheckoutProposalRequest,
    UpsellAcceptRequest,
    UpsellAcceptResponse,
    UpsellEvaluateRequest,
    UpsellEvaluateResponse,
)
from app.modules.agent_upsell.service import (
    accept_upsell,
    approve_checkout_proposal,
    create_checkout_proposal,
    evaluate_fine_savings,
    evaluate_upsell,
    get_audit_trail,
)

router = APIRouter(tags=["Agent Commerce"])


@router.post(
    "/agent/checkout/proposal",
    response_model=AgentCheckoutProposalOut,
    summary="Create a server-validated checkout proposal for an AI recommendation",
)
async def create_agent_checkout_proposal(
    payload: AgentCheckoutProposalRequest,
    user: Annotated[User, Depends(get_current_user)],
) -> AgentCheckoutProposalOut:
    """Create a server-authoritative checkout proposal with price locking, savings calculation, and 15-minute TTL."""
    return await create_checkout_proposal(user, payload)


@router.post(
    "/agent/checkout/approve",
    response_model=AgentCheckoutApproveOut,
    summary="Explicit human member approval gate for a checkout proposal",
)
async def approve_agent_checkout_proposal(
    payload: AgentCheckoutApproveRequest,
    user: Annotated[User, Depends(get_current_user)],
) -> AgentCheckoutApproveOut:
    """Explicit human approval step converting a proposal to an APPROVED Razorpay payment order."""
    return await approve_checkout_proposal(user, payload)


@router.post(
    "/agent/upsell/evaluate",
    response_model=UpsellEvaluateResponse,
    summary="Evaluate membership upgrade opportunities with server-bounded prices and AI rationale",
)
async def evaluate_agent_upsell(
    payload: UpsellEvaluateRequest,
    user: Annotated[User, Depends(get_current_user)],
) -> UpsellEvaluateResponse:
    """Evaluate whether a higher-value membership plan is a sensible upgrade."""
    return await evaluate_upsell(payload, user)


@router.post(
    "/agent/fine-savings/evaluate",
    response_model=AIFineSavingsEvaluateResponse,
    summary="Evaluate available member discounts and savings for outstanding fine payment",
)
async def evaluate_agent_fine_savings(
    user: Annotated[User, Depends(get_current_user)],
) -> AIFineSavingsEvaluateResponse:
    """Evaluate available server-authoritative coupon discounts for member's outstanding fines."""
    return await evaluate_fine_savings(user)


@router.post(
    "/agent/upsell/accept",
    response_model=UpsellAcceptResponse,
    summary="Accept an AI-recommended membership upgrade and create a server-authoritative Razorpay order",
)
async def accept_agent_upsell(
    payload: UpsellAcceptRequest,
    user: Annotated[User, Depends(get_current_user)],
) -> UpsellAcceptResponse:
    """Accept an explicit upgrade recommendation and create a server-bounded Razorpay order."""
    return await accept_upsell(payload, user)


@router.get(
    "/agent/upsell/audit",
    response_model=AIAuditTrailResponse,
    summary="Fetch structured AI decision audit trail entries for the member",
)
async def get_agent_upsell_audit(
    user: Annotated[User, Depends(get_current_user)],
) -> AIAuditTrailResponse:
    """Fetch structured, append-only AI decision audit records correlated for the member."""
    return await get_audit_trail(user)



