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


class AutopayAutonomousResponse(BaseModel):
    success: bool = Field(True, description="Autonomous settlement success status")
    payment_id: str = Field(..., description="UUID of created Payment record")
    razorpay_payment_id: str = Field(..., description="Simulated gateway payment ID")
    razorpay_order_id: str = Field(..., description="Simulated gateway order ID")
    amount: int = Field(..., description="Settled fine amount in INR")
    loan_id: str = Field(..., description="UUID of settled loan record")
    member_id: str = Field(..., description="UUID of child account")
    guardian_id: str = Field(..., description="UUID of guardian account")
    label: str = Field(..., description="Payment display label")


class AutopayExecuteAutonomousRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    loan_id: str = Field(..., description="UUID of the unpaid loan/fine charge to autonomously settle")


class AutopayDemoLoansResponse(BaseModel):
    within_cap_loan_id: str = Field(..., description="UUID of loan with ₹150 fine (within cap)")
    within_cap_amount: int = Field(150, description="Amount of fine within cap (₹150)")
    over_cap_loan_id: str = Field(..., description="UUID of loan with ₹250 fine (over cap)")
    over_cap_amount: int = Field(250, description="Amount of fine over cap (₹250)")
    child_id: str = Field(..., description="UUID of child member account")
    child_name: str = Field(..., description="Full name of child member")
    per_transaction_cap: int = Field(200, description="Guardian's per-transaction limit")
    monthly_spending_cap: int = Field(1000, description="Guardian's monthly limit")


class AutopayTrustStatusResponse(BaseModel):
    child_id: str = Field(..., description="UUID of child member account")
    child_name: str = Field(..., description="Full name of child member")
    trust_tier: str = Field(..., description="Current trust tier: HIGH, BASELINE, or LOW")
    on_time_return_rate: float = Field(..., description="Percentage of on-time returns (0.0 to 100.0)")
    on_time_returns: int = Field(..., description="Number of on-time returns in sample window")
    total_returns: int = Field(..., description="Total returns in sample window")
    sample_size: int = Field(..., description="Sample size of evaluated returned loans")
    multiplier: float = Field(..., description="Tier multiplier (1.2, 1.0, or 0.7)")
    guardian_per_transaction_cap: int = Field(..., description="Guardian's configured per-transaction cap in INR")
    theoretical_cap: int = Field(..., description="Theoretical cap (guardian cap * multiplier)")
    effective_transaction_cap: int = Field(..., description="Effective transaction cap (bounded by hard ceiling)")
    last_updated_at: Optional[str] = Field(None, description="ISO timestamp of last trust score update")
    reasoning: str = Field(..., description="Explainable rationale for the effective cap")


class AutopaySimulateTrustRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: str = Field("simulate_late_return", description="Demo action: 'simulate_late_return' or 'restore'")





