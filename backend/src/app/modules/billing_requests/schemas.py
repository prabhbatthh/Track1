from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class BillingRequestCreate(BaseModel):
    member_id: str
    type: Literal["refund", "fee_waiver"]
    amount: int = Field(gt=0)
    reason: str = Field(min_length=1, max_length=500)


class WaiveFineRequest(BaseModel):
    member_id: str
    amount: int = Field(gt=0)
    reason: str = Field(min_length=1, max_length=500)


class BillingRequestOut(BaseModel):
    id: str
    type: Literal["refund", "fee_waiver"]
    amount: int
    reason: str
    status: str
    member_id: str
    member_name: str
    created_by_name: str
    created_at: datetime
    decided_at: datetime | None

    @staticmethod
    def from_prisma(row) -> "BillingRequestOut":
        return BillingRequestOut(
            id=row.id,
            type=row.type,
            amount=row.amount,
            reason=row.reason,
            status=row.status,
            member_id=row.memberId,
            member_name=row.member.fullName,
            created_by_name=row.createdBy.fullName,
            created_at=row.createdAt,
            decided_at=row.decidedAt,
        )
