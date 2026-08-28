from datetime import UTC, datetime, timedelta
import logging
from typing import Optional, Tuple

from fastapi import HTTPException, status

from app.core.config import get_settings
from app.db.prisma import prisma
from app.modules.audit_log import service as audit_log_service
from app.modules.guardian import service as guardian_service
from app.modules.guardian_autopay.schemas import (
    AutopayActivityItemOut,
    AutopayActivityResponse,
    AutopayApproveRequest,
    AutopayApproveResponse,
    AutopayAutonomousResponse,
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


async def get_guardian_active_policy(guardian_id: str) -> Optional[AutopayPolicyOut]:
    """Retrieve active Auto-Pay policy for the authenticated guardian."""
    children = await guardian_service.list_my_children(guardian_id)
    if not children:
        return None
    return await get_or_create_policy(guardian_id, children[0].id)


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


async def evaluate_autopay(
    request: AutopayEvaluateRequest,
    override_policy: Optional[AutopayPolicyOut] = None,
) -> AutopayDecisionResponse:
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

    policy = override_policy or await get_or_create_policy(request.guardian_id, request.child_id)

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


async def _simulate_gateway_capture(loan_id: str, amount: int) -> dict:
    """Internal helper performing server-side gateway payment capture.

    Can be mocked/patched in tests (e.g. patch("app.modules.guardian_autopay.service._simulate_gateway_capture"))
    to simulate payment gateway processing failures.
    """
    from uuid import uuid4
    return {
        "payment_id": f"pay_auto_{uuid4().hex[:16]}",
        "order_id": f"order_auto_{uuid4().hex[:16]}",
    }


class AutonomousGatewayAdapter:
    """Gateway abstraction for autonomous payment capture.

    Routes zero-click autonomous fine settlements through server-side gateway adapters while
    enforcing security rules:
    - Never exposes secret keys or live-mode credentials.
    - Prevents live Razorpay credentials (rzp_live_) from being used for autonomous demo execution.
    - Returns structured gateway capture metadata (payment_id, order_id, settlement_type).
    """

    @staticmethod
    async def capture_autonomous_payment(
        loan_id: str, amount: int, simulate_failure: bool = False
    ) -> dict[str, str]:
        settings = get_settings()

        # Security check: Live mode credentials must NEVER be used for autonomous demo execution
        if settings.razorpay_key_id and settings.razorpay_key_id.startswith("rzp_live_"):
            logger.critical("SECURITY VIOLATION: Live Razorpay key detected for autonomous execution attempt.")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Live Razorpay credentials cannot be used for autonomous execution",
            )

        if simulate_failure:
            raise RuntimeError("Simulated payment gateway processing timeout / network failure")

        capture = await _simulate_gateway_capture(loan_id, amount)
        capture["settlement_type"] = "autonomous_simulated"
        return capture


async def execute_autonomous_autopay(
    loan_id: str,
    guardian_id: Optional[str] = None,
    simulate_failure: bool = False,
    override_amount: Optional[int] = None,
) -> AutopayAutonomousResponse:
    """Execute zero-click server-side autonomous fine settlement for a pre-approved policy.

    1. Load loan & associated guardian/child link.
    2. Check idempotency: If fine is already paid, raise HTTP 409 Conflict.
    3. Calculate child's trust score dynamically and enforce guardian hard ceiling.
    4. Persist trust snapshot and audit tier changes if tier changed.
    5. Re-evaluate policy using effective transaction cap.
    6. Execute atomic transaction updating loan.finePaid = True and creating Payment record.
    7. Record audit log and return structured result.
    """
    from uuid import uuid4
    from app.modules.loans.constants import FINE_PER_DAY
    from app.modules.guardian_autopay.schemas import AutopayAutonomousResponse
    from app.modules.guardian_autopay.trust_scoring import calculate_trust_tier

    # 1. Load loan record
    loan = await prisma.loan.find_unique(
        where={"id": loan_id},
        include={"book": True, "member": True},
    )
    if loan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Loan record not found",
        )

    # 2. Idempotency check: Already settled loans return HTTP 409 Conflict
    if loan.finePaid:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Fine charge has already been paid",
        )

    # Find guardian linked to child
    link = await prisma.guardianlink.find_first(
        where={"memberId": loan.memberId}
    )
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Member is not linked to any guardian",
        )

    if guardian_id is not None and link.guardianId != guardian_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Member is not linked to this guardian",
        )

    # 3. Calculate authoritative fine amount from server DB
    now = datetime.now(UTC)
    end = loan.returnedAt or now
    days_late = max(0, (end.date() - loan.dueDate.date()).days)
    authoritative_amount = override_amount if override_amount is not None else (days_late * FINE_PER_DAY)

    if authoritative_amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fine amount is currently owed on this loan",
        )

    # 4. Trust Ladder calculation & hard ceiling enforcement
    trust_result = await calculate_trust_tier(loan.memberId)

    base_policy_out = await get_or_create_policy(link.guardianId, loan.memberId)
    policy_record = await prisma.guardianautopaypolicy.find_unique(
        where={"guardianLinkId": link.id}
    )

    guardian_hard_ceiling = policy_record.perTransactionCap
    theoretical_cap = int(guardian_hard_ceiling * trust_result.multiplier)
    effective_cap = min(theoretical_cap, guardian_hard_ceiling)

    prev_tier = policy_record.currentTrustTier or "BASELINE"
    prev_effective_cap = policy_record.effectiveTransactionCap or guardian_hard_ceiling
    tier_changed = (trust_result.tier != prev_tier)

    child_name = loan.member.fullName if (loan.member and loan.member.fullName) else "your child"

    if tier_changed:
        if trust_result.tier == "HIGH" and theoretical_cap > guardian_hard_ceiling:
            reason_msg = (
                f"Trust tier HIGH ({trust_result.on_time_rate * 100:.0f}%, {trust_result.on_time_returns}/{trust_result.sample_size}), "
                f"theoretical cap ₹{theoretical_cap}, but guardian hard ceiling ₹{guardian_hard_ceiling} limits effective cap to ₹{effective_cap}."
            )
        else:
            reason_msg = (
                f"Effective cap adjusted from ₹{prev_effective_cap} to ₹{effective_cap} — "
                f"child on-time return rate {trust_result.on_time_rate * 100:.0f}% ({trust_result.on_time_returns}/{trust_result.sample_size}), "
                f"trust tier: {trust_result.tier}"
            )

        try:
            await audit_log_service.record(
                actor_id=link.guardianId,
                action="GUARDIAN_AUTOPAY_TRUST_TIER_CHANGED",
                metadata={
                    "guardian_id": link.guardianId,
                    "child_id": loan.memberId,
                    "child_name": child_name,
                    "loan_id": loan.id,
                    "previous_trust_tier": prev_tier,
                    "new_trust_tier": trust_result.tier,
                    "on_time_return_rate": trust_result.on_time_rate,
                    "on_time_returns": trust_result.on_time_returns,
                    "total_returns": trust_result.total_returns,
                    "sample_size": trust_result.sample_size,
                    "multiplier": trust_result.multiplier,
                    "guardian_per_transaction_cap": guardian_hard_ceiling,
                    "theoretical_cap": theoretical_cap,
                    "previous_effective_cap": prev_effective_cap,
                    "new_effective_cap": effective_cap,
                    "reason": reason_msg,
                },
            )
        except Exception as exc:
            logger.error("Failed to record GUARDIAN_AUTOPAY_TRUST_TIER_CHANGED audit log: %s", exc)

    # Update policy record snapshot in database
    try:
        await prisma.guardianautopaypolicy.update(
            where={"id": policy_record.id},
            data={
                "currentTrustTier": trust_result.tier,
                "effectiveTransactionCap": effective_cap,
                "lastTrustScoreUpdatedAt": now,
            },
        )
    except Exception as exc:
        if "Unique constraint" in str(exc) or "database is locked" in str(exc).lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Autonomous payment transaction already in progress or completed",
            )
        raise

    # 5. Re-evaluate policy strictly using effective_cap before autonomous capture
    effective_policy = AutopayPolicyOut(
        id=base_policy_out.id,
        guardian_id=base_policy_out.guardian_id,
        member_id=base_policy_out.member_id,
        enabled=base_policy_out.enabled,
        per_transaction_cap=effective_cap,
        monthly_spending_cap=base_policy_out.monthly_spending_cap,
        allowed_charge_types=base_policy_out.allowed_charge_types,
    )

    eval_req = AutopayEvaluateRequest(
        guardian_id=link.guardianId,
        child_id=loan.memberId,
        charge_type="fine",
        amount=authoritative_amount,
        charge_id=loan.id,
    )
    decision = await evaluate_autopay(eval_req, override_policy=effective_policy)

    if not decision.allowed:
        child_name = loan.member.fullName if (loan.member and loan.member.fullName) else "your child"
        reason_lower = decision.reason.lower()
        is_overcap = ("per-transaction cap" in reason_lower) or ("monthly spending cap" in reason_lower)

        if "per-transaction cap" in reason_lower:
            cap_val = decision.transaction_cap or 200
            notif_msg = f"Auto-Pay blocked: ₹{authoritative_amount:,} fine for {child_name} exceeds your ₹{cap_val:,} per-transaction limit."
            reason_code = "TRANSACTION_CAP_EXCEEDED"
        elif "monthly spending cap" in reason_lower:
            cap_val = decision.monthly_cap or 1000
            notif_msg = f"Auto-Pay blocked: ₹{authoritative_amount:,} fine for {child_name} would exceed your ₹{cap_val:,} monthly Auto-Pay limit."
            reason_code = "MONTHLY_CAP_EXCEEDED"
        else:
            notif_msg = f"Auto-Pay blocked: ₹{authoritative_amount:,} fine for {child_name} - {decision.reason}"
            reason_code = "POLICY_REJECTED"

        # Record audit log specifically for over-cap rejections
        if is_overcap:
            try:
                await audit_log_service.record(
                    actor_id=link.guardianId,
                    action="GUARDIAN_AUTOPAY_BLOCKED_OVERCAP",
                    metadata={
                        "guardian_id": link.guardianId,
                        "child_id": loan.memberId,
                        "child_name": child_name,
                        "loan_id": loan.id,
                        "amount": authoritative_amount,
                        "per_transaction_cap": decision.transaction_cap,
                        "monthly_spending_cap": decision.monthly_cap,
                        "monthly_spent": decision.monthly_spent,
                        "policy_decision": decision.allowed,
                        "reason": decision.reason,
                        "reason_code": reason_code,
                    },
                )
            except Exception as exc:
                logger.error("Failed to record GUARDIAN_AUTOPAY_BLOCKED_OVERCAP audit log: %s", exc)

        try:
            from app.modules.notifications import service as notifications_service
            await notifications_service.create_notification(
                user_id=link.guardianId,
                type_="fine-reminder",
                message=notif_msg,
            )
        except Exception as exc:
            logger.error("Failed to create guardian notification on autopay rejection: %s", exc)

        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Auto-Pay policy evaluation rejected: {decision.reason}",
        )

    # 5. Perform server-side autonomous payment capture via Gateway Abstraction
    try:
        capture = await AutonomousGatewayAdapter.capture_autonomous_payment(
            loan.id, authoritative_amount, simulate_failure=simulate_failure
        )
        simulated_payment_id = capture["payment_id"]
        simulated_order_id = capture["order_id"]
        settlement_type = capture.get("settlement_type", "autonomous_simulated")
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Autonomous gateway payment capture failed: %s", exc)
        child_name = loan.member.fullName if (loan.member and loan.member.fullName) else "your child"
        try:
            await audit_log_service.record(
                actor_id=link.guardianId,
                action="GUARDIAN_AUTOPAY_AUTONOMOUS_FAILED",
                metadata={
                    "guardian_id": link.guardianId,
                    "child_id": loan.memberId,
                    "child_name": child_name,
                    "loan_id": loan.id,
                    "amount": authoritative_amount,
                    "trust_tier": trust_result.tier,
                    "effective_transaction_cap": effective_cap,
                    "monthly_spending_cap": base_policy_out.monthly_spending_cap,
                    "failure_reason": str(exc),
                    "settlement_type": "autonomous_simulated",
                },
            )
        except Exception as audit_exc:
            logger.error("Failed to record GUARDIAN_AUTOPAY_AUTONOMOUS_FAILED audit: %s", audit_exc)

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Autonomous payment capture failed: {exc}",
        )

    label = f"Guardian Auto-Pay Fine Settlement: {loan.book.title}"

    # Atomic transaction ensuring loan status and payment record stay in sync
    try:
        async with prisma.tx() as tx:
            updated_count = await tx.loan.update_many(
                where={"id": loan.id, "finePaid": False},
                data={"finePaid": True},
            )
            if updated_count == 0:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Fine charge has already been paid",
                )
            payment = await tx.payment.create(
                data={
                    "userId": loan.memberId,
                    "amount": authoritative_amount,
                    "label": label,
                    "status": "success",
                    "razorpayPaymentId": simulated_payment_id,
                    "razorpayOrderId": simulated_order_id,
                }
            )
    except HTTPException:
        raise
    except Exception as exc:
        # Check if the loan was settled concurrently by checking DB state
        fresh_loan = await prisma.loan.find_unique(where={"id": loan.id})
        if fresh_loan and fresh_loan.finePaid:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Fine charge has already been paid",
            )
        logger.error("Database transaction error during autonomous settlement: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database transaction error: {exc}",
        )

    # Audit logging for successful execution
    child_name = loan.member.fullName if (loan.member and loan.member.fullName) else "your child"
    try:
        await audit_log_service.record(
            actor_id=link.guardianId,
            action="GUARDIAN_AUTOPAY_AUTONOMOUS_EXECUTED",
            metadata={
                "guardian_id": link.guardianId,
                "child_id": loan.memberId,
                "child_name": child_name,
                "loan_id": loan.id,
                "amount": authoritative_amount,
                "payment_id": payment.id,
                "razorpay_payment_id": simulated_payment_id,
                "razorpay_order_id": simulated_order_id,
                "per_transaction_cap": decision.transaction_cap,
                "monthly_spending_cap": decision.monthly_cap,
                "monthly_spent": decision.monthly_spent,
                "settlement_type": settlement_type,
            },
        )
    except Exception as exc:
        logger.error("Failed to record GUARDIAN_AUTOPAY_AUTONOMOUS_EXECUTED audit: %s", exc)

    return AutopayAutonomousResponse(
        success=True,
        payment_id=payment.id,
        razorpay_payment_id=simulated_payment_id,
        razorpay_order_id=simulated_order_id,
        amount=authoritative_amount,
        loan_id=loan.id,
        member_id=loan.memberId,
        guardian_id=link.guardianId,
        label=label,
    )


async def get_demo_loans(guardian_id: str):
    """Retrieve fine loans for Guardian Auto-Pay demo UI without creating records (READ-ONLY)."""
    from datetime import timedelta
    from app.modules.guardian_autopay.schemas import AutopayDemoLoansResponse

    link = await prisma.guardianlink.find_first(
        where={"guardianId": guardian_id},
        include={"member": True},
    )
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No linked child account found for this guardian",
        )

    child_id = link.memberId
    child_name = link.member.fullName if (link.member and link.member.fullName) else "Child Member"
    policy = await get_or_create_policy(guardian_id, child_id)

    now = datetime.now(UTC)
    unpaid_loans = await prisma.loan.find_many(
        where={"memberId": child_id, "finePaid": False, "returnedAt": None}
    )

    within_cap_loan = None
    over_cap_loan = None

    for loan in unpaid_loans:
        days_late = max(0, (now.date() - loan.dueDate.date()).days)
        amt = days_late * 50
        if amt > 0 and amt <= policy.per_transaction_cap and within_cap_loan is None:
            within_cap_loan = loan
        elif amt > policy.per_transaction_cap and over_cap_loan is None:
            over_cap_loan = loan

    return AutopayDemoLoansResponse(
        within_cap_loan_id=within_cap_loan.id if within_cap_loan else "demo-loan-within-150",
        within_cap_amount=150,
        over_cap_loan_id=over_cap_loan.id if over_cap_loan else "demo-loan-over-250",
        over_cap_amount=250,
        child_id=child_id,
        child_name=child_name,
        per_transaction_cap=policy.per_transaction_cap,
        monthly_spending_cap=policy.monthly_spending_cap,
    )


async def reset_demo_loans(guardian_id: str):
    """Explicit user action to create or reset deterministic fine loans for Guardian Auto-Pay demo UI."""
    from datetime import timedelta
    from app.modules.guardian_autopay.schemas import AutopayDemoLoansResponse

    link = await prisma.guardianlink.find_first(
        where={"guardianId": guardian_id},
        include={"member": True},
    )
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No linked child account found for this guardian",
        )

    child_id = link.memberId
    child_name = link.member.fullName if (link.member and link.member.fullName) else "Child Member"
    policy = await get_or_create_policy(guardian_id, child_id)

    book = await prisma.book.find_first()
    if not book:
        book = await prisma.book.create(
            data={"title": "Library Fine Demo Book", "author": "Demo Author", "category": "Fiction"}
        )

    now = datetime.now(UTC)
    due_3_days_ago = now - timedelta(days=3)
    due_5_days_ago = now - timedelta(days=5)

    # Delete prior unpaid demo loans to guarantee fresh deterministic fine amounts
    await prisma.loan.delete_many(
        where={"memberId": child_id, "finePaid": False, "returnedAt": None}
    )

    within_cap_loan = await prisma.loan.create(
        data={
            "memberId": child_id,
            "bookId": book.id,
            "createdById": guardian_id,
            "dueDate": due_3_days_ago,
            "finePaid": False,
        }
    )

    over_cap_loan = await prisma.loan.create(
        data={
            "memberId": child_id,
            "bookId": book.id,
            "createdById": guardian_id,
            "dueDate": due_5_days_ago,
            "finePaid": False,
        }
    )

    return AutopayDemoLoansResponse(
        within_cap_loan_id=within_cap_loan.id,
        within_cap_amount=150,
        over_cap_loan_id=over_cap_loan.id,
        over_cap_amount=250,
        child_id=child_id,
        child_name=child_name,
        per_transaction_cap=policy.per_transaction_cap,
        monthly_spending_cap=policy.monthly_spending_cap,
    )


get_or_create_demo_loans = get_demo_loans



async def get_trust_status(guardian_id: str):
    """Retrieve current deterministic trust status and effective cap for the linked child."""
    from app.modules.guardian_autopay.schemas import AutopayTrustStatusResponse
    from app.modules.guardian_autopay.trust_scoring import calculate_trust_tier

    link = await prisma.guardianlink.find_first(
        where={"guardianId": guardian_id},
        include={"member": True},
    )
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No linked child account found for this guardian",
        )

    child_id = link.memberId
    child_name = link.member.fullName if (link.member and link.member.fullName) else "Child Member"
    policy_out = await get_or_create_policy(guardian_id, child_id)
    policy_record = await prisma.guardianautopaypolicy.find_unique(
        where={"guardianLinkId": link.id}
    )

    trust_result = await calculate_trust_tier(child_id)
    guardian_hard_ceiling = policy_record.perTransactionCap
    theoretical_cap = int(guardian_hard_ceiling * trust_result.multiplier)
    effective_cap = min(theoretical_cap, guardian_hard_ceiling)
    rate_pct = round(trust_result.on_time_rate * 100, 1)

    if trust_result.sample_size == 0:
        reasoning = (
            f"No returned book history yet. Trust tier: BASELINE. Multiplier: 1.0x. "
            f"Effective cap remains ₹{guardian_hard_ceiling}."
        )
    elif trust_result.tier == "HIGH":
        reasoning = (
            f"{trust_result.on_time_returns} of the last {trust_result.sample_size} returned books were on time ({rate_pct:.0f}%). "
            f"Trust tier: HIGH. Multiplier: 1.2x. Theoretical cap: ₹{theoretical_cap}. "
            f"Guardian hard ceiling limits autonomous payments to ₹{guardian_hard_ceiling}."
        )
    elif trust_result.tier == "BASELINE":
        reasoning = (
            f"{trust_result.on_time_returns} of the last {trust_result.sample_size} returned books were on time ({rate_pct:.0f}%). "
            f"Trust tier: BASELINE. Multiplier: 1.0x. Effective cap remains ₹{guardian_hard_ceiling}."
        )
    else:  # LOW
        reasoning = (
            f"{trust_result.on_time_returns} of the last {trust_result.sample_size} returned books were on time ({rate_pct:.0f}%). "
            f"Trust tier: LOW. Multiplier: 0.7x. Effective cap reduced to ₹{effective_cap}."
        )

    last_updated = (
        policy_record.lastTrustScoreUpdatedAt.isoformat()
        if policy_record.lastTrustScoreUpdatedAt
        else None
    )

    return AutopayTrustStatusResponse(
        child_id=child_id,
        child_name=child_name,
        trust_tier=trust_result.tier,
        on_time_return_rate=rate_pct,
        on_time_returns=trust_result.on_time_returns,
        total_returns=trust_result.total_returns,
        sample_size=trust_result.sample_size,
        multiplier=trust_result.multiplier,
        guardian_per_transaction_cap=guardian_hard_ceiling,
        theoretical_cap=theoretical_cap,
        effective_transaction_cap=effective_cap,
        last_updated_at=last_updated,
        reasoning=reasoning,
    )


async def simulate_trust_history(guardian_id: str, action: str):
    """Demo-only endpoint to simulate a trust history change (e.g. late returns) live for hackathon judging."""
    from datetime import timedelta
    from app.modules.guardian_autopay.trust_scoring import calculate_trust_tier

    link = await prisma.guardianlink.find_first(
        where={"guardianId": guardian_id},
        include={"member": True},
    )
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No linked child account found for this guardian",
        )

    child_id = link.memberId
    book = await prisma.book.find_first()
    if not book:
        book = await prisma.book.create(
            data={"title": "Demo Return Book", "author": "Author", "category": "Fiction"}
        )

    now = datetime.now(UTC)

    if action in ["simulate_late_return", "late"]:
        # Delete prior demo returned loans first
        await prisma.loan.delete_many(
            where={"memberId": child_id, "returnedAt": {"not": None}}
        )
        # Create 10 late returned loans -> 0% rate -> LOW trust (multiplier 0.7)
        for i in range(10):
            due = now - timedelta(days=40 - i)
            returned = due + timedelta(days=5)  # 5 days late
            await prisma.loan.create(
                data={
                    "memberId": child_id,
                    "bookId": book.id,
                    "createdById": guardian_id,
                    "dueDate": due,
                    "returnedAt": returned,
                    "finePaid": True,
                }
            )
    elif action in ["simulate_responsible_history", "responsible"]:
        # Delete prior demo returned loans first
        await prisma.loan.delete_many(
            where={"memberId": child_id, "returnedAt": {"not": None}}
        )
        # Create 10 on-time returned loans -> 100% rate -> HIGH trust (multiplier 1.2)
        for i in range(10):
            due = now - timedelta(days=40 - i)
            returned = due  # on time
            await prisma.loan.create(
                data={
                    "memberId": child_id,
                    "bookId": book.id,
                    "createdById": guardian_id,
                    "dueDate": due,
                    "returnedAt": returned,
                    "finePaid": True,
                }
            )
    elif action in ["restore", "reset"]:
        # Delete demo returned loans -> 0 returned loans -> BASELINE trust (multiplier 1.0)
        await prisma.loan.delete_many(
            where={"memberId": child_id, "returnedAt": {"not": None}}
        )
        # Reset policy state and cap to default
        await prisma.guardianautopaypolicy.update(
            where={"guardianLinkId": link.id},
            data={"enabled": True, "perTransactionCap": 200},
        )
        # Clear demo payments so monthly spend is clean on trust reset
        await prisma.payment.delete_many(
            where={"userId": child_id, "label": {"contains": "Auto-Pay"}}
        )

    # Recalculate trust & update policy snapshot
    trust_res = await calculate_trust_tier(child_id)
    policy_rec = await prisma.guardianautopaypolicy.find_unique(where={"guardianLinkId": link.id})
    prev_tier = policy_rec.currentTrustTier or "BASELINE"
    prev_eff = policy_rec.effectiveTransactionCap or policy_rec.perTransactionCap
    new_eff = min(int(policy_rec.perTransactionCap * trust_res.multiplier), policy_rec.perTransactionCap)

    await prisma.guardianautopaypolicy.update(
        where={"guardianLinkId": link.id},
        data={
            "currentTrustTier": trust_res.tier,
            "effectiveTransactionCap": new_eff,
            "lastTrustScoreUpdatedAt": now,
        },
    )

    if prev_tier != trust_res.tier or prev_eff != new_eff:
        from app.modules.audit_log import service as audit_log_service
        try:
            await audit_log_service.record(
                actor_id=guardian_id,
                action="GUARDIAN_AUTOPAY_TRUST_TIER_CHANGED",
                metadata={
                    "guardian_id": guardian_id,
                    "child_id": child_id,
                    "previous_trust_tier": prev_tier,
                    "new_trust_tier": trust_res.tier,
                    "previous_effective_cap": prev_eff,
                    "new_effective_cap": new_eff,
                    "on_time_return_rate": trust_res.on_time_rate,
                    "multiplier": trust_res.multiplier,
                    "guardian_per_transaction_cap": policy_rec.perTransactionCap,
                    "reason": f"Simulated demo adjustment ({action})",
                },
            )
        except Exception as exc:
            logger.error("Failed to record GUARDIAN_AUTOPAY_TRUST_TIER_CHANGED audit log: %s", exc)

    return await get_trust_status(guardian_id)


async def get_activity_history(guardian_id: str) -> AutopayActivityResponse:
    """Retrieve formatted activity history for Guardian Auto-Pay UI (READ-ONLY)."""
    children = await guardian_service.list_my_children(guardian_id)
    child_map = {c.id: getattr(c, 'full_name', getattr(c, 'fullName', 'Child')) for c in children}
    child_ids = set(child_map.keys())

    entries = await prisma.auditlogentry.find_many(
        where={
            "action": {
                "in": [
                    "GUARDIAN_AUTOPAY_AUTONOMOUS_EXECUTED",
                    "GUARDIAN_AUTOPAY_BLOCKED_OVERCAP",
                    "GUARDIAN_AUTOPAY_VERIFIED",
                ]
            },
            "OR": [
                {"actorId": guardian_id},
                {"actorId": {"in": list(child_ids)}} if child_ids else {"actorId": "none"},
            ],
        },
        order={"createdAt": "desc"},
        take=20,
    )

    activity_items: list[AutopayActivityItemOut] = []
    for entry in entries:
        meta = entry.metadata if isinstance(entry.metadata, dict) else {}
        g_id = str(meta.get("guardian_id") or "")
        c_id = str(meta.get("child_id") or meta.get("member_id") or "")

        if entry.actorId != guardian_id and g_id != guardian_id and c_id not in child_ids:
            continue

        c_name = child_map.get(c_id) or meta.get("child_name") or "Child"
        amount = int(meta.get("amount") or 0)
        cap = meta.get("per_transaction_cap") or meta.get("effective_cap") or meta.get("cap") or 200

        timestamp = entry.createdAt.isoformat() if entry.createdAt else datetime.now(UTC).isoformat()

        if entry.action == "GUARDIAN_AUTOPAY_AUTONOMOUS_EXECUTED":
            activity_items.append(
                AutopayActivityItemOut(
                    id=entry.id,
                    type="autonomous_paid",
                    title="Automatically paid",
                    badge="AI Auto-Pay",
                    description="Paid via AI Auto-Pay",
                    amount=amount,
                    child_name=c_name,
                    timestamp=timestamp,
                )
            )
        elif entry.action == "GUARDIAN_AUTOPAY_VERIFIED":
            activity_items.append(
                AutopayActivityItemOut(
                    id=entry.id,
                    type="guardian_approved",
                    title="Guardian approved payment",
                    badge="Manual approval",
                    description="Paid after AI limit review",
                    amount=amount,
                    child_name=c_name,
                    timestamp=timestamp,
                )
            )
        elif entry.action == "GUARDIAN_AUTOPAY_BLOCKED_OVERCAP":
            activity_items.append(
                AutopayActivityItemOut(
                    id=entry.id,
                    type="blocked",
                    title="Payment blocked",
                    badge="Blocked & Notified",
                    description=f"Exceeded ₹{cap} Auto-Pay limit · Guardian notified",
                    amount=amount,
                    child_name=c_name,
                    timestamp=timestamp,
                )
            )

    return AutopayActivityResponse(items=activity_items)


async def admin_simulate_trust_history(action: str):
    """Admin Judge Demo endpoint to simulate child return history and observe live trust engine recalculations."""
    link = await prisma.guardianlink.find_first()
    if not link:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No linked demo guardian found",
        )

    guardian_id = link.guardianId
    child_id = link.memberId

    internal_action = "restore"
    if action in ["responsible", "simulate_responsible_history"]:
        internal_action = "simulate_responsible_history"
    elif action in ["late", "simulate_late_return"]:
        internal_action = "simulate_late_return"
    elif action in ["reset", "restore"]:
        internal_action = "restore"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown trust simulation action '{action}'. Supported: responsible, late, reset",
        )

    policy_before = await prisma.guardianautopaypolicy.find_unique(where={"guardianLinkId": link.id})
    prev_tier = policy_before.currentTrustTier or "BASELINE"
    prev_cap = policy_before.effectiveTransactionCap or policy_before.perTransactionCap

    # Execute simulation against the real trust engine
    trust_status = await simulate_trust_history(guardian_id, internal_action)

    policy_after = await prisma.guardianautopaypolicy.find_unique(where={"guardianLinkId": link.id})
    new_tier = policy_after.currentTrustTier or "BASELINE"
    new_cap = policy_after.effectiveTransactionCap or policy_after.perTransactionCap

    # Record specific Admin Judge Simulation Audit Log
    try:
        await audit_log_service.record(
            actor_id=guardian_id,
            action="GUARDIAN_AUTOPAY_TRUST_SIMULATED",
            metadata={
                "guardian_id": guardian_id,
                "child_id": child_id,
                "action": internal_action,
                "previous_trust_tier": prev_tier,
                "new_trust_tier": new_tier,
                "previous_effective_cap": prev_cap,
                "new_effective_cap": new_cap,
                "on_time_return_rate": trust_status.on_time_return_rate,
                "multiplier": trust_status.multiplier,
                "reason": f"Judge Trust Simulation ({action}) applied live",
            },
        )
    except Exception as exc:
        logger.error("Failed to record GUARDIAN_AUTOPAY_TRUST_SIMULATED audit log: %s", exc)

    return {
        "status": "SIMULATED",
        "action": action,
        "previous_trust_tier": prev_tier,
        "new_trust_tier": new_tier,
        "previous_effective_cap": prev_cap,
        "new_effective_cap": new_cap,
        "multiplier": trust_status.multiplier,
        "on_time_return_rate": trust_status.on_time_return_rate,
        "effective_transaction_cap": trust_status.effective_transaction_cap,
        "reasoning": trust_status.reasoning,
        "message": f"Trust Simulation applied: {prev_tier} ({prev_cap}) → {new_tier} ({new_cap})",
    }


async def update_admin_autopay_demo_policy(
    enabled: Optional[bool] = None,
    per_transaction_cap: Optional[int] = None,
):
    """Admin Judge Demo endpoint to interactively modify demo guardian policy state and cap."""
    link = await prisma.guardianlink.find_first()
    if not link:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No linked demo guardian found",
        )

    guardian_id = link.guardianId
    child_id = link.memberId

    policy_before = await prisma.guardianautopaypolicy.find_unique(where={"guardianLinkId": link.id})
    if not policy_before:
        policy_before = await prisma.guardianautopaypolicy.create(
            data={
                "guardianLinkId": link.id,
                "enabled": True,
                "perTransactionCap": 200,
                "monthlySpendingCap": 1000,
                "allowedChargeTypes": ["fine"],
                "currentTrustTier": "BASELINE",
                "effectiveTransactionCap": 200,
            }
        )

    prev_enabled = policy_before.enabled
    prev_cap = policy_before.perTransactionCap
    new_enabled = enabled if enabled is not None else prev_enabled
    new_cap = per_transaction_cap if per_transaction_cap is not None else prev_cap

    # Recalculate effective cap from current trust multiplier
    from app.modules.guardian_autopay.trust_scoring import calculate_trust_tier
    trust_res = await calculate_trust_tier(child_id)
    theoretical = int(new_cap * trust_res.multiplier)
    # Hard ceiling is 200
    hard_ceiling = 200
    new_effective = min(theoretical, new_cap, hard_ceiling)

    updated_policy = await prisma.guardianautopaypolicy.update(
        where={"guardianLinkId": link.id},
        data={
            "enabled": new_enabled,
            "perTransactionCap": new_cap,
            "effectiveTransactionCap": new_effective,
            "updatedAt": datetime.now(UTC),
        },
    )

    # Record Audit Log
    try:
        details_list = []
        if prev_enabled != new_enabled:
            details_list.append(f"enabled: {prev_enabled} → {new_enabled}")
        if prev_cap != new_cap:
            details_list.append(f"perTransactionCap: ₹{prev_cap} → ₹{new_cap}")

        change_desc = ", ".join(details_list) if details_list else "Policy refreshed"

        await audit_log_service.record(
            actor_id=guardian_id,
            action="GUARDIAN_AUTOPAY_DEMO_POLICY_CHANGED",
            metadata={
                "guardian_id": guardian_id,
                "child_id": child_id,
                "previous_enabled": prev_enabled,
                "new_enabled": new_enabled,
                "previous_per_transaction_cap": prev_cap,
                "new_per_transaction_cap": new_cap,
                "effective_transaction_cap": new_effective,
                "details": change_desc,
                "reason": f"Judge Policy Control applied ({change_desc})",
            },
        )
    except Exception as exc:
        logger.error("Failed to record GUARDIAN_AUTOPAY_DEMO_POLICY_CHANGED audit log: %s", exc)

    return {
        "status": "UPDATED",
        "enabled": updated_policy.enabled,
        "per_transaction_cap": updated_policy.perTransactionCap,
        "effective_transaction_cap": new_effective,
        "trust_tier": updated_policy.currentTrustTier,
        "multiplier": trust_res.multiplier,
        "theoretical_cap": theoretical,
        "hard_safety_ceiling": hard_ceiling,
        "message": f"Demo policy updated: enabled={new_enabled}, cap=₹{new_cap} (effective: ₹{new_effective})",
    }


async def get_admin_autopay_demo_overview():
    """Retrieve comprehensive demo child trust & safety diagnostics for Admin Judge Demo Controls."""
    link = await prisma.guardianlink.find_first(
        include={"member": True, "guardian": True}
    )
    if not link:
        return {
            "has_child": False,
            "child_name": "Not available",
            "child_id": "Not available",
            "guardian_name": "Not available",
            "guardian_id": "Not available",
            "enabled": True,
            "trust_tier": "BASELINE",
            "multiplier": 1.0,
            "on_time_return_rate": 0.0,
            "on_time_returns": 0,
            "total_returns": 0,
            "sample_size": 0,
            "per_transaction_cap": 200,
            "monthly_spending_cap": 1000,
            "effective_transaction_cap": 200,
            "theoretical_cap": 200,
            "hard_safety_ceiling": 200,
            "explanation": "The effective autonomous cap is the amount the AI is currently permitted to settle automatically. The hard ceiling cannot be exceeded.",
        }

    guardian_id = link.guardianId
    child_id = link.memberId
    child_name = "Demo Child"
    guardian_name = "Demo Guardian"

    policy_rec = await get_or_create_policy(guardian_id, child_id)
    trust_status = await get_trust_status(guardian_id)
    demo_loans = await get_demo_loans(guardian_id)

    theoretical_cap = int(policy_rec.per_transaction_cap * trust_status.multiplier)
    hard_ceiling = 200
    effective_cap = min(theoretical_cap, policy_rec.per_transaction_cap, hard_ceiling)

    monthly_spent = await calculate_monthly_autopay_spend(child_id)
    monthly_cap = policy_rec.monthly_spending_cap
    remaining_monthly_authority = max(0, monthly_cap - monthly_spent)

    return {
        "has_child": True,
        "child_name": child_name,
        "child_id": child_id,
        "guardian_name": guardian_name,
        "guardian_id": guardian_id,
        "enabled": policy_rec.enabled,
        "trust_tier": trust_status.trust_tier,
        "multiplier": trust_status.multiplier,
        "on_time_return_rate": trust_status.on_time_return_rate,
        "on_time_returns": trust_status.on_time_returns,
        "total_returns": trust_status.total_returns,
        "sample_size": trust_status.sample_size,
        "per_transaction_cap": policy_rec.per_transaction_cap,
        "monthly_spending_cap": monthly_cap,
        "monthly_spent": monthly_spent,
        "remaining_monthly_authority": remaining_monthly_authority,
        "effective_transaction_cap": effective_cap,
        "theoretical_cap": theoretical_cap,
        "hard_safety_ceiling": hard_ceiling,
        "within_cap_loan_id": demo_loans.within_cap_loan_id,
        "within_cap_amount": demo_loans.within_cap_amount,
        "over_cap_loan_id": demo_loans.over_cap_loan_id,
        "over_cap_amount": demo_loans.over_cap_amount,
        "explanation": "The effective autonomous cap is the minimum of theoretical trust authority, guardian-configured limit, and hard ceiling.",
    }


async def simulate_admin_autopay_demo_monthly_spend(action: str):
    """Simulate monthly spending state (e.g. ₹900 spend out of ₹1000 cap) for Admin Judge Controls."""
    link = await prisma.guardianlink.find_first()
    if not link:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No linked demo guardian found",
        )

    child_id = link.memberId

    if action == "simulate_900":
        await prisma.payment.delete_many(
            where={"userId": child_id, "label": {"contains": "Auto-Pay"}}
        )
        now = datetime.now(UTC)
        await prisma.payment.create(
            data={
                "userId": child_id,
                "amount": 900,
                "status": "success",
                "label": "Auto-Pay Demo Cumulative Spend",
                "createdAt": now,
            }
        )
        await audit_log_service.record(
            actor_id=link.guardianId,
            action="GUARDIAN_AUTOPAY_DEMO_MONTHLY_SIMULATED",
            metadata={
                "simulated_spend": 900,
                "monthly_cap": 1000,
                "remaining_authority": 100,
                "child_id": child_id,
                "reason": "Simulated ₹900 existing monthly spend for Demo Child",
            },
        )
        monthly_spent = await calculate_monthly_autopay_spend(child_id)
        return {
            "status": "SIMULATED",
            "monthly_spent": monthly_spent,
            "monthly_spending_cap": 1000,
            "remaining_authority": max(0, 1000 - monthly_spent),
            "message": f"✓ Simulated ₹{monthly_spent} existing monthly spend. Remaining monthly authority: ₹{max(0, 1000 - monthly_spent)}.",
        }

    elif action == "reset":
        await prisma.payment.delete_many(
            where={"userId": child_id, "label": {"contains": "Auto-Pay"}}
        )
        await audit_log_service.record(
            actor_id=link.guardianId,
            action="GUARDIAN_AUTOPAY_DEMO_MONTHLY_RESET",
            metadata={
                "monthly_spent": 0,
                "monthly_cap": 1000,
                "remaining_authority": 1000,
                "child_id": child_id,
                "reason": "Reset monthly spend to ₹0 for Demo Child",
            },
        )
        return {
            "status": "RESET",
            "monthly_spent": 0,
            "monthly_spending_cap": 1000,
            "remaining_authority": 1000,
            "message": "✓ Monthly spending reset to ₹0. Remaining monthly authority: ₹1000.",
        }

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown monthly spend action '{action}'. Supported: simulate_900, reset",
        )


async def simulate_admin_autopay_demo_scenario(scenario: str, amount: Optional[int] = None):
    """Execute bounded or custom payment demo scenario for Admin Judge Demo Controls."""
    link = await prisma.guardianlink.find_first()
    if not link:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No linked demo guardian found",
        )

    guardian_id = link.guardianId
    demo_loans = await reset_demo_loans(guardian_id)

    if scenario == "custom" or (amount is not None and scenario not in ["within_limit", "boundary_100", "over_monthly_101", "over_limit", "simulate_failure"]):
        if amount is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Custom fine amount is required for custom scenario",
            )
        if not isinstance(amount, int) or amount <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Custom fine amount must be a positive integer greater than ₹0",
            )

        try:
            res = await execute_autonomous_autopay(
                demo_loans.within_cap_loan_id, guardian_id=guardian_id, override_amount=amount
            )
            return {
                "status": "EXECUTED",
                "badge": "AUTONOMOUS PAYMENT EXECUTED",
                "amount": amount,
                "policy": f"Custom fine evaluated (₹{amount})",
                "result": "Payment recorded",
                "audit": "Created",
                "payment_id": res.payment_id,
                "razorpay_payment_id": res.razorpay_payment_id,
                "razorpay_order_id": res.razorpay_order_id,
                "message": f"✓ Autonomous payment of ₹{amount} executed successfully.",
            }
        except HTTPException as exc:
            if exc.status_code == status.HTTP_400_BAD_REQUEST and ("Custom fine amount" in str(exc.detail) or "No linked" in str(exc.detail)):
                raise
            return {
                "status": "BLOCKED",
                "badge": "AUTONOMOUS PAYMENT BLOCKED",
                "amount": amount,
                "reason": exc.detail,
                "result": "No payment execution",
                "guardian_notification": "Created",
                "audit": "Created",
                "message": f"✕ Autonomous payment blocked: {exc.detail}",
            }

    if scenario == "within_limit":
        try:
            res = await execute_autonomous_autopay(demo_loans.within_cap_loan_id, guardian_id=guardian_id)
            return {
                "status": "EXECUTED",
                "badge": "AUTONOMOUS PAYMENT EXECUTED",
                "amount": res.amount,
                "policy": "Within limit",
                "result": "Payment recorded",
                "audit": "Created",
                "payment_id": res.payment_id,
                "razorpay_payment_id": res.razorpay_payment_id,
                "razorpay_order_id": res.razorpay_order_id,
                "message": f"✓ Autonomous payment of ₹{res.amount} executed successfully.",
            }
        except HTTPException as exc:
            if exc.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY or exc.status_code == status.HTTP_400_BAD_REQUEST:
                return {
                    "status": "BLOCKED",
                    "badge": "AUTONOMOUS PAYMENT BLOCKED",
                    "amount": 150,
                    "reason": exc.detail,
                    "result": "No payment execution",
                    "guardian_notification": "Created",
                    "audit": "Created",
                    "message": f"✕ Autonomous payment blocked: {exc.detail}",
                }
            return {
                "status": "FAILED",
                "badge": "ERROR",
                "amount": 150,
                "policy": "Error",
                "result": exc.detail,
                "audit": "Created",
                "message": str(exc.detail),
            }

    elif scenario == "boundary_100":
        try:
            now = datetime.now(UTC)
            due_2_days_ago = now - timedelta(days=2)
            book = await prisma.book.find_first()
            loan = await prisma.loan.create(
                data={
                    "memberId": link.memberId,
                    "bookId": book.id if book else demo_loans.within_cap_loan_id,
                    "createdById": guardian_id,
                    "dueDate": due_2_days_ago,
                    "finePaid": False,
                }
            )
            res = await execute_autonomous_autopay(loan.id, guardian_id=guardian_id, override_amount=100)
            return {
                "status": "EXECUTED",
                "badge": "AUTONOMOUS PAYMENT EXECUTED",
                "amount": 100,
                "policy": "Exact monthly boundary (₹900 + ₹100 = ₹1000)",
                "result": "Payment recorded",
                "audit": "Created",
                "payment_id": res.payment_id,
                "razorpay_payment_id": res.razorpay_payment_id,
                "razorpay_order_id": res.razorpay_order_id,
                "message": "✓ Autonomous payment of ₹100 executed successfully.",
            }
        except HTTPException as exc:
            return {
                "status": "BLOCKED",
                "badge": "AUTONOMOUS PAYMENT BLOCKED",
                "amount": 100,
                "reason": exc.detail,
                "result": "No payment execution",
                "guardian_notification": "Created",
                "audit": "Created",
                "message": f"✕ Autonomous payment blocked: {exc.detail}",
            }

    elif scenario == "over_monthly_101":
        try:
            res = await execute_autonomous_autopay(
                demo_loans.within_cap_loan_id, guardian_id=guardian_id, override_amount=101
            )
            return {
                "status": "EXECUTED_UNEXPECTEDLY",
                "badge": "UNEXPECTED SUCCESS",
                "amount": 101,
                "message": "Payment executed unexpectedly",
            }
        except HTTPException as exc:
            return {
                "status": "BLOCKED",
                "badge": "AUTONOMOUS PAYMENT BLOCKED",
                "amount": 101,
                "reason": exc.detail,
                "result": "No payment execution",
                "guardian_notification": "Created",
                "audit": "Created",
                "message": f"✕ Autonomous payment blocked: {exc.detail}",
            }

    elif scenario == "over_limit":
        try:
            res = await execute_autonomous_autopay(demo_loans.over_cap_loan_id, guardian_id=guardian_id)
            return {
                "status": "EXECUTED_UNEXPECTEDLY",
                "badge": "UNEXPECTED SUCCESS",
                "amount": res.amount,
                "policy": "Over limit",
                "result": "Payment recorded unexpectedly",
                "audit": "Created",
                "message": "Payment executed unexpectedly",
            }
        except HTTPException as exc:
            return {
                "status": "BLOCKED",
                "badge": "AUTONOMOUS PAYMENT BLOCKED",
                "amount": demo_loans.over_cap_amount,
                "reason": exc.detail,
                "result": "No payment execution",
                "guardian_notification": "Created",
                "audit": "Created",
                "message": f"✕ Autonomous payment blocked: {exc.detail}",
            }

    elif scenario == "simulate_failure":
        try:
            await execute_autonomous_autopay(
                demo_loans.within_cap_loan_id, guardian_id=guardian_id, simulate_failure=True
            )
            return {
                "status": "EXECUTED_UNEXPECTEDLY",
                "badge": "UNEXPECTED SUCCESS",
                "amount": 150,
                "result": "Payment recorded unexpectedly",
                "message": "Payment executed unexpectedly",
            }
        except HTTPException as exc:
            return {
                "status": "GATEWAY_FAILURE",
                "badge": "PAYMENT FAILED SAFELY",
                "amount": 150,
                "result": "Payment not recorded",
                "fine_status": "Unchanged",
                "audit": "Failure recorded",
                "message": f"⚠ Payment failed safely: {exc.detail}",
            }

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown scenario '{scenario}'. Supported: within_limit, boundary_100, over_monthly_101, over_limit, custom, simulate_failure",
        )


async def get_admin_autopay_demo_audit_trail():
    """Retrieve real Prisma audit trail entries for AI Auto-Pay events."""
    entries = await prisma.auditlogentry.find_many(
        where={
            "action": {
                "in": [
                    "GUARDIAN_AUTOPAY_AUTONOMOUS_EXECUTED",
                    "GUARDIAN_AUTOPAY_BLOCKED_OVERCAP",
                    "GUARDIAN_AUTOPAY_AUTONOMOUS_FAILED",
                    "GUARDIAN_AUTOPAY_DEMO_POLICY_CHANGED",
                    "GUARDIAN_AUTOPAY_TRUST_SIMULATED",
                    "GUARDIAN_AUTOPAY_TRUST_TIER_CHANGED",
                    "GUARDIAN_AUTOPAY_POLICY_UPDATED",
                    "GUARDIAN_AUTOPAY_POLICY_CREATED",
                    "GUARDIAN_AUTOPAY_APPROVED",
                    "GUARDIAN_AUTOPAY_REJECTED",
                    "GUARDIAN_AUTOPAY_DEMO_MONTHLY_SIMULATED",
                    "GUARDIAN_AUTOPAY_DEMO_MONTHLY_RESET",
                ]
            }
        },
        order={"createdAt": "desc"},
        take=50,
    )

    items = []
    for entry in entries:
        meta = entry.metadata if isinstance(entry.metadata, dict) else {}
        items.append(
            {
                "id": entry.id,
                "timestamp": entry.createdAt.isoformat() if entry.createdAt else "",
                "action": entry.action,
                "actor_id": entry.actorId,
                "amount": meta.get("amount"),
                "child_id": meta.get("child_id") or meta.get("member_id"),
                "child_name": "Demo Child",
                "result": "APPROVED" if "EXECUTED" in entry.action or "APPROVED" in entry.action else "BLOCKED" if "BLOCKED" in entry.action or "REJECTED" in entry.action else "FAILED" if "FAILED" in entry.action else "INFO",
                "reason": meta.get("reason") or meta.get("failure_reason") or meta.get("reason_code"),
            }
        )
    return {"items": items}





