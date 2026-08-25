from typing import Optional
from pydantic import BaseModel, Field


class UpsellEvaluateRequest(BaseModel):
    current_plan_id: Optional[str] = Field(
        None, description="Plan identifier (e.g. '1m', '3m', '6m', '12m')"
    )
    current_plan_months: Optional[int] = Field(
        None, description="Duration in months (e.g. 1, 3, 6, 12)"
    )


class UpsellPlanInfo(BaseModel):
    plan_id: str
    name: str
    months: int
    price: int
    currency: str = "INR"
    save_percent: int = 0


class MemberUsageSignals(BaseModel):
    total_loans: int = Field(0, description="Total book loans by member")
    active_loans: int = Field(0, description="Currently unreturned active loans")
    total_visits: int = Field(0, description="Total recorded library visits")


class GrowthPolicyDecision(BaseModel):
    decision: str = Field(..., description="'recommend' or 'no_offer'")
    reason_code: str = Field(..., description="'high_usage', 'insufficient_usage', or 'highest_tier'")
    reason: str = Field(..., description="Human-readable policy rationale")


class UpsellEvaluateResponse(BaseModel):
    eligible: bool
    usage_signals: Optional[MemberUsageSignals] = None
    policy: Optional[GrowthPolicyDecision] = None
    current_plan: Optional[UpsellPlanInfo] = None
    recommended_plan: Optional[UpsellPlanInfo] = None
    price_difference: Optional[int] = None
    savings_percent: Optional[int] = None
    reason: str
    ai_generated: bool = False


class UpsellAcceptRequest(BaseModel):
    recommended_plan_id: str = Field(..., description="ID of recommended plan (e.g. '12m')")
    current_plan_id: str = Field(..., description="ID of current plan (e.g. '1m', '3m')")
    coupon_code: Optional[str] = Field(None, description="Optional coupon code")


class UpsellAcceptResponse(BaseModel):
    order_id: str
    amount: int
    currency: str = "INR"
    key_id: str
    plan_id: str
    plan_name: str
    source: str = "ai_upsell"
