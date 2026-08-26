import asyncio
from datetime import UTC, datetime
import logging
from typing import Any, List, Optional, Tuple

from fastapi import HTTPException, status
from langchain_core.messages import HumanMessage, SystemMessage
from prisma.models import User

from app.core.config import get_settings
from app.core.llm import build_chat_llm
from app.db.prisma import prisma
from app.modules.agent_upsell.schemas import (
    AIAuditRecord,
    AIAuditTrailResponse,
    GrowthPolicyDecision,
    MemberUsageSignals,
    UpsellAcceptRequest,
    UpsellAcceptResponse,
    UpsellEvaluateRequest,
    UpsellEvaluateResponse,
    UpsellPlanInfo,
)
from app.modules.audit_log import service as audit_log_service
from app.modules.coupons import service as coupons_service
from app.modules.payments import service as payments_service

logger = logging.getLogger(__name__)


def _to_plan_info(plan: Any) -> UpsellPlanInfo:
    """Helper to convert a DB PricingPlan record to a server-authoritative UpsellPlanInfo."""
    months = plan.months
    name = f"{months} Month Membership" if months != 1 else "1 Month Membership"
    plan_id = getattr(plan, "planId", getattr(plan, "plan_id", str(plan.id)))
    price = plan.price
    save_percent = getattr(plan, "savePercent", getattr(plan, "save_percent", 0))

    return UpsellPlanInfo(
        plan_id=plan_id,
        name=name,
        months=months,
        price=price,
        currency="INR",
        save_percent=save_percent,
    )


async def get_member_usage_signals(user_id: str) -> MemberUsageSignals:
    """Query real member usage metrics from database."""
    total_loans = await prisma.loan.count(where={"memberId": user_id})
    active_loans = await prisma.loan.count(where={"memberId": user_id, "returnedAt": None})
    total_visits = await prisma.libraryvisit.count(where={"memberId": user_id})

    return MemberUsageSignals(
        total_loans=total_loans,
        active_loans=active_loans,
        total_visits=total_visits,
    )


def evaluate_growth_policy(
    signals: MemberUsageSignals,
    current_plan_info: UpsellPlanInfo,
    higher_plans: List[Any],
) -> Tuple[GrowthPolicyDecision, bool, Optional[Any]]:
    """Evaluate deterministic usage policy to determine eligibility and best plan based on usage intensity."""
    if not higher_plans:
        return (
            GrowthPolicyDecision(
                decision="no_offer",
                reason_code="highest_tier",
                reason=f"You are currently on our highest tier ({current_plan_info.name}). No further upgrade is required.",
            ),
            False,
            None,
        )

    # Check if member has active library usage (borrowing or visits)
    # If member has 0 loans and 0 visits, policy determines no offer (insufficient usage)
    if signals.total_loans == 0 and signals.total_visits == 0:
        return (
            GrowthPolicyDecision(
                decision="no_offer",
                reason_code="insufficient_usage",
                reason="Current library usage does not indicate an immediate need for a membership upgrade.",
            ),
            False,
            None,
        )

    # Sort higher plans by duration ascending (e.g. 3m, 6m, 12m)
    sorted_plans = sorted(higher_plans, key=lambda x: x.months)

    total_activity = signals.total_loans + signals.total_visits

    # Usage-based plan selection:
    # Light activity (1-3): Recommend lower upgrade tier (e.g. 3m)
    # Moderate activity (4-8): Recommend mid upgrade tier (e.g. 6m)
    # Heavy activity (9+ or 5+ loans): Recommend highest value tier (e.g. 12m)
    if total_activity <= 3:
        recommended_db_plan = sorted_plans[0]
    elif total_activity <= 8:
        mid_idx = min(1, len(sorted_plans) - 1)
        recommended_db_plan = sorted_plans[mid_idx]
    else:
        recommended_db_plan = sorted_plans[-1]

    rec_info = _to_plan_info(recommended_db_plan)
    usage_desc = []
    if signals.total_loans > 0:
        usage_desc.append(f"{signals.total_loans} book loans")
    if signals.total_visits > 0:
        usage_desc.append(f"{signals.total_visits} library visits")

    usage_str = " and ".join(usage_desc) if usage_desc else "active library usage"

    return (
        GrowthPolicyDecision(
            decision="recommend",
            reason_code="high_usage",
            reason=f"Active library usage ({usage_str}) makes a {rec_info.name} more cost-effective.",
        ),
        True,
        recommended_db_plan,
    )


async def evaluate_upsell(
    request_data: UpsellEvaluateRequest, user: User
) -> UpsellEvaluateResponse:
    """Evaluate membership upgrade opportunities using deterministic usage signals, server prices & AI rationale."""
    # 1. Load real PricingPlan records from database
    plans_raw = await prisma.pricingplan.find_many()
    if not plans_raw:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No pricing plans configured in database",
        )

    # Map raw plans by plan_id and months
    plans_by_id = {}
    plans_by_months = {}
    for p in plans_raw:
        pid = getattr(p, "planId", getattr(p, "plan_id", str(p.id)))
        plans_by_id[pid] = p
        plans_by_months[p.months] = p

    # 2. Resolve current plan strictly from DB
    current_db_plan = None
    if request_data.current_plan_id:
        current_db_plan = plans_by_id.get(request_data.current_plan_id)
    elif request_data.current_plan_months is not None:
        current_db_plan = plans_by_months.get(request_data.current_plan_months)

    if current_db_plan is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or missing current membership plan",
        )

    current_plan_info = _to_plan_info(current_db_plan)

    # 3. Query real member usage signals from database
    usage_signals = await get_member_usage_signals(user.id)

    # 4. Find eligible higher-duration plans in DB
    higher_plans = [p for p in plans_raw if p.months > current_db_plan.months]

    # 5. Evaluate deterministic growth policy
    policy_decision, eligible, recommended_db_plan = evaluate_growth_policy(
        usage_signals, current_plan_info, higher_plans
    )

    if not eligible or recommended_db_plan is None:
        response = UpsellEvaluateResponse(
            eligible=False,
            usage_signals=usage_signals,
            policy=policy_decision,
            current_plan=current_plan_info,
            recommended_plan=None,
            price_difference=None,
            savings_percent=None,
            reason=policy_decision.reason,
            ai_generated=False,
        )
        return response

    # 6. Compute server-bounded financial data for recommended plan
    recommended_plan_info = _to_plan_info(recommended_db_plan)
    price_diff = recommended_plan_info.price - current_plan_info.price
    savings_percent = recommended_plan_info.save_percent

    # 7. Fallback rationale template (server-known facts)
    fallback_reason = (
        f"Upgrading from {current_plan_info.name} (₹{current_plan_info.price}) "
        f"to {recommended_plan_info.name} (₹{recommended_plan_info.price}) "
        f"saves you {savings_percent}% per month with longer uninterrupted access."
    )

    reason_text = fallback_reason
    ai_generated = False

    # 8. AI Rationale Generation (LLM receives already-computed facts, only produces explanation prose with 3s timeout)
    try:
        llm = build_chat_llm()
        system_prompt = (
            "You are an AI Commerce assistant for a Community Library. "
            "Write a single concise sentence (max 20 words) explaining why upgrading "
            "membership is a good deal for the user based on their usage activity. "
            "Do NOT include code, JSON, bullet points, or fictional prices. Only prose."
        )
        user_message = (
            f"Member activity: {usage_signals.total_loans} total loans, {usage_signals.active_loans} active loans, {usage_signals.total_visits} visits. "
            f"Current plan: {current_plan_info.name} at ₹{current_plan_info.price}. "
            f"Recommended plan: {recommended_plan_info.name} at ₹{recommended_plan_info.price} "
            f"with {savings_percent}% savings. Policy reason: {policy_decision.reason}"
        )

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_message),
        ]
        result = await asyncio.wait_for(llm.ainvoke(messages), timeout=3.0)

        if result and hasattr(result, "content") and result.content:
            cleaned = str(result.content).strip().replace("\n", " ")
            if len(cleaned) > 10:
                reason_text = cleaned
                ai_generated = True
    except Exception as exc:
        logger.warning("LLM call failed for upsell rationale, using fallback: %s", exc)
        reason_text = fallback_reason
        ai_generated = False

    # 0. Generate unique correlation token for audit trail
    import uuid
    eval_id = f"eval_{uuid.uuid4().hex[:12]}"

    # 9. Construct final enriched response
    response = UpsellEvaluateResponse(
        eval_id=eval_id,
        eligible=True,
        usage_signals=usage_signals,
        policy=policy_decision,
        current_plan=current_plan_info,
        recommended_plan=recommended_plan_info,
        price_difference=price_diff,
        savings_percent=savings_percent,
        reason=reason_text,
        ai_generated=ai_generated,
    )

    # 10. Record enriched audit log entry for UPSELL_RECOMMENDED
    try:
        audit_metadata = {
            "eval_id": eval_id,
            "current_plan_id": current_plan_info.plan_id,
            "current_plan_price": current_plan_info.price,
            "current_plan_name": current_plan_info.name,
            "recommended_plan_id": recommended_plan_info.plan_id,
            "recommended_plan_price": recommended_plan_info.price,
            "recommended_plan_name": recommended_plan_info.name,
            "recommended_plan_months": recommended_plan_info.months,
            "savings_percent": savings_percent,
            "ai_generated": ai_generated,
            "reason": reason_text,
            "usage_signals": usage_signals.model_dump(),
            "policy_decision": policy_decision.decision,
            "policy_reason_code": policy_decision.reason_code,
        }
        await audit_log_service.record(
            actor_id=user.id,
            action="UPSELL_RECOMMENDED",
            metadata=audit_metadata,
        )
    except Exception as audit_exc:
        logger.error("Failed to record audit log for UPSELL_RECOMMENDED: %s", audit_exc)

    return response


async def accept_upsell(payload: UpsellAcceptRequest, user: User) -> UpsellAcceptResponse:
    """Accept an AI-recommended membership upgrade and create a server-authoritative Razorpay order."""
    # 1. Resolve recommended plan directly from PostgreSQL
    plans_raw = await prisma.pricingplan.find_many()
    if not plans_raw:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No pricing plans configured in database",
        )

    plans_by_id = {}
    for p in plans_raw:
        pid = getattr(p, "planId", getattr(p, "plan_id", str(p.id)))
        plans_by_id[pid] = p

    recommended_db_plan = plans_by_id.get(payload.recommended_plan_id)
    if recommended_db_plan is None or not getattr(recommended_db_plan, "is_active", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Recommended plan is not available or inactive",
        )

    current_db_plan = plans_by_id.get(payload.current_plan_id)
    if current_db_plan is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid current plan ID",
        )

    # 2. Verify that recommended plan is actually a valid higher-duration upgrade
    if recommended_db_plan.months <= current_db_plan.months:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Recommended plan is not a valid upgrade over current plan",
        )

    # 3. Recalculate price and coupon discounts server-side (never trust frontend amount)
    rec_plan_info = _to_plan_info(recommended_db_plan)
    current_plan_info = _to_plan_info(current_db_plan)
    amount = rec_plan_info.price

    if payload.coupon_code:
        coupon = await coupons_service.validate_coupon(payload.coupon_code)
        amount = round(amount * (100 - coupon.discount_percent) / 100)

    # 4. Record UPSELL_ACCEPTED audit event
    try:
        await audit_log_service.record(
            actor_id=user.id,
            action="UPSELL_ACCEPTED",
            metadata={
                "user_id": user.id,
                "eval_id": payload.eval_id or "",
                "current_plan_id": current_plan_info.plan_id,
                "recommended_plan_id": rec_plan_info.plan_id,
                "server_calculated_amount": amount,
                "currency": "INR",
                "coupon_code": payload.coupon_code or "",
                "timestamp": datetime.now(UTC).isoformat(),
                "source": "ai_upsell",
            },
        )
    except Exception as exc:
        logger.error("Failed to record UPSELL_ACCEPTED audit log: %s", exc)

    # 5. Create Razorpay order using existing server-authoritative Razorpay integration
    client = payments_service._get_client()

    order = client.order.create(
        {
            "amount": amount * 100,
            "currency": "INR",
            "notes": {
                "member_id": user.id,
                "label": f"{rec_plan_info.months} month membership",
                "plan_months": str(rec_plan_info.months),
                "plan_id": rec_plan_info.plan_id,
                "current_plan_id": current_plan_info.plan_id,
                "coupon_code": payload.coupon_code or "",
                "eval_id": payload.eval_id or "",
                "source": "ai_upsell",
                "feature": "feature_2",
            },
        }
    )

    # 6. Record UPSELL_ORDER_CREATED audit event
    try:
        await audit_log_service.record(
            actor_id=user.id,
            action="UPSELL_ORDER_CREATED",
            metadata={
                "user_id": user.id,
                "eval_id": payload.eval_id or "",
                "recommended_plan_id": rec_plan_info.plan_id,
                "order_id": order["id"],
                "server_calculated_amount": amount,
                "currency": "INR",
                "source": "ai_upsell",
            },
        )
    except Exception as exc:
        logger.error("Failed to record UPSELL_ORDER_CREATED audit log: %s", exc)

    return UpsellAcceptResponse(
        order_id=order["id"],
        amount=amount,
        currency="INR",
        key_id=get_settings().razorpay_key_id,
        plan_id=rec_plan_info.plan_id,
        plan_name=rec_plan_info.name,
        source="ai_upsell",
    )


async def get_audit_trail(user: User) -> AIAuditTrailResponse:
    """Fetch structured, append-only AI decision audit records correlated for the member."""
    # Query database audit log entries for this user
    raw_entries = await prisma.auditlogentry.find_many(
        where={
            "actorId": user.id,
            "action": {"in": ["UPSELL_RECOMMENDED", "UPSELL_ACCEPTED", "UPSELL_ORDER_CREATED", "UPSELL_VERIFIED"]},
        },
        order={"createdAt": "desc"},
    )

    # Group entries by eval_id or recommendation event
    recommendations: dict[str, dict[str, Any]] = {}
    accepted_evals = set()
    order_created_map = {}
    verified_orders = set()

    for entry in raw_entries:
        meta = entry.metadata if isinstance(entry.metadata, dict) else {}
        action = entry.action

        if action == "UPSELL_ACCEPTED":
            eid = meta.get("eval_id")
            if eid:
                accepted_evals.add(eid)
        elif action == "UPSELL_ORDER_CREATED":
            eid = meta.get("eval_id")
            oid = meta.get("order_id")
            if eid:
                order_created_map[eid] = oid
        elif action == "UPSELL_VERIFIED":
            oid = meta.get("razorpay_order_id")
            if oid:
                verified_orders.add(oid)
        elif action == "UPSELL_RECOMMENDED":
            eid = meta.get("eval_id") or str(entry.id)
            if eid not in recommendations:
                recommendations[eid] = {
                    "entry": entry,
                    "metadata": meta,
                }

    records: list[AIAuditRecord] = []
    for eid, data in recommendations.items():
        entry = data["entry"]
        meta = data["metadata"]

        is_accepted = eid in accepted_evals
        order_id = order_created_map.get(eid)
        is_initiated = order_id is not None
        is_completed = order_id in verified_orders if order_id else False

        status = "pending"
        if is_completed:
            status = "completed"
        elif is_initiated:
            status = "initiated"
        elif is_accepted:
            status = "accepted"

        curr_info = None
        if meta.get("current_plan_id"):
            curr_info = UpsellPlanInfo(
                plan_id=meta.get("current_plan_id", "1m"),
                name=meta.get("current_plan_name", "1 Month Membership"),
                months=1,
                price=meta.get("current_plan_price", 999),
            )

        rec_info = None
        if meta.get("recommended_plan_id"):
            rec_info = UpsellPlanInfo(
                plan_id=meta.get("recommended_plan_id", "12m"),
                name=meta.get("recommended_plan_name", "12 Month Membership"),
                months=meta.get("recommended_plan_months", 12),
                price=meta.get("recommended_plan_price", 8991),
                save_percent=meta.get("savings_percent", 25),
            )

        signals_data = meta.get("usage_signals") or {}
        signals = MemberUsageSignals(
            total_loans=signals_data.get("total_loans", 0),
            active_loans=signals_data.get("active_loans", 0),
            total_visits=signals_data.get("total_visits", 0),
        )

        records.append(
            AIAuditRecord(
                audit_id=str(entry.id),
                eval_id=eid,
                timestamp=entry.createdAt.isoformat(),
                current_plan=curr_info,
                recommended_plan=rec_info,
                usage_signals=signals,
                decision=meta.get("policy_decision", "recommend"),
                reason_code=meta.get("policy_reason_code", "high_usage"),
                explanation=meta.get("reason", "Active library usage makes a longer membership more cost-effective."),
                savings_amount=(rec_info.price - curr_info.price) if (rec_info and curr_info) else None,
                savings_percent=meta.get("savings_percent", 25),
                accepted=is_accepted,
                payment_initiated=is_initiated,
                payment_status=status,
                order_id=order_id,
            )
        )

    return AIAuditTrailResponse(records=records)

