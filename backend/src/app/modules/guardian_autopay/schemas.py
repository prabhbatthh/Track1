from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class AutopayPolicyCreate(BaseModel):
    enabled: bool = Field(True, description="Enable or disable guardian auto-pay")
    per_transaction_cap: int = Field(200, description="Maximum amount allowed per transaction in INR")
    monthly_spending_cap: int = Field(1000, description="Maximum total spending allowed per calendar month in INR")
    allowed_charge_types: List[str] = Field(default_factory=lambda: ["fine"], description="Allowed charge categories (MVP: ['fine'])")


class AutopayPolicyUpdate(BaseModel):
    enabled: Optional[bool] = None
    per_transaction_cap: Optional[int] = None
    monthly_spending_cap: Optional[int] = None
    allowed_charge_types: Optional[List[str]] = None


class AutopayPolicyOut(BaseModel):
    id: str
    guardian_id: str
    member_id: str
    enabled: bool
    per_transaction_cap: int
    monthly_spending_cap: int
    allowed_charge_types: List[str]


class AutopayEvaluateRequest(BaseModel):
    guardian_id: str = Field(..., description="UUID of the linked guardian account")
    child_id: str = Field(..., description="UUID of the child/member account")
    charge_type: str = Field(..., description="Type of charge being evaluated (e.g. 'fine')")
    amount: int = Field(..., description="Amount of the charge in INR")
    charge_id: Optional[str] = Field(None, description="Optional ID of loan/charge record")


class AutopayDecisionResponse(BaseModel):
    allowed: bool = Field(..., description="Whether the autonomous payment policy allows this transaction")
    reason: str = Field(..., description="Deterministic rationale for decision")
    transaction_cap: Optional[int] = Field(None, description="Guardian's per-transaction limit")
    monthly_cap: Optional[int] = Field(None, description="Guardian's monthly limit")
    monthly_spent: Optional[int] = Field(None, description="Current monthly spending total")


class AutopayApproveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    member_id: str = Field(..., description="UUID of the linked child account")
    charge_id: str = Field(..., description="UUID of the unpaid loan/fine charge")


class AutopayApproveResponse(BaseModel):
    razorpay_order_id: str = Field(..., description="Server-created Razorpay order ID")
    amount: int = Field(..., description="Authoritative charge amount in INR")
    currency: str = Field("INR", description="Currency code")
    key_id: str = Field(..., description="Razorpay public key ID")
    member_id: str = Field(..., description="UUID of child account")
    charge_id: str = Field(..., description="UUID of charge/loan record")
    label: str = Field(..., description="Display label for fine settlement")

