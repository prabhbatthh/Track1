from datetime import datetime
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
    eval_id: Optional[str] = Field(None, description="Unique correlation token for audit trail")
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
    eval_id: Optional[str] = Field(None, description="Optional correlation token from AI evaluation")


class UpsellAcceptResponse(BaseModel):
    order_id: str
    amount: int
    currency: str = "INR"
    key_id: str
    plan_id: str
    plan_name: str
    source: str = "ai_upsell"


class AIAuditRecord(BaseModel):
    audit_id: str = Field(..., description="Unique ID of recommendation audit entry")
    eval_id: str = Field(..., description="Correlation token for this recommendation cycle")
    timestamp: str = Field(..., description="ISO datetime of evaluation")
    current_plan: Optional[UpsellPlanInfo] = None
    recommended_plan: Optional[UpsellPlanInfo] = None
    usage_signals: Optional[MemberUsageSignals] = None
    decision: str = Field(..., description="'recommend' or 'no_offer'")
    reason_code: str = Field(..., description="'high_usage', 'insufficient_usage', etc.")
    explanation: str
    savings_amount: Optional[int] = None
    savings_percent: Optional[int] = None
    accepted: bool = False
    payment_initiated: bool = False
    payment_status: str = Field("pending", description="'pending', 'accepted', 'initiated', 'completed'")
    order_id: Optional[str] = None


class AIAuditTrailResponse(BaseModel):
    records: list[AIAuditRecord]


class AgentPurchaseAction(BaseModel):
    method: str = Field("POST", description="HTTP method for purchase execution")
    endpoint: str = Field(..., description="Server-authoritative purchase endpoint")
    payload_template: dict[str, str] = Field(..., description="Template of required purchase parameters")
    supported_gateways: list[str] = Field(
        default_factory=lambda: ["razorpay", "pay_at_library"],
        description="Supported payment gateways for checkout",
    )


class AgentProductEligibility(BaseModel):
    requires_auth: bool = Field(True, description="Whether authentication is required for checkout")
    eligible: bool = Field(True, description="Whether member is eligible for this item")
    description: str = Field(..., description="Human and AI readable eligibility requirement")


class AgentCatalogItem(BaseModel):
    id: str = Field(..., description="Unique product catalog identifier")
    product_type: str = Field("membership_plan", description="Product category type")
    plan_id: str = Field(..., description="Server plan identifier")
    name: str = Field(..., description="Display name of product")
    description: str = Field(..., description="AI-understandable product description")
    price: int = Field(..., description="Server-authoritative price in base currency unit (INR)")
    currency: str = Field("INR", description="ISO currency code")
    duration_months: int = Field(..., description="Membership duration in months")
    save_percent: int = Field(0, description="Savings percentage compared to monthly baseline")
    badge: Optional[str] = Field(None, description="Product highlight badge if any")
    available: bool = Field(True, description="Product availability status")
    eligibility: AgentProductEligibility
    benefits: list[str] = Field(default_factory=list, description="Structured feature benefits list")
    purchase_action: AgentPurchaseAction


class AgentCatalogResponse(BaseModel):
    catalog_version: str = Field("1.0", description="Schema version of agent catalog")
    currency: str = Field("INR", description="Default currency code")
    total_items: int = Field(..., description="Total available catalog items")
    items: list[AgentCatalogItem] = Field(..., description="List of catalog products")


class AgentCheckoutProposalRequest(BaseModel):
    plan_id: str = Field(..., description="Target membership plan identifier (e.g. 12m, 6m, 3m)")
    coupon_code: Optional[str] = Field(None, description="Optional coupon code to apply for discount preview")
    agent_id: Optional[str] = Field(None, description="Optional external AI agent identity / session tag")


class AgentCheckoutProposalOut(BaseModel):
    proposal_id: str = Field(..., description="Server-assigned unique proposal ID (prop_...)")
    status: str = Field("PENDING_APPROVAL", description="Proposal state (PENDING_APPROVAL, APPROVED, COMPLETED, EXPIRED)")
    plan_id: str = Field(..., description="Target membership plan ID")
    plan_name: str = Field(..., description="Display name of target membership plan")
    duration_months: int = Field(..., description="Membership duration in months")
    original_price: int = Field(..., description="Server-calculated baseline price before discount")
    final_price: int = Field(..., description="Server-calculated net payable price after discount")
    savings_amount: int = Field(0, description="Server-calculated total savings amount")
    savings_percent: int = Field(0, description="Server-calculated overall savings percentage")
    currency: str = Field("INR", description="ISO currency code")
    coupon_code: Optional[str] = Field(None, description="Applied coupon code if any")
    expires_at: datetime = Field(..., description="Server-authoritative proposal expiration timestamp")
    approval_url: str = Field("/api/v1/agent/checkout/approve", description="Required human approval endpoint URL")


class AgentCheckoutApproveRequest(BaseModel):
    proposal_id: str = Field(..., description="Unique proposal ID to explicitly approve")


class AgentCheckoutApproveOut(BaseModel):
    proposal_id: str = Field(..., description="Proposal ID approved")
    status: str = Field("APPROVED", description="Updated proposal status")
    order_id: str = Field(..., description="Server-authoritative Razorpay order ID")
    amount: int = Field(..., description="Server-authoritative net payable amount in base currency")
    currency: str = Field("INR", description="ISO currency code")
    key_id: Optional[str] = Field(None, description="Razorpay public key ID for checkout execution")
    plan_id: str = Field(..., description="Purchased membership plan ID")
    plan_name: str = Field(..., description="Purchased membership plan name")
    source: str = Field("agent_checkout", description="Origin tag for order correlation")



