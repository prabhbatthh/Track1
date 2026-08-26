from datetime import datetime
from typing import Any, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class AgentMerchantInfo(BaseModel):
    name: str = "Community Library Platform"
    description: str = "Clean machine-readable AI Commerce interface for agents and autonomous shopping."
    currency: str = "INR"
    supported_capabilities: List[str] = Field(
        default_factory=lambda: [
            "catalog_query",
            "pricing_query",
            "upsell_recommendation",
            "guardian_autopay",
        ]
    )


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


class AgentMembershipPlan(BaseModel):
    id: str
    plan_id: str
    name: str
    description: str = Field("Community library membership plan", description="AI-understandable plan description")
    months: int
    price: int
    currency: str = "INR"
    availability: str = "available"
    save_percent: int = 0
    badge: Optional[str] = None
    benefits: list[str] = Field(default_factory=list, description="Structured feature benefits list")
    eligibility: AgentProductEligibility = Field(
        default_factory=lambda: AgentProductEligibility(
            requires_auth=True, eligible=True, description="Available to active library members"
        )
    )
    purchase_action: AgentPurchaseAction = Field(
        default_factory=lambda: AgentPurchaseAction(
            method="POST",
            endpoint="/api/v1/payments/create-order",
            payload_template={"planId": "1m"},
            supported_gateways=["razorpay", "pay_at_library"],
        )
    )


class AgentCatalogBook(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    author: str
    category: str
    isbn: Optional[str] = None
    total_copies: int
    available_copies: int
    availability: str  # "in_stock" | "out_of_stock"
    average_rating: Optional[float] = None
    review_count: int = 0
    applicable_plans: List[str] = Field(default_factory=lambda: ["1m", "3m", "6m", "12m"])


class AgentCouponItem(BaseModel):
    code: str
    discount_percent: int
    max_uses: int
    uses_count: int
    available: bool


class AgentCatalogMeta(BaseModel):
    generated_at: datetime
    total_books: int
    total_plans: int
    total_coupons: int
    schema_version: str = "1.0-agentic"


class AgentCatalogResponse(BaseModel):
    merchant: AgentMerchantInfo
    membership_plans: List[AgentMembershipPlan]
    catalog: List[AgentCatalogBook]
    active_coupons: List[AgentCouponItem]
    meta: AgentCatalogMeta
