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


class AgentMembershipPlan(BaseModel):
    id: str
    plan_id: str
    name: str
    months: int
    price: int
    currency: str = "INR"
    availability: str = "available"
    save_percent: int = 0
    badge: Optional[str] = None


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
