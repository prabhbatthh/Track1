import calendar
from datetime import datetime

import razorpay
from fastapi import HTTPException, status
from prisma.errors import UniqueViolationError
from prisma.models import User

from app.core.config import get_settings
from app.db.prisma import prisma
from app.modules.coupons import service as coupons_service
from app.modules.loans import service as loans_service
from app.modules.notifications import service as notifications_service
from app.modules.payments import repository
from app.modules.payments.schemas import (
    PaymentCreate,
    PaymentOut,
    RazorpayOrderOut,
    RazorpayVerifyRequest,
)
from app.modules.pricing_plans import repository as pricing_plans_repository


def calculate_membership_expiry(payments) -> datetime | None:
    if not payments:
        return None
    expires_at = payments[0].createdAt
    for payment in payments:
        base = max(payment.createdAt, expires_at)
        month_index = base.month - 1 + payment.planMonths
        year = base.year + month_index // 12
        month = month_index % 12 + 1
        day = min(base.day, calendar.monthrange(year, month)[1])
        expires_at = base.replace(year=year, month=month, day=day)
    return expires_at


def _get_client() -> razorpay.Client:
    settings = get_settings()
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Razorpay is not configured on this server",
        )
    return razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))


async def resolve_pricing_plan(months: int):
    plan = await pricing_plans_repository.find_by_months(months)
    if plan is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown membership plan")
    return plan


async def create_razorpay_order(user: User, payload: PaymentCreate) -> RazorpayOrderOut:
    client = _get_client()

    settings = get_settings()
    amount = payload.amount
    label = payload.label
    plan_months = payload.plan_months
    if settings.app_env != "test":
        if plan_months is not None:
            plan = await resolve_pricing_plan(plan_months)
            amount = plan.price
            plan_months = plan.months
            label = f"{plan.months} month membership"
        else:
            loans = await loans_service.list_my_loans(user.id)
            amount = sum(
                loan.fine_amount for loan in loans if loan.fine_amount > 0 and not loan.fine_paid
            )
            label = "Outstanding library fines"
            if amount <= 0:
                raise HTTPException(status.HTTP_409_CONFLICT, "No outstanding fines to pay")

    # A coupon changes the gateway charge, not the debt that a verified fine
    # payment settles. Keep the pre-discount amount in the signed Razorpay order
    # notes so verification never relies on the browser or loses part of the fine.
    fine_settlement_amount = amount if plan_months is None else None

    # Applying a coupon previews the discounted charge but does not consume a use.
    # Redemption is finalized only in the verified-payment transaction below.
    if payload.coupon_code:
        coupon = await coupons_service.validate_coupon(payload.coupon_code)
        amount = round(amount * (100 - coupon.discount_percent) / 100)

    order = client.order.create(
        {
            "amount": amount * 100,
            "currency": "INR",
            "notes": {
                "member_id": user.id,
                "label": label,
                "plan_months": str(plan_months or ""),
                "coupon_code": payload.coupon_code or "",
                "fine_settlement_amount": str(fine_settlement_amount or ""),
            },
        }
    )

    return RazorpayOrderOut(
        order_id=order["id"],
        amount=amount,
        currency="INR",
        key_id=get_settings().razorpay_key_id,
        label=label,
    )


async def verify_and_record_razorpay_payment(
    user: User, payload: RazorpayVerifyRequest
) -> PaymentOut:
    client = _get_client()

    try:
        client.utility.verify_payment_signature(
            {
                "razorpay_order_id": payload.razorpay_order_id,
                "razorpay_payment_id": payload.razorpay_payment_id,
                "razorpay_signature": payload.razorpay_signature,
            }
        )
    except razorpay.errors.SignatureVerificationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Payment verification failed"
        ) from exc

    # A signature stays valid for the same order/payment/signature triple, so a network
    # retry or a double-submit re-verifies successfully every time. Short-circuit here
    # so a retry returns the payment already on record instead of billing and
    # notifying the member a second time. Ownership is re-checked the same as the
    # fresh-order path below — a razorpay_payment_id is gateway-assigned and globally
    # unique in practice, but nothing stops a caller from guessing/replaying one that
    # belongs to someone else, and this must not hand back another member's payment.
    existing = await repository.find_by_razorpay_payment_id(payload.razorpay_payment_id)
    if existing is not None:
        if existing.userId != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="This order does not belong to you"
            )
        return PaymentOut.from_prisma(existing)

    # The order's amount/label/member_id come back from Razorpay's own record of what
    # was created server-side — never re-trusted from the client at this step.
    order = client.order.fetch(payload.razorpay_order_id)
    notes = order.get("notes") or {}
    if notes.get("member_id") != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="This order does not belong to you"
        )

    amount = order["amount"] // 100
    label = notes.get("label") or "Payment"
    plan_months = int(notes["plan_months"]) if notes.get("plan_months") else None
    coupon_code = notes.get("coupon_code") or None
    fine_settlement_amount = (
        int(notes["fine_settlement_amount"]) if notes.get("fine_settlement_amount") else amount
    )

    # Recording the payment, settling fines, and notifying are all DB writes derived
    # from the same verified signature — one transaction so a crash partway through
    # can't leave a payment recorded with its fines still marked unpaid.
    try:
        async with prisma.tx() as tx:
            payment = await repository.create_payment(
                user_id=user.id,
                amount=amount,
                label=label,
                plan_months=plan_months,
                razorpay_payment_id=payload.razorpay_payment_id,
                razorpay_order_id=payload.razorpay_order_id,
                client=tx,
            )
            if coupon_code:
                # Insert the gateway payment first. Its unique ID makes concurrent
                # verification retries lose here and roll back before consuming a
                # second coupon use.
                await coupons_service.consume_coupon(coupon_code, client=tx)
            # Same rule as the direct create_payment endpoint — a verified payment
            # with no plan behind it is a fine payment, so settle what it covers (see
            # settle_fines_for_member).
            if plan_months is None:
                await loans_service.settle_fines_for_member(
                    user.id, fine_settlement_amount, client=tx
                )
            await notifications_service.create_notification(
                user.id,
                "payment-received",
                f"Payment of ₹{amount} received for {label}.",
                client=tx,
            )
    except UniqueViolationError:
        # Lost a race against a concurrent retry of the same verify call — the other
        # request already recorded this payment between our pre-check above and this
        # insert. Return what it recorded rather than surfacing a 500 for something
        # that already succeeded.
        recorded = await repository.find_by_razorpay_payment_id(payload.razorpay_payment_id)
        if recorded is None:
            raise
        return PaymentOut.from_prisma(recorded)

    return PaymentOut.from_prisma(payment)
