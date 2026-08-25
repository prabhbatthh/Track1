from datetime import datetime, timedelta

from prisma.models import (
    AuditLogEntry,
    Loan,
    LoginActivity,
    Payment,
    PermissionRequest,
    SupportTicket,
    User,
)

from app.core.constants import Role
from app.db.prisma import prisma


async def count_active_members() -> int:
    return await prisma.user.count(
        where={"role": {"name": Role.MEMBER}, "deletedAt": None, "isActive": True}
    )


async def list_active_members() -> list[User]:
    return await prisma.user.find_many(
        where={"role": {"name": Role.MEMBER}, "deletedAt": None, "isActive": True}
    )


async def list_active_users_with_role() -> list[User]:
    """Every non-deleted, active user across all roles — for the role breakdown donut,
    unlike list_active_members() which is scoped to Role.MEMBER only."""
    return await prisma.user.find_many(
        where={"deletedAt": None, "isActive": True}, include={"role": True}
    )


async def count_overdue_loans_beyond(threshold_days: int, *, now: datetime) -> int:
    """Active (unreturned) loans whose due date is more than threshold_days in the past."""
    cutoff = now - timedelta(days=threshold_days)
    return await prisma.loan.count(where={"returnedAt": None, "dueDate": {"lt": cutoff}})


async def count_audit_actions_between(actions: list[str], start: datetime, end: datetime) -> int:
    return await prisma.auditlogentry.count(
        where={"action": {"in": actions}, "createdAt": {"gte": start, "lt": end}}
    )


async def list_audit_entries_since(actions: list[str], start: datetime) -> list[AuditLogEntry]:
    return await prisma.auditlogentry.find_many(
        where={"action": {"in": actions}, "createdAt": {"gte": start}}
    )


async def list_login_activity_since(start: datetime) -> list[LoginActivity]:
    """One row per (member, calendar day) they logged in — see LoginActivity's own
    @@unique constraint — so counting rows per day already gives distinct logins/day."""
    return await prisma.loginactivity.find_many(where={"date": {"gte": start}})


async def list_support_tickets_created_since(start: datetime) -> list[SupportTicket]:
    return await prisma.supportticket.find_many(where={"createdAt": {"gte": start}})


async def list_permission_requests_since(start: datetime) -> list[PermissionRequest]:
    return await prisma.permissionrequest.find_many(where={"createdAt": {"gte": start}})


async def list_loans_due_since(start: datetime) -> list[Loan]:
    return await prisma.loan.find_many(where={"dueDate": {"gte": start}})


async def list_membership_payments() -> list[Payment]:
    return await prisma.payment.find_many(
        where={"status": "success", "planMonths": {"not": None}}, order={"createdAt": "desc"}
    )


async def membership_payments_by_member() -> dict[str, list[Payment]]:
    """All successful plan payments per member, oldest first.

    Ascending order is what payments.calculate_membership_expiry expects, so this
    dashboard can share that function instead of re-deriving expiry from the latest
    payment with a 30-day month (which ignored renewals and drifted on long plans).
    """
    payments = await prisma.payment.find_many(
        where={"status": "success", "planMonths": {"not": None}}, order={"createdAt": "asc"}
    )
    grouped: dict[str, list[Payment]] = {}
    for payment in payments:
        grouped.setdefault(payment.userId, []).append(payment)
    return grouped
