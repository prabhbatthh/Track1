from datetime import UTC, datetime

from prisma import Prisma
from prisma.models import BillingRequest

from app.db.prisma import prisma

INCLUDE = {"member": True, "createdBy": True}

# Self-limiting in practice — approved/rejected requests leave this filter — but capped
# anyway rather than trusting that a growing backlog never outpaces it.
LIST_LIMIT = 200


async def list_pending() -> list[BillingRequest]:
    return await prisma.billingrequest.find_many(
        where={"status": "pending"}, include=INCLUDE, order={"createdAt": "asc"}, take=LIST_LIMIT
    )


async def find_by_id(request_id: str) -> BillingRequest | None:
    return await prisma.billingrequest.find_unique(where={"id": request_id}, include=INCLUDE)


async def create(
    *, member_id: str, created_by_id: str, type: str, amount: int, reason: str
) -> BillingRequest:
    return await prisma.billingrequest.create(
        data={
            "memberId": member_id,
            "createdById": created_by_id,
            "type": type,
            "amount": amount,
            "reason": reason,
        },
        include=INCLUDE,
    )


async def decide(request_id: str, *, status: str, decided_by_id: str) -> BillingRequest:
    return await prisma.billingrequest.update(
        where={"id": request_id},
        data={"status": status, "decidedById": decided_by_id, "decidedAt": datetime.now(UTC)},
        include=INCLUDE,
    )


async def decide_if_pending(
    request_id: str, *, status: str, decided_by_id: str, client: Prisma
) -> BillingRequest | None:
    updated = await client.billingrequest.update_many(
        where={"id": request_id, "status": "pending"},
        data={"status": status, "decidedById": decided_by_id, "decidedAt": datetime.now(UTC)},
    )
    if updated != 1:
        return None
    return await client.billingrequest.find_unique(where={"id": request_id}, include=INCLUDE)
