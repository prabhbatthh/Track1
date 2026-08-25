from prisma import Prisma
from prisma.models import Payment

from app.db.pagination import paginate
from app.db.prisma import prisma


async def create_payment(
    *,
    user_id: str,
    amount: int,
    label: str,
    plan_months: int | None = None,
    razorpay_payment_id: str | None = None,
    razorpay_order_id: str | None = None,
    client: Prisma | None = None,
) -> Payment:
    db = client or prisma
    return await db.payment.create(
        data={
            "userId": user_id,
            "amount": amount,
            "label": label,
            "planMonths": plan_months,
            "razorpayPaymentId": razorpay_payment_id,
            "razorpayOrderId": razorpay_order_id,
        },
    )


async def find_by_razorpay_payment_id(
    razorpay_payment_id: str, *, client: Prisma | None = None
) -> Payment | None:
    db = client or prisma
    return await db.payment.find_unique(where={"razorpayPaymentId": razorpay_payment_id})


async def find_latest_membership_payment(user_id: str) -> Payment | None:
    return await prisma.payment.find_first(
        where={"userId": user_id, "planMonths": {"not": None}, "status": "success"},
        order={"createdAt": "desc"},
    )


async def list_membership_payments(user_id: str) -> list[Payment]:
    return await prisma.payment.find_many(
        where={"userId": user_id, "planMonths": {"not": None}, "status": "success"},
        order={"createdAt": "asc"},
    )


async def list_payments_for_user(
    user_id: str, *, page: int, page_size: int
) -> tuple[list[Payment], int]:
    return await paginate(
        prisma.payment,
        where={"userId": user_id},
        order={"createdAt": "desc"},
        skip=(page - 1) * page_size,
        take=page_size,
    )
