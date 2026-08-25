from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from prisma.models import User

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.constants import Role
from app.core.rate_limit import limiter
from app.modules.coupons import service as coupons_service
from app.modules.loans import service as loans_service
from app.modules.notifications import service as notifications_service
from app.modules.payments import repository
from app.modules.payments import service as payments_service
from app.modules.payments.schemas import (
    MembershipOut,
    PaymentCreate,
    PaymentListResponse,
    PaymentOut,
    RazorpayOrderOut,
    RazorpayVerifyRequest,
)

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
async def create_payment(
    payload: PaymentCreate,
    user: Annotated[User, Depends(get_current_user)],
) -> PaymentOut:
    if get_settings().app_env != "test":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Direct payment recording is not available",
        )
    amount = payload.amount
    if payload.coupon_code:
        amount = await coupons_service.redeem_coupon(payload.coupon_code, payload.amount)

    payment = await repository.create_payment(
        user_id=user.id,
        amount=amount,
        label=payload.label,
        plan_months=payload.plan_months,
    )
    # No plan attached means this isn't a membership purchase — the "Pay Fine" button is
    # the only non-plan payment the UI creates, so put the money against the member's
    # outstanding fines. Without this the loan stays finePaid=false and the fine keeps
    # showing as owed everywhere after it's been paid.
    if payload.plan_months is None:
        await loans_service.settle_fines_for_member(user.id, amount)
    await notifications_service.create_notification(
        user.id, "payment-received", f"Payment of ₹{amount} received for {payload.label}."
    )
    return PaymentOut.from_prisma(payment)


@router.post("/pay-at-library", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
async def pay_at_library(
    request: Request,
    payload: PaymentCreate,
    user: Annotated[User, Depends(get_current_user)],
) -> None:
    # Cash requests are notifications rather than payments, but the displayed
    # amount still must be server-authoritative: otherwise a member can forge a
    # manager-facing request by editing the payment URL/body.
    if payload.plan_months is not None:
        plan = await payments_service.resolve_pricing_plan(payload.plan_months)
        amount = plan.price
        label = f"{plan.months} month membership"
    else:
        loans = await loans_service.list_my_loans(user.id)
        amount = sum(
            loan.fine_amount for loan in loans if loan.fine_amount > 0 and not loan.fine_paid
        )
        label = "Outstanding library fines"
        if amount <= 0:
            raise HTTPException(status.HTTP_409_CONFLICT, "No outstanding fines to pay")

    message = f"{user.fullName} wants to pay ₹{amount} in cash for {label}."
    await notifications_service.notify_roles([Role.MANAGER], "payment-pending", message)


@router.post(
    "/razorpay/order", response_model=RazorpayOrderOut, status_code=status.HTTP_201_CREATED
)
@limiter.limit("10/minute")
async def create_razorpay_order(
    request: Request,
    payload: PaymentCreate,
    user: Annotated[User, Depends(get_current_user)],
) -> RazorpayOrderOut:
    return await payments_service.create_razorpay_order(user, payload)


@router.post("/razorpay/verify", response_model=PaymentOut)
@limiter.limit("10/minute")
async def verify_razorpay_payment(
    request: Request,
    payload: RazorpayVerifyRequest,
    user: Annotated[User, Depends(get_current_user)],
) -> PaymentOut:
    return await payments_service.verify_and_record_razorpay_payment(user, payload)


@router.get("/me", response_model=PaymentListResponse)
async def list_my_payments(
    user: Annotated[User, Depends(get_current_user)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 20,
) -> PaymentListResponse:
    payments, total = await repository.list_payments_for_user(
        user.id, page=page, page_size=page_size
    )
    return PaymentListResponse(
        items=[PaymentOut.from_prisma(payment) for payment in payments],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/me/membership", response_model=MembershipOut | None)
async def get_my_membership(
    user: Annotated[User, Depends(get_current_user)],
) -> MembershipOut | None:
    payments = await repository.list_membership_payments(user.id)
    if not payments:
        return None
    expires_at = payments_service.calculate_membership_expiry(payments)
    if expires_at is None:
        raise RuntimeError("Membership payments unexpectedly produced no expiry")
    payment = payments[-1]
    return MembershipOut(
        plan_label=payment.label,
        purchased_at=payment.createdAt,
        expires_at=expires_at,
        is_active=expires_at > datetime.now(UTC),
    )
