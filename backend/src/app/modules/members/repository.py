from contextlib import suppress
from datetime import UTC, datetime

from prisma import Json, Prisma
from prisma.errors import UniqueViolationError
from prisma.models import LoginActivity, ReadingGoal, ReadingProgress, Role, User

from app.core.constants import Role as AppRole
from app.db.pagination import paginate
from app.db.prisma import prisma

MEMBER_INCLUDE = {"role": True}
READING_PROGRESS_INCLUDE = {"book": True}


async def upsert_role(name: str) -> Role:
    return await prisma.role.upsert(
        where={"name": name},
        data={"create": {"name": name}, "update": {}},
    )


async def find_by_id(member_id: str) -> User | None:
    return await prisma.user.find_unique(where={"id": member_id}, include=MEMBER_INCLUDE)


async def find_by_email(email: str) -> User | None:
    return await prisma.user.find_unique(
        where={"email": email.strip().lower()}, include=MEMBER_INCLUDE
    )


async def save_reading_profile(member_id: str, data: dict, *, activity_count: int) -> None:
    await prisma.user.update(
        where={"id": member_id},
        data={"readingProfile": Json(data), "readingProfileActivityCount": activity_count},
    )


async def touch_last_login(user_id: str) -> None:
    now = datetime.now(UTC)
    today = datetime(now.year, now.month, now.day, tzinfo=UTC)
    await prisma.user.update(where={"id": user_id}, data={"lastLoginAt": now})
    with suppress(UniqueViolationError):
        await prisma.loginactivity.create(data={"memberId": user_id, "date": today})
        # Concurrent successful logins may both try to create today's activity row.
        # The unique row already represents the desired result, so authentication
        # must not fail just because another request won that race.


async def list_members(
    *,
    search: str | None,
    page: int,
    page_size: int,
    role: str | None = None,
    active_only: bool = False,
) -> tuple[list[User], int]:
    where: dict = {"deletedAt": None}
    if active_only:
        where["isActive"] = True
    if role:
        where["role"] = {"name": role}
    if search:
        where["OR"] = [
            {"fullName": {"contains": search, "mode": "insensitive"}},
            {"email": {"contains": search, "mode": "insensitive"}},
        ]

    return await paginate(
        prisma.user,
        where=where,
        include=MEMBER_INCLUDE,
        order={"createdAt": "desc"},
        skip=(page - 1) * page_size,
        take=page_size,
    )


async def create_member(
    *,
    email: str,
    password_hash: str | None,
    full_name: str,
    phone: str | None,
    avatar_url: str | None,
    role_id: str,
) -> User:
    return await prisma.user.create(
        data={
            "email": email.strip().lower(),
            "passwordHash": password_hash,
            "fullName": full_name,
            "phone": phone,
            "avatarUrl": avatar_url,
            "roleId": role_id,
        },
        include=MEMBER_INCLUDE,
    )


async def update_member(member_id: str, data: dict, *, client: Prisma | None = None) -> User:
    db = client or prisma
    return await db.user.update(where={"id": member_id}, data=data, include=MEMBER_INCLUDE)


async def count_active_admins(*, client: Prisma | None = None) -> int:
    db = client or prisma
    return await db.user.count(
        where={"isActive": True, "deletedAt": None, "role": {"name": AppRole.ADMIN.value}}
    )


async def bump_token_version(user_id: str) -> User:
    return await prisma.user.update(
        where={"id": user_id},
        data={"tokenVersion": {"increment": 1}},
        include=MEMBER_INCLUDE,
    )


async def list_reading_progress(member_id: str) -> list[ReadingProgress]:
    return await prisma.readingprogress.find_many(
        where={"memberId": member_id},
        include=READING_PROGRESS_INCLUDE,
        order={"updatedAt": "desc"},
    )


async def upsert_reading_progress(
    *, member_id: str, book_id: str, status: str, percent_complete: int
) -> ReadingProgress:
    return await prisma.readingprogress.upsert(
        where={"memberId_bookId": {"memberId": member_id, "bookId": book_id}},
        data={
            "create": {
                "memberId": member_id,
                "bookId": book_id,
                "status": status,
                "percentComplete": percent_complete,
            },
            "update": {"status": status, "percentComplete": percent_complete},
        },
        include=READING_PROGRESS_INCLUDE,
    )


async def get_reading_goal(member_id: str) -> ReadingGoal | None:
    return await prisma.readinggoal.find_unique(where={"memberId": member_id})


async def upsert_reading_goal(
    *, member_id: str, yearly_goal: int, monthly_goal: int
) -> ReadingGoal:
    return await prisma.readinggoal.upsert(
        where={"memberId": member_id},
        data={
            "create": {
                "memberId": member_id,
                "yearlyGoal": yearly_goal,
                "monthlyGoal": monthly_goal,
            },
            "update": {"yearlyGoal": yearly_goal, "monthlyGoal": monthly_goal},
        },
    )


async def count_completed_reading_progress(member_id: str, *, since: datetime) -> int:
    return await prisma.readingprogress.count(
        where={"memberId": member_id, "status": "completed", "updatedAt": {"gte": since}}
    )


async def list_login_activity(member_id: str) -> list[LoginActivity]:
    return await prisma.loginactivity.find_many(
        where={"memberId": member_id}, order={"date": "desc"}
    )
