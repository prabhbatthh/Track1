from fastapi import HTTPException, status
from prisma.models import User

from app.core.constants import Role
from app.modules.audit_log import service as audit_log_service
from app.modules.audit_log.constants import AuditAction
from app.modules.chat.guardrails import contains_harmful_content
from app.modules.community import repository
from app.modules.community.schemas import (
    BannedAuthorOut,
    CommentCreate,
    PostCreate,
    PostListResponse,
    PostOut,
)
from app.modules.notifications import service as notifications_service

_STAFF_ROLES = {Role.ADMIN, Role.MANAGER, Role.LIBRARIAN, Role.IT_HEAD}
_MODERATOR_ROLES = {Role.ADMIN, Role.IT_HEAD}
_REPORTER_ROLES = {Role.MEMBER, Role.MANAGER}


def _role(user: User) -> str:
    return user.role.name


async def _notify_moderators(message: str) -> None:
    await notifications_service.notify_roles(_MODERATOR_ROLES, "reported-comment", message)


async def _ensure_not_banned(user: User) -> None:
    if await repository.find_ban(user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You are banned from Community")


async def _get_post_or_404(post_id: str):
    post = await repository.find_post(post_id)
    if post is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Post not found")
    return post


def _post_data(payload: PostCreate) -> dict:
    return {"bookTitle": payload.book_title, "content": payload.content, "images": payload.images}


async def list_posts(user: User, *, page: int, page_size: int) -> PostListResponse:
    posts, total = await repository.list_posts(page=page, page_size=page_size)
    return PostListResponse(
        items=[PostOut.from_prisma(post, current_user_id=user.id) for post in posts],
        total=total,
        page=page,
        page_size=page_size,
    )


async def create_post(user: User, payload: PostCreate) -> PostOut:
    if _role(user) in _STAFF_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Staff accounts cannot create posts")
    await _ensure_not_banned(user)
    # Auto-flag before a member ever has to report it — nothing is blocked or deleted,
    # this just puts the post straight into the same queue a member report would, using
    # the identical `reported` flag the rest of the moderation UI already keys off.
    flagged = contains_harmful_content(payload.content)
    post = await repository.create_post(user.id, {**_post_data(payload), "reported": flagged})
    if flagged:
        await _notify_moderators(
            f"A new post by {user.fullName} was automatically flagged for review."
        )
    return PostOut.from_prisma(post, current_user_id=user.id)


async def update_post(user: User, post_id: str, payload: PostCreate) -> PostOut:
    post = await _get_post_or_404(post_id)
    await _ensure_not_banned(user)
    if post.authorId != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only edit your own posts")
    updated = await repository.update_post(post_id, _post_data(payload))
    return PostOut.from_prisma(updated, current_user_id=user.id)


async def delete_post(user: User, post_id: str) -> None:
    post = await _get_post_or_404(post_id)
    if post.authorId != user.id and _role(user) not in _MODERATOR_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot delete this post")
    await repository.soft_delete_post(post_id)


async def toggle_like(user: User, post_id: str) -> PostOut:
    existing = await _get_post_or_404(post_id)
    was_liked = any(like.userId == user.id for like in existing.likes)
    post = await repository.toggle_like(post_id, user.id)
    if not was_liked and post.authorId != user.id:
        await notifications_service.create_notification(
            post.authorId, "post-like", f"{user.fullName} liked your post."
        )
    return PostOut.from_prisma(post, current_user_id=user.id)


async def toggle_save(user: User, post_id: str) -> PostOut:
    await _get_post_or_404(post_id)
    post = await repository.toggle_save(post_id, user.id)
    return PostOut.from_prisma(post, current_user_id=user.id)


async def report_post(user: User, post_id: str) -> PostOut:
    post = await _get_post_or_404(post_id)
    await _ensure_not_banned(user)
    if _role(user) not in _REPORTER_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot report posts")
    if post.authorId == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot report your own post")
    updated = await repository.set_post_reported(post_id, user.id)
    await _notify_moderators(f"{user.fullName} reported a post by {post.author.fullName}.")
    return PostOut.from_prisma(updated, current_user_id=user.id)


async def add_comment(user: User, post_id: str, payload: CommentCreate) -> PostOut:
    await _get_post_or_404(post_id)
    await _ensure_not_banned(user)
    parent = None
    if payload.parent_id:
        parent = await repository.find_comment(payload.parent_id)
        if parent is None or parent.postId != post_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    flagged = contains_harmful_content(payload.content)
    post = await repository.add_comment(
        post_id, user.id, payload.content, payload.parent_id, reported=flagged
    )
    if flagged:
        await _notify_moderators(
            f"A new comment by {user.fullName} was automatically flagged for review."
        )
    if parent is not None:
        if parent.authorId != user.id:
            await notifications_service.create_notification(
                parent.authorId, "post-comment", f"{user.fullName} replied to your comment."
            )
    elif post.authorId != user.id:
        await notifications_service.create_notification(
            post.authorId, "post-comment", f"{user.fullName} commented on your post."
        )
    return PostOut.from_prisma(post, current_user_id=user.id)


async def delete_comment(user: User, comment_id: str) -> None:
    comment = await repository.find_comment(comment_id)
    if comment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    if _role(user) not in _STAFF_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot delete this comment")
    await repository.delete_comment(comment_id)


async def report_comment(user: User, comment_id: str) -> None:
    await _ensure_not_banned(user)
    comment = await repository.find_comment(comment_id)
    if comment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Comment not found")
    if _role(user) not in _REPORTER_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot report comments")
    if comment.authorId == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot report your own comment")
    await repository.set_comment_reported(comment_id, user.id)
    await _notify_moderators(f"{user.fullName} reported a comment.")


async def list_banned_authors(user: User) -> list[BannedAuthorOut]:
    if _role(user) not in _MODERATOR_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot view banned authors")
    bans = await repository.list_bans()
    return [BannedAuthorOut(user_id=ban.userId, full_name=ban.user.fullName) for ban in bans]


async def ban_author(user: User, target_user_id: str) -> None:
    if _role(user) not in _MODERATOR_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot ban authors")
    if target_user_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot ban yourself")
    await repository.ban_user(target_user_id)
    await audit_log_service.record(
        actor_id=user.id,
        action=AuditAction.COMMUNITY_USER_BANNED,
        metadata={"targetUserId": target_user_id},
    )


async def unban_author(user: User, target_user_id: str) -> None:
    if _role(user) not in _MODERATOR_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot unban authors")
    await repository.unban_user(target_user_id)
    await audit_log_service.record(
        actor_id=user.id,
        action=AuditAction.COMMUNITY_USER_UNBANNED,
        metadata={"targetUserId": target_user_id},
    )
