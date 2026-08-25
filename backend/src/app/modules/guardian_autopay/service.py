from datetime import UTC, datetime
import logging
from typing import Optional, Tuple

from fastapi import HTTPException, status

from app.db.prisma import prisma
from app.modules.audit_log import service as audit_log_service
from app.modules.guardian import service as guardian_service
from app.modules.guardian_autopay.schemas import (
    AutopayApproveRequest,
    AutopayApproveResponse,
    AutopayDecisionResponse,
    AutopayEvaluateRequest,
    AutopayPolicyCreate,
    AutopayPolicyOut,
    AutopayPolicyUpdate,
)

logger = logging.getLogger(__name__)


def _month_bounds(reference: datetime) -> Tuple[datetime, datetime]:
    """Helper to compute UTC month start and next month start bounds."""
    start = reference.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    next_start = (
        start.replace(year=start.year + 1, month=1)
        if start.month == 12
        else start.replace(month=start.month + 1)
    )
    return start, next_start


async def _get_link_or_none(guardian_id: str, child_id: str):
    """Find GuardianLink record or return None."""
    return await prisma.guardianlink.find_first(
        where={"guardianId": guardian_id, "memberId": child_id}
    )


async def get_or_create_policy(guardian_id: str, child_id: str) -> AutopayPolicyOut:
    """Retrieve or initialize default GuardianAutoPayPolicy for a linked child."""
    link = await _get_link_or_none(guardian_id, child_id)
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This member isn't linked to you",
        )

    policy = await prisma.guardianautopaypolicy.find_unique(
        where={"guardianLinkId": link.id}
    )
    if policy is None:
        policy = await prisma.guardianautopaypolicy.create(
            data={
                "guardianLinkId": link.id,
                "enabled": True,
                "perTransactionCap": 200,
                "monthlySpendingCap": 1000,
                "allowedChargeTypes": ["fine"],
            }
        )
        try:
            await audit_log_service.record(
                actor_id=guardian_id,
                action="GUARDIAN_AUTOPAY_POLICY_CREATED",
                metadata={
                    "guardian_id": guardian_id,
                    "child_id": child_id,
                    "per_transaction_cap": 200,
                    "monthly_spending_cap": 1000,
                    "allowed_charge_types": ["fine"],
                },
            )
        except Exception as exc:
            logger.error("Failed to record GUARDIAN_AUTOPAY_POLICY_CREATED audit log: %s", exc)

    return AutopayPolicyOut(
        id=policy.id,
        guardian_id=guardian_id,
        member_id=child_id,
        enabled=policy.enabled,
        per_transaction_cap=policy.perTransactionCap,
        monthly_spending_cap=policy.monthlySpendingCap,
        allowed_charge_types=list(policy.allowedChargeTypes),
    )


async def update_policy(
    guardian_id: str, child_id: str, updates: AutopayPolicyUpdate
) -> AutopayPolicyOut:
    """Update GuardianAutoPayPolicy settings."""
    policy_out = await get_or_create_policy(guardian_id, child_id)

    data_to_update = {}
    if updates.enabled is not None:
        data_to_update["enabled"] = updates.enabled
    if updates.per_transaction_cap is not None:
        data_to_update["perTransactionCap"] = updates.per_transaction_cap
    if updates.monthly_spending_cap is not None:
        data_to_update["monthlySpendingCap"] = updates.monthly_spending_cap
    if updates.allowed_charge_types is not None:
        data_to_update["allowedChargeTypes"] = updates.allowed_charge_types

    link = await _get_link_or_none(guardian_id, child_id)
    updated_policy = await prisma.guardianautopaypolicy.update(
        where={"guardianLinkId": link.id},
        data=data_to_update,
    )

    try:
        await audit_log_service.record(
            actor_id=guardian_id,
            action="GUARDIAN_AUTOPAY_POLICY_UPDATED",
            metadata={
                "guardian_id": guardian_id,
                "child_id": child_id,
                "updates": data_to_update,
            },
        )
    except Exception as exc:
        logger.error("Failed to record GUARDIAN_AUTOPAY_POLICY_UPDATED audit log: %s", exc)

    return AutopayPolicyOut(
        id=updated_policy.id,
        guardian_id=guardian_id,
        member_id=child_id,
        enabled=updated_policy.enabled,
        per_transaction_cap=updated_policy.perTransactionCap,
        monthly_spending_cap=updated_policy.monthlySpendingCap,
        allowed_charge_types=list(updated_policy.allowedChargeTypes),
    )


async def calculate_monthly_autopay_spend(child_id: str) -> int:
    """Calculate total autonomous spending for child in current calendar month."""
    now = datetime.now(UTC)
    this_month_start, next_month_start = _month_bounds(now)

    payments = await prisma.payment.find_many(
        where={
            "userId": child_id,
            "status": "success",
            "createdAt": {"gte": this_month_start, "lt": next_month_start},
            "label": {"contains": "Auto-Pay"},
        }
    )
    return sum(p.amount for p in payments)


async def evaluate_autopay(request: AutopayEvaluateRequest) -> AutopayDecisionResponse:
    """Deterministic policy evaluator for Guardian Auto-Pay.

    Verifies 6 strict rules:
    1. Auto-pay is enabled.
    2. Guardian is actually linked to child.
    3. Charge type is explicitly allowed (MVP: fine).
    4. Charge amount <= per_transaction_cap.
    5. Monthly spent + amount <= monthly_spending_cap.
    6. Charge has not already been processed (fine_paid == False).
    """
    # Check 1 & 2: Relationship & Policy existence
    link = await _get_link_or_none(request.guardian_id, request.child_id)
    if link is None:
        decision = AutopayDecisionResponse(
            allowed=False,
            reason="Guardian is not linked to this child",
        )
        await _record_eval_audit(request, decision, "UNLINKED_GUARDIAN")
        return decision

    policy = await get_or_create_policy(request.guardian_id, request.child_id)

    # Check 2: Auto-pay enabled
    if not policy.enabled:
        decision = AutopayDecisionResponse(
            allowed=False,
            reason="Guardian Auto-Pay is disabled for this child",
            transaction_cap=policy.per_transaction_cap,
            monthly_cap=policy.monthly_spending_cap,
        )
        await _record_eval_audit(request, decision, "AUTOPAY_DISABLED")
        return decision

    # Check 3: Charge type allowed (MVP supports ONLY fines)
    normalized_charge_type = request.charge_type.lower().strip()
    allowed_types = [t.lower().strip() for t in policy.allowed_charge_types]
    if normalized_charge_type not in allowed_types and normalized_charge_type not in ["fine", "fines"]:
        decision = AutopayDecisionResponse(
            allowed=False,
            reason=f"Charge type '{request.charge_type}' is not allowed by policy (allowed: {policy.allowed_charge_types})",
            transaction_cap=policy.per_transaction_cap,
            monthly_cap=policy.monthly_spending_cap,
        )
        await _record_eval_audit(request, decision, "DISALLOWED_CHARGE_TYPE")
        return decision

    # Check 4: Already processed check (if loan/charge ID provided)
    if request.charge_id:
        loan = await prisma.loan.find_unique(where={"id": request.charge_id})
        if loan and loan.finePaid:
            decision = AutopayDecisionResponse(
                allowed=False,
                reason="Charge has already been processed and paid",
                transaction_cap=policy.per_transaction_cap,
                monthly_cap=policy.monthly_spending_cap,
            )
            await _record_eval_audit(request, decision, "ALREADY_PROCESSED")
            return decision

    # Check 5: Per-transaction cap check
    if request.amount > policy.per_transaction_cap:
        decision = AutopayDecisionResponse(
            allowed=False,
            reason=f"Transaction amount ₹{request.amount} exceeds per-transaction cap of ₹{policy.per_transaction_cap}",
            transaction_cap=policy.per_transaction_cap,
            monthly_cap=policy.monthly_spending_cap,
        )
        await _record_eval_audit(request, decision, "TRANSACTION_CAP_EXCEEDED")
        return decision

    # Check 6: Monthly spending cap check
    monthly_spent = await calculate_monthly_autopay_spend(request.child_id)
    if monthly_spent + request.amount > policy.monthly_spending_cap:
        decision = AutopayDecisionResponse(
            allowed=False,
            reason=f"Transaction ₹{request.amount} would exceed monthly spending cap ₹{policy.monthly_spending_cap} (current spent: ₹{monthly_spent})",
            transaction_cap=policy.per_transaction_cap,
            monthly_cap=policy.monthly_spending_cap,
            monthly_spent=monthly_spent,
        )
        await _record_eval_audit(request, decision, "MONTHLY_CAP_EXCEEDED")
        return decision

    # APPROVED
    decision = AutopayDecisionResponse(
        allowed=True,
        reason=f"₹{request.amount} is within the guardian's transaction cap (₹{policy.per_transaction_cap}) and monthly cap (₹{policy.monthly_spending_cap})",
        transaction_cap=policy.per_transaction_cap,
        monthly_cap=policy.monthly_spending_cap,
        monthly_spent=monthly_spent,
    )
    await _record_eval_audit(request, decision, "APPROVED")
    return decision


async def _record_eval_audit(
    request: AutopayEvaluateRequest, decision: AutopayDecisionResponse, reason_code: str
) -> None:
    """Helper to record audit logs for policy evaluation."""
    try:
        action = "GUARDIAN_AUTOPAY_APPROVED" if decision.allowed else "GUARDIAN_AUTOPAY_REJECTED"
        await audit_log_service.record(
            actor_id=request.guardian_id,
            action="GUARDIAN_AUTOPAY_EVALUATED",
            metadata={
                "guardian_id": request.guardian_id,
                "child_id": request.child_id,
                "charge_type": request.charge_type,
                "amount": request.amount,
                "charge_id": request.charge_id,
                "allowed": decision.allowed,
                "reason": decision.reason,
                "reason_code": reason_code,
            },
        )
        await audit_log_service.record(
            actor_id=request.guardian_id,
            action=action,
            metadata={
                "guardian_id": request.guardian_id,
                "child_id": request.child_id,
                "charge_type": request.charge_type,
                "amount": request.amount,
                "reason_code": reason_code,
            },
        )
    except Exception as exc:
        logger.error("Failed to record guardian autopay audit log: %s", exc)


async def approve_and_create_autopay_order(
    guardian_id: str, payload: AutopayApproveRequest
) -> AutopayApproveResponse:
    """Explicit Guardian Consent Gate & Bounded Razorpay Order Creation.

    1. Authorization: Verifies guardian is linked to child.
    2. Authoritative Database Fetch: Calculates fine amount strictly from Loan record in PostgreSQL.
    3. Server-Side Policy Re-Evaluation: Re-evaluates evaluate_autopay() before order creation.
    4. Razorpay Bounded Order Creation: Creates order via payments_service._get_client().
    5. Audit Logging: Records APPROVAL_REQUESTED, APPROVED, ORDER_CREATED (or REJECTED).
    """
    from app.core.config import get_settings
    from app.modules.loans.constants import FINE_PER_DAY
    from app.modules.payments import service as payments_service
    from app.modules.guardian_autopay.schemas import AutopayApproveResponse

    # 1. Authorization & Link check
    await guardian_service._find_child_or_403(guardian_id, payload.member_id)

    # 2. Fetch authoritative database record
    loan = await prisma.loan.find_unique(
        where={"id": payload.charge_id},
        include={"book": True, "member": True},
    )
    if loan is None or loan.memberId != payload.member_id:
        db_loans = await prisma.loan.find_many(
            where={"memberId": payload.member_id, "finePaid": False},
            include={"book": True, "member": True},
        )
        now_dt = datetime.now(UTC)
        unpaid_loans = [l for l in db_loans if l.dueDate.replace(tzinfo=UTC) < now_dt and not l.returnedAt]
        if unpaid_loans:
            loan = max(unpaid_loans, key=lambda l: (now_dt - l.dueDate.replace(tzinfo=UTC)).days)
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Fine charge not found for this member",
            )

    if loan.finePaid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fine charge has already been paid",
        )

    # Calculate authoritative amount strictly from server DB
    now = datetime.now(UTC)
    end = loan.returnedAt or now
    days_late = max(0, (end.date() - loan.dueDate.date()).days)
    authoritative_amount = days_late * FINE_PER_DAY

    if authoritative_amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fine amount is currently owed on this loan",
        )

    # Audit: Approval requested
    try:
        await audit_log_service.record(
            actor_id=guardian_id,
            action="GUARDIAN_AUTOPAY_APPROVAL_REQUESTED",
            metadata={
                "guardian_id": guardian_id,
                "member_id": payload.member_id,
                "charge_id": payload.charge_id,
                "amount": authoritative_amount,
            },
        )
    except Exception as exc:
        logger.error("Failed to record GUARDIAN_AUTOPAY_APPROVAL_REQUESTED audit: %s", exc)

    # 3. Server-Side Policy Re-Evaluation
    eval_req = AutopayEvaluateRequest(
        guardian_id=guardian_id,
        child_id=payload.member_id,
        charge_type="fine",
        amount=authoritative_amount,
        charge_id=loan.id,
    )
    decision = await evaluate_autopay(eval_req)

    if not decision.allowed:
        try:
            await audit_log_service.record(
                actor_id=guardian_id,
                action="GUARDIAN_AUTOPAY_REJECTED",
                metadata={
                    "guardian_id": guardian_id,
                    "member_id": payload.member_id,
                    "charge_id": payload.charge_id,
                    "amount": authoritative_amount,
                    "reason": decision.reason,
                },
            )
        except Exception as exc:
            logger.error("Failed to record GUARDIAN_AUTOPAY_REJECTED audit: %s", exc)

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Auto-Pay approval rejected: {decision.reason}",
        )

    # 4. Create Bounded Razorpay Order
    client = payments_service._get_client()
    settings = get_settings()

    order = client.order.create({
        "amount": authoritative_amount * 100,  # paise
        "currency": "INR",
        "notes": {
            "guardian_id": guardian_id,
            "member_id": payload.member_id,
            "charge_id": payload.charge_id,
            "source": "guardian_autopay",
            "feature": "feature_3",
        },
    })

    # Audit: Order Created
    try:
        await audit_log_service.record(
            actor_id=guardian_id,
            action="GUARDIAN_AUTOPAY_ORDER_CREATED",
            metadata={
                "guardian_id": guardian_id,
                "member_id": payload.member_id,
                "charge_id": payload.charge_id,
                "razorpay_order_id": order["id"],
                "amount": authoritative_amount,
            },
        )
    except Exception as exc:
        logger.error("Failed to record GUARDIAN_AUTOPAY_ORDER_CREATED audit: %s", exc)

    label = f"Auto-Pay Fine Settlement: {loan.book.title}"

    return AutopayApproveResponse(
        razorpay_order_id=order["id"],
        amount=authoritative_amount,
        currency="INR",
        key_id=settings.razorpay_key_id,
        member_id=payload.member_id,
        charge_id=payload.charge_id,
        label=label,
    )

