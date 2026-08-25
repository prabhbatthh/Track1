from datetime import datetime

from pydantic import BaseModel, Field


class PaymentCreate(BaseModel):
    amount: int = Field(gt=0)
    label: str = Field(min_length=1, max_length=255)
    plan_months: int | None = Field(default=None, gt=0)
    coupon_code: str | None = Field(default=None, min_length=1, max_length=20)


class PaymentOut(BaseModel):
    id: str
    amount: int
    label: str
    status: str
    created_at: datetime

    @staticmethod
    def from_prisma(payment) -> "PaymentOut":
        return PaymentOut(
            id=payment.id,
            amount=payment.amount,
            label=payment.label,
            status=payment.status,
            created_at=payment.createdAt,
        )


class PaymentListResponse(BaseModel):
    items: list[PaymentOut]
    total: int
    page: int
    page_size: int


class MembershipOut(BaseModel):
    plan_label: str
    purchased_at: datetime
    expires_at: datetime
    is_active: bool


class RazorpayOrderOut(BaseModel):
    order_id: str
    amount: int
    currency: str
    key_id: str
    label: str


class RazorpayVerifyRequest(BaseModel):
    razorpay_order_id: str = Field(min_length=1)
    razorpay_payment_id: str = Field(min_length=1)
    razorpay_signature: str = Field(min_length=1)
