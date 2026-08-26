from datetime import datetime, timezone
from typing import List

from app.db.prisma import prisma
from app.modules.agent.schemas import (
    AgentCatalogBook,
    AgentCatalogMeta,
    AgentCatalogResponse,
    AgentCouponItem,
    AgentMembershipPlan,
    AgentMerchantInfo,
    AgentProductEligibility,
    AgentPurchaseAction,
)


BENEFITS_MAP = {
    1: [
        "Full access to 10,000+ physical book catalog",
        "Borrow up to 3 books simultaneously",
        "Free quiet reading zone & Wi-Fi access",
    ],
    3: [
        "10% savings vs monthly renewal (Save ₹300)",
        "Borrow up to 5 books simultaneously",
        "Free quiet reading zone & Wi-Fi access",
    ],
    6: [
        "18% savings vs monthly renewal (Save ₹1,079)",
        "Borrow up to 5 books simultaneously",
        "Priority event reservation access",
    ],
    12: [
        "25% savings vs monthly renewal (Save ₹2,997)",
        "Borrow up to 7 books simultaneously",
        "Priority event reservation access",
        "Free guest pass per quarter",
    ],
}

DESCRIPTIONS_MAP = {
    1: "Standard 1-month community library access with full borrowing and digital perks.",
    3: "Quarterly value membership plan saving 10% compared with paying monthly.",
    6: "Half-yearly value membership plan saving 18% compared with paying monthly.",
    12: "Best-value annual membership saving 25% compared with paying monthly.",
}


async def get_agent_catalog(limit: int = 100) -> AgentCatalogResponse:
    """Retrieve machine-readable merchant catalog for AI shopping agents."""
    # 1. Membership plans
    plans_raw = await prisma.pricingplan.find_many()
    membership_plans: List[AgentMembershipPlan] = []
    for plan in plans_raw:
        save_pct = getattr(plan, "savePercent", getattr(plan, "save_percent", 0))
        badge = getattr(plan, "badge", None)
        plan_id = getattr(plan, "planId", getattr(plan, "plan_id", str(plan.id)))
        months = plan.months
        name = f"{months} Month Membership" if months != 1 else "1 Month Membership"

        benefits = BENEFITS_MAP.get(
            months,
            [
                f"{save_pct}% savings compared to monthly plan",
                "Full community library catalog access",
            ],
        )

        desc = DESCRIPTIONS_MAP.get(
            months,
            f"Community library membership for {months} months with {save_pct}% savings.",
        )

        membership_plans.append(
            AgentMembershipPlan(
                id=plan.id,
                plan_id=plan_id,
                name=name,
                description=desc,
                months=months,
                price=plan.price,
                currency="INR",
                availability="available",
                save_percent=save_pct,
                badge=badge,
                benefits=benefits,
                eligibility=AgentProductEligibility(
                    requires_auth=True,
                    eligible=True,
                    description="Available to all active library members.",
                ),
                purchase_action=AgentPurchaseAction(
                    method="POST",
                    endpoint="/api/v1/payments/create-order",
                    payload_template={"planId": plan_id},
                    supported_gateways=["razorpay", "pay_at_library"],
                ),
            )
        )

    # Sort plans by duration
    membership_plans.sort(key=lambda x: x.months)

    # 2. Books inventory
    books_raw = await prisma.book.find_many(
        take=limit,
        include={"loans": True, "reviews": True},
        where={"deletedAt": None},
        order={"title": "asc"},
    )
    catalog_books: List[AgentCatalogBook] = []
    for book in books_raw:
        total_copies = getattr(book, "totalCopies", getattr(book, "total_copies", 1))
        active_loans = sum(1 for loan in (book.loans or []) if getattr(loan, "status", None) == "BORROWED")
        available_copies = max(0, total_copies - active_loans)
        availability = "in_stock" if available_copies > 0 else "out_of_stock"

        avg_rating = None
        review_count = len(book.reviews) if book.reviews else 0
        if review_count > 0 and book.reviews:
            avg_rating = round(sum(r.rating for r in book.reviews) / review_count, 1)

        catalog_books.append(
            AgentCatalogBook(
                id=book.id,
                title=book.title,
                author=book.author,
                category=book.category,
                isbn=book.isbn,
                total_copies=total_copies,
                available_copies=available_copies,
                availability=availability,
                average_rating=avg_rating,
                review_count=review_count,
            )
        )

    # Total books count in DB
    total_books_count = await prisma.book.count(where={"deletedAt": None})

    # 3. Active coupons
    coupons_raw = await prisma.coupon.find_many()
    active_coupons: List[AgentCouponItem] = []
    for c in coupons_raw:
        discount_percent = getattr(c, "discountPercent", getattr(c, "discount_percent", 0))
        max_uses = getattr(c, "maxUses", getattr(c, "max_uses", 1))
        uses_count = getattr(c, "usesCount", getattr(c, "uses_count", 0))
        is_avail = uses_count < max_uses

        active_coupons.append(
            AgentCouponItem(
                code=c.code,
                discount_percent=discount_percent,
                max_uses=max_uses,
                uses_count=uses_count,
                available=is_avail,
            )
        )

    return AgentCatalogResponse(
        merchant=AgentMerchantInfo(),
        membership_plans=membership_plans,
        catalog=catalog_books,
        active_coupons=active_coupons,
        meta=AgentCatalogMeta(
            generated_at=datetime.now(timezone.utc),
            total_books=total_books_count,
            total_plans=len(membership_plans),
            total_coupons=len(active_coupons),
        ),
    )
