from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from prisma.models import User

from app.api.deps import get_current_user
from app.modules.community import service
from app.modules.community.schemas import (
    BannedAuthorOut,
    CommentCreate,
    PostCreate,
    PostListResponse,
    PostOut,
)

router = APIRouter(prefix="/community", tags=["community"])


@router.get("/posts", response_model=PostListResponse)
async def list_posts(
    user: Annotated[User, Depends(get_current_user)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 20,
) -> PostListResponse:
    return await service.list_posts(user, page=page, page_size=page_size)


@router.post("/posts", response_model=PostOut, status_code=status.HTTP_201_CREATED)
async def create_post(
    payload: PostCreate, user: Annotated[User, Depends(get_current_user)]
) -> PostOut:
    return await service.create_post(user, payload)


@router.put("/posts/{post_id}", response_model=PostOut)
async def update_post(
    post_id: str, payload: PostCreate, user: Annotated[User, Depends(get_current_user)]
) -> PostOut:
    return await service.update_post(user, post_id, payload)


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(post_id: str, user: Annotated[User, Depends(get_current_user)]) -> None:
    await service.delete_post(user, post_id)


@router.post("/posts/{post_id}/like", response_model=PostOut)
async def toggle_like(post_id: str, user: Annotated[User, Depends(get_current_user)]) -> PostOut:
    return await service.toggle_like(user, post_id)


@router.post("/posts/{post_id}/save", response_model=PostOut)
async def toggle_save(post_id: str, user: Annotated[User, Depends(get_current_user)]) -> PostOut:
    return await service.toggle_save(user, post_id)


@router.post("/posts/{post_id}/report", response_model=PostOut)
async def report_post(post_id: str, user: Annotated[User, Depends(get_current_user)]) -> PostOut:
    return await service.report_post(user, post_id)


@router.post(
    "/posts/{post_id}/comments", response_model=PostOut, status_code=status.HTTP_201_CREATED
)
async def add_comment(
    post_id: str, payload: CommentCreate, user: Annotated[User, Depends(get_current_user)]
) -> PostOut:
    return await service.add_comment(user, post_id, payload)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(comment_id: str, user: Annotated[User, Depends(get_current_user)]) -> None:
    await service.delete_comment(user, comment_id)


@router.post("/comments/{comment_id}/report", status_code=status.HTTP_204_NO_CONTENT)
async def report_comment(comment_id: str, user: Annotated[User, Depends(get_current_user)]) -> None:
    await service.report_comment(user, comment_id)


@router.get("/banned-authors", response_model=list[BannedAuthorOut])
async def list_banned_authors(
    user: Annotated[User, Depends(get_current_user)],
) -> list[BannedAuthorOut]:
    return await service.list_banned_authors(user)


@router.post("/banned-authors/{target_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def ban_author(target_user_id: str, user: Annotated[User, Depends(get_current_user)]) -> None:
    await service.ban_author(user, target_user_id)


@router.delete("/banned-authors/{target_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unban_author(
    target_user_id: str, user: Annotated[User, Depends(get_current_user)]
) -> None:
    await service.unban_author(user, target_user_id)
