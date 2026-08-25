from fastapi import HTTPException, status
from prisma.errors import ForeignKeyViolationError

from app.core.constants import Role
from app.db.prisma import prisma
from app.modules.audit_log import service as audit_log_service
from app.modules.audit_log.constants import AuditAction
from app.modules.billing_requests import repository
from app.modules.billing_requests.schemas import (
    BillingRequestCreate,
    BillingRequestOut,
    WaiveFineRequest,
)
from app.modules.notifications import service as notifications_service

_DECISION_ACTIONS = {
    ("refund", "approved"): AuditAction.REFUND_ISSUED,
    ("refund", "rejected"): AuditAction.REFUND_REJECTED,
    ("fee_waiver", "approved"): AuditAction.FEE_WAIVED,
    ("fee_waiver", "rejected"): AuditAction.FEE_WAIVER_REJECTED,
}

_TYPE_LABELS = {"refund": "refund", "fee_waiver": "fee waiver"}


async def _notify_admins(message: str) -> None:
    await notifications_service.notify_roles([Role.ADMIN], "pending-request", message)


async def list_pending_requests() -> list[BillingRequestOut]:
    rows = await repository.list_pending()
    return [BillingRequestOut.from_prisma(row) for row in rows]


async def create_request(created_by_id: str, payload: BillingRequestCreate) -> BillingRequestOut:
    try:
        row = await repository.create(
            member_id=payload.member_id,
            created_by_id=created_by_id,
            type=payload.type,
            amount=payload.amount,
            reason=payload.reason,
        )
    except ForeignKeyViolationError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Member not found"
        ) from exc

    await _notify_admins(
        f"{row.createdBy.fullName} filed a ₹{row.amount} {_TYPE_LABELS[row.type]} request "
        f"for {row.member.fullName}."
    )
    return BillingRequestOut.from_prisma(row)


async def waive_fine(admin_id: str, payload: WaiveFineRequest) -> BillingRequestOut:
    # Admin acting directly, not the manager-files/admin-approves flow: the admin is
    # both filer and approver, so this creates the request already decided — it never
    # shows up in the pending queue.
    try:
        row = await repository.create(
            member_id=payload.member_id,
            created_by_id=admin_id,
            type="fee_waiver",
            amount=payload.amount,
            reason=payload.reason,
        )
    except ForeignKeyViolationError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Member not found"
        ) from exc

    row = await repository.decide(row.id, status="approved", decided_by_id=admin_id)
    await audit_log_service.record(
        actor_id=admin_id,
        action=AuditAction.FEE_WAIVED,
        metadata={"amount": row.amount, "memberName": row.member.fullName},
    )
    return BillingRequestOut.from_prisma(row)


async def approve_request(request_id: str, decided_by_id: str) -> BillingRequestOut:
    return await _decide(request_id, decided_by_id, "approved")


async def reject_request(request_id: str, decided_by_id: str) -> BillingRequestOut:
    return await _decide(request_id, decided_by_id, "rejected")


async def _decide(request_id: str, decided_by_id: str, status_value: str) -> BillingRequestOut:
    existing = await repository.find_by_id(request_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    if existing.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="This request has already been decided"
        )

    async with prisma.tx() as tx:
        row = await repository.decide_if_pending(
            request_id, status=status_value, decided_by_id=decided_by_id, client=tx
        )
        if row is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "This request has already been decided")
        await audit_log_service.record(
            actor_id=decided_by_id,
            action=_DECISION_ACTIONS[(row.type, status_value)],
            metadata={"amount": row.amount, "memberName": row.member.fullName},
            client=tx,
        )
    return BillingRequestOut.from_prisma(row)
