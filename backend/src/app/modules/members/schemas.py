from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.core.constants import Role


class RoleOut(BaseModel):
    id: str
    name: str


class MemberCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=1, max_length=150)
    phone: str | None = Field(default=None, max_length=20)
    avatar_url: str | None = None
    role_name: Role = Field(
        default=Role.MEMBER,
        description=f"Defaults to '{Role.MEMBER.value}'",
    )


class MemberUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=150)
    phone: str | None = Field(default=None, max_length=20)
    avatar_url: str | None = None
    is_active: bool | None = None
    role_name: Role | None = None


class MemberOut(BaseModel):
    id: str
    email: str
    full_name: str
    phone: str | None
    avatar_url: str | None
    role: RoleOut
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @staticmethod
    def from_prisma(user) -> "MemberOut":
        return MemberOut(
            id=user.id,
            email=user.email,
            full_name=user.fullName,
            phone=user.phone,
            avatar_url=user.avatarUrl,
            role=RoleOut(id=user.role.id, name=user.role.name),
            is_active=user.isActive,
            last_login_at=user.lastLoginAt,
            created_at=user.createdAt,
            updated_at=user.updatedAt,
        )


class MemberListResponse(BaseModel):
    items: list[MemberOut]
    total: int
    page: int
    page_size: int


class ReadingProgressUpsert(BaseModel):
    book_id: str
    status: Literal["reading", "completed"] = "reading"
    percent_complete: int = Field(default=0, ge=0, le=100)


class ReadingProgressOut(BaseModel):
    id: str
    book_id: str
    book_title: str
    status: str
    percent_complete: int
    updated_at: datetime

    @staticmethod
    def from_prisma(progress) -> "ReadingProgressOut":
        return ReadingProgressOut(
            id=progress.id,
            book_id=progress.bookId,
            book_title=progress.book.title,
            status=progress.status,
            percent_complete=progress.percentComplete,
            updated_at=progress.updatedAt,
        )


class ReadingGoalUpsert(BaseModel):
    yearly_goal: int = Field(gt=0, le=1000)
    monthly_goal: int = Field(gt=0, le=1000)


class ReadingGoalOut(BaseModel):
    yearly_goal: int
    monthly_goal: int
    books_completed_this_year: int
    books_completed_this_month: int
    updated_at: datetime

    @staticmethod
    def from_prisma(
        goal, *, completed_this_year: int, completed_this_month: int
    ) -> "ReadingGoalOut":
        return ReadingGoalOut(
            yearly_goal=goal.yearlyGoal,
            monthly_goal=goal.monthlyGoal,
            books_completed_this_year=completed_this_year,
            books_completed_this_month=completed_this_month,
            updated_at=goal.updatedAt,
        )


class ReadingStreakOut(BaseModel):
    current_streak_days: int
    longest_streak_days: int


class ReadingProfileOut(BaseModel):
    interests: list[str]
    difficulty: str
    preference: str
    insight: str
