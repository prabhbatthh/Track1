from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from prisma.models import User

from app.api.deps import get_current_user, require_role
from app.core.constants import Role
from app.modules.members import service
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

router = APIRouter(prefix="/members", tags=["members"])

view_members = require_role(Role.ADMIN, Role.LIBRARIAN, Role.MANAGER, Role.IT_HEAD)
manage_members = require_role(Role.ADMIN)


@router.get("", response_model=MemberListResponse)
async def list_members(
    _: Annotated[User, Depends(view_members)],
    search: Annotated[str | None, Query(description="Match against full name or email")] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    role: Annotated[str | None, Query(description="Exact role name match")] = None,
    active_only: Annotated[bool, Query(description="Only include active accounts")] = False,
) -> MemberListResponse:
    return await service.list_members(
        search=search, page=page, page_size=page_size, role=role, active_only=active_only
    )


@router.post("", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
async def create_member(
    payload: MemberCreate,
    _: Annotated[User, Depends(manage_members)],
) -> MemberOut:
    return await service.create_member(payload)


@router.put("/{member_id}", response_model=MemberOut)
async def update_member(
    member_id: UUID,
    payload: MemberUpdate,
    actor: Annotated[User, Depends(manage_members)],
) -> MemberOut:
    return await service.update_member(str(member_id), payload, actor_id=actor.id)


@router.get("/me/reading-progress", response_model=list[ReadingProgressOut])
async def list_my_reading_progress(
    user: Annotated[User, Depends(get_current_user)],
) -> list[ReadingProgressOut]:
    return await service.list_reading_progress(user.id)


@router.put("/me/reading-progress", response_model=ReadingProgressOut)
async def record_my_reading_progress(
    payload: ReadingProgressUpsert,
    user: Annotated[User, Depends(get_current_user)],
) -> ReadingProgressOut:
    return await service.record_reading_progress(user.id, payload)


@router.get("/me/reading-goal", response_model=ReadingGoalOut | None)
async def get_my_reading_goal(
    user: Annotated[User, Depends(get_current_user)],
) -> ReadingGoalOut | None:
    return await service.get_reading_goal(user.id)


@router.put("/me/reading-goal", response_model=ReadingGoalOut)
async def set_my_reading_goal(
    payload: ReadingGoalUpsert,
    user: Annotated[User, Depends(get_current_user)],
) -> ReadingGoalOut:
    return await service.upsert_reading_goal(user.id, payload)


@router.get("/me/reading-streak", response_model=ReadingStreakOut)
async def get_my_reading_streak(
    user: Annotated[User, Depends(get_current_user)],
) -> ReadingStreakOut:
    return await service.get_reading_streak(user.id)


@router.get("/me/reading-profile", response_model=ReadingProfileOut | None)
async def get_my_reading_profile(
    user: Annotated[User, Depends(get_current_user)],
) -> ReadingProfileOut | None:
    return await service.get_reading_profile(user)
