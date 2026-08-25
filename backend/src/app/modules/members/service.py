from datetime import UTC, date, datetime, timedelta

from fastapi import HTTPException, status
from prisma.errors import ForeignKeyViolationError, UniqueViolationError
from prisma.models import User

from app.core.constants import Role
from app.core.security import hash_password
from app.db.prisma import prisma
from app.modules.audit_log import service as audit_log_service
from app.modules.audit_log.constants import AuditAction
from app.modules.members import reading_profile, repository
from app.modules.members.schemas import (
    MemberCreate,
    MemberListResponse,
    MemberOut,
    MemberUpdate,
    ReadingGoalOut,
    ReadingGoalUpsert,
    ReadingProfileOut,
    ReadingProgressOut,
    ReadingProgressUpsert,
    ReadingStreakOut,
)

# Constant key: this gates the "is this the last admin" decision globally, not per row.
_ADMIN_COUNT_LOCK = "members:active-admin-count"


async def list_members(
    *,
    search: str | None,
    page: int,
    page_size: int,
    role: str | None = None,
    active_only: bool = False,
) -> MemberListResponse:
    items, total = await repository.list_members(
        search=search, page=page, page_size=page_size, role=role, active_only=active_only
    )
    return MemberListResponse(
        items=[MemberOut.from_prisma(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


async def create_member(payload: MemberCreate) -> MemberOut:
    role = await repository.upsert_role(payload.role_name.value)

    try:
        user = await repository.create_member(
            email=payload.email,
            password_hash=hash_password(payload.password),
            full_name=payload.full_name,
            phone=payload.phone,
            avatar_url=payload.avatar_url,
            role_id=role.id,
        )
    except UniqueViolationError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A member with this email already exists",
        ) from exc

    return MemberOut.from_prisma(user)


async def update_member(member_id: str, payload: MemberUpdate, *, actor_id: str) -> MemberOut:
    existing = await repository.find_by_id(member_id)
    if existing is None or existing.deletedAt is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    removes_admin_access = payload.is_active is False or (
        payload.role_name is not None and payload.role_name != Role.ADMIN
    )
    if member_id == actor_id and removes_admin_access:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "You cannot deactivate or remove your own admin access",
        )
    guards_last_admin = existing.role.name == Role.ADMIN.value and removes_admin_access

    fields_set = payload.model_fields_set
    data: dict = {}
    if payload.full_name is not None:
        data["fullName"] = payload.full_name
    if "phone" in fields_set:
        data["phone"] = payload.phone
    if "avatar_url" in fields_set:
        data["avatarUrl"] = payload.avatar_url
    if payload.is_active is not None:
        data["isActive"] = payload.is_active
    if payload.role_name is not None:
        role = await repository.upsert_role(payload.role_name.value)
        data["roleId"] = role.id

    if not data:
        return MemberOut.from_prisma(existing)

    if guards_last_admin:
        # Count and write inside one transaction, behind an advisory lock on a constant
        # key. pg_advisory_xact_lock is transaction-scoped, so taking it outside a
        # transaction would release it immediately and guard nothing. Without this,
        # two concurrent requests demoting two different admins both read a count of 2,
        # both passed, and both committed — leaving zero active admins.
        async with prisma.tx() as tx:
            await tx.execute_raw("SELECT pg_advisory_xact_lock(hashtext($1))", _ADMIN_COUNT_LOCK)
            if await repository.count_active_admins(client=tx) <= 1:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    "The last active admin cannot be deactivated or reassigned",
                )
            updated = await repository.update_member(member_id, data, client=tx)
    else:
        updated = await repository.update_member(member_id, data)

    # Recorded after the write succeeds, so the log never claims a change that failed.
    if payload.role_name is not None and payload.role_name.value != existing.role.name:
        await audit_log_service.record(
            actor_id=actor_id,
            action=AuditAction.MEMBER_ROLE_CHANGED,
            metadata={
                "memberId": member_id,
                "memberEmail": existing.email,
                "from": existing.role.name,
                "to": payload.role_name.value,
            },
        )
    if payload.is_active is not None and payload.is_active != existing.isActive:
        await audit_log_service.record(
            actor_id=actor_id,
            action=AuditAction.MEMBER_ACTIVATION_CHANGED,
            metadata={
                "memberId": member_id,
                "memberEmail": existing.email,
                "isActive": payload.is_active,
            },
        )
    return MemberOut.from_prisma(updated)


async def list_reading_progress(member_id: str) -> list[ReadingProgressOut]:
    items = await repository.list_reading_progress(member_id)
    return [ReadingProgressOut.from_prisma(item) for item in items]


async def record_reading_progress(
    member_id: str, payload: ReadingProgressUpsert
) -> ReadingProgressOut:
    try:
        progress = await repository.upsert_reading_progress(
            member_id=member_id,
            book_id=payload.book_id,
            status=payload.status,
            percent_complete=payload.percent_complete,
        )
    except ForeignKeyViolationError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found") from exc

    return ReadingProgressOut.from_prisma(progress)


async def get_reading_goal(member_id: str) -> ReadingGoalOut | None:
    goal = await repository.get_reading_goal(member_id)
    if goal is None:
        return None
    return await _build_reading_goal_out(member_id, goal)


async def upsert_reading_goal(member_id: str, payload: ReadingGoalUpsert) -> ReadingGoalOut:
    goal = await repository.upsert_reading_goal(
        member_id=member_id,
        yearly_goal=payload.yearly_goal,
        monthly_goal=payload.monthly_goal,
    )
    return await _build_reading_goal_out(member_id, goal)


async def _build_reading_goal_out(member_id: str, goal) -> ReadingGoalOut:
    # ponytail: "completed this year/month" uses ReadingProgress.updatedAt as a proxy for
    # completion date (no separate completedAt column) — good enough until Loan/borrow
    # history exists to derive a real completion timestamp.
    now = datetime.now(UTC)
    year_start = datetime(now.year, 1, 1, tzinfo=UTC)
    month_start = datetime(now.year, now.month, 1, tzinfo=UTC)

    completed_this_year = await repository.count_completed_reading_progress(
        member_id, since=year_start
    )
    completed_this_month = await repository.count_completed_reading_progress(
        member_id, since=month_start
    )

    return ReadingGoalOut.from_prisma(
        goal,
        completed_this_year=completed_this_year,
        completed_this_month=completed_this_month,
    )


async def get_reading_streak(member_id: str) -> ReadingStreakOut:
    rows = await repository.list_login_activity(member_id)
    login_dates = {row.date.date() for row in rows}
    current, longest = compute_streaks(login_dates)
    return ReadingStreakOut(current_streak_days=current, longest_streak_days=longest)


async def get_reading_profile(user: User) -> ReadingProfileOut | None:
    data = await reading_profile.ensure_reading_profile(user)
    return ReadingProfileOut(**data) if data else None


def compute_streaks(login_dates: set[date]) -> tuple[int, int]:
    if not login_dates:
        return 0, 0

    today = datetime.now(UTC).date()

    # Current streak counts backward from the most recent login day. If that's today or
    # yesterday the streak is still "alive" (grace period for not having logged in yet
    # today); anything older than that means the streak is broken.
    cursor = today if today in login_dates else today - timedelta(days=1)
    current = 0
    while cursor in login_dates:
        current += 1
        cursor -= timedelta(days=1)

    longest = 0
    run = 0
    for day in sorted(login_dates):
        run = run + 1 if (day - timedelta(days=1)) in login_dates else 1
        longest = max(longest, run)

    return current, longest
