from datetime import UTC, datetime

from prisma.models import CommunityBan, CommunityComment, CommunityPost

from app.db.pagination import paginate
from app.db.prisma import prisma

POST_INCLUDE = {
    "author": True,
    "likes": True,
    "saves": True,
    "reports": True,
    "comments": {"include": {"author": True, "reports": True}, "order_by": {"createdAt": "asc"}},
}


def _required_post(post: CommunityPost | None) -> CommunityPost:
    if post is None:
        raise RuntimeError("Community post disappeared after a successful database write")
    return post


async def list_posts(*, page: int, page_size: int) -> tuple[list[CommunityPost], int]:
    return await paginate(
        prisma.communitypost,
        where={"deletedAt": None},
        order={"createdAt": "desc"},
        skip=(page - 1) * page_size,
        take=page_size,
        include=POST_INCLUDE,
    )


async def find_post(post_id: str) -> CommunityPost | None:
    post = await prisma.communitypost.find_unique(where={"id": post_id}, include=POST_INCLUDE)
    if post is None or post.deletedAt is not None:
        return None
    return post


async def create_post(author_id: str, data: dict) -> CommunityPost:
    created = await prisma.communitypost.create(data={**data, "authorId": author_id})
    return _required_post(await find_post(created.id))


async def update_post(post_id: str, data: dict) -> CommunityPost:
    await prisma.communitypost.update(where={"id": post_id}, data=data)
    return _required_post(await find_post(post_id))


async def soft_delete_post(post_id: str) -> None:
    await prisma.communitypost.update(where={"id": post_id}, data={"deletedAt": datetime.now(UTC)})


async def set_post_reported(post_id: str, user_id: str) -> CommunityPost:
    existing = await prisma.communitypostreport.find_unique(
        where={"postId_userId": {"postId": post_id, "userId": user_id}}
    )
    if not existing:
        await prisma.communitypostreport.create(data={"postId": post_id, "userId": user_id})
    return await update_post(post_id, {"reported": True})


async def toggle_like(post_id: str, user_id: str) -> CommunityPost:
    existing = await prisma.communitypostlike.find_unique(
        where={"postId_userId": {"postId": post_id, "userId": user_id}}
    )
    if existing:
        await prisma.communitypostlike.delete(where={"id": existing.id})
    else:
        await prisma.communitypostlike.create(data={"postId": post_id, "userId": user_id})
    return _required_post(await find_post(post_id))


async def toggle_save(post_id: str, user_id: str) -> CommunityPost:
    existing = await prisma.communitypostsave.find_unique(
        where={"postId_userId": {"postId": post_id, "userId": user_id}}
    )
    if existing:
        await prisma.communitypostsave.delete(where={"id": existing.id})
    else:
        await prisma.communitypostsave.create(data={"postId": post_id, "userId": user_id})
    return _required_post(await find_post(post_id))


async def add_comment(
    post_id: str,
    author_id: str,
    content: str,
    parent_id: str | None,
    *,
    reported: bool = False,
) -> CommunityPost:
    await prisma.communitycomment.create(
        data={
            "postId": post_id,
            "authorId": author_id,
            "content": content,
            "parentId": parent_id,
            "reported": reported,
        }
    )
    return _required_post(await find_post(post_id))


async def find_comment(comment_id: str) -> CommunityComment | None:
    return await prisma.communitycomment.find_unique(where={"id": comment_id})


async def delete_comment(comment_id: str) -> None:
    await prisma.communitycomment.delete(where={"id": comment_id})


async def set_comment_reported(comment_id: str, user_id: str) -> None:
    existing = await prisma.communitycommentreport.find_unique(
        where={"commentId_userId": {"commentId": comment_id, "userId": user_id}}
    )
    if not existing:
        await prisma.communitycommentreport.create(
            data={"commentId": comment_id, "userId": user_id}
        )
    await prisma.communitycomment.update(where={"id": comment_id}, data={"reported": True})


async def find_ban(user_id: str) -> CommunityBan | None:
    return await prisma.communityban.find_unique(where={"userId": user_id})


async def list_bans() -> list[CommunityBan]:
    return await prisma.communityban.find_many(include={"user": True}, order={"createdAt": "asc"})


async def ban_user(user_id: str) -> None:
    await prisma.communityban.upsert(
        where={"userId": user_id},
        data={"create": {"userId": user_id}, "update": {}},
    )


async def unban_user(user_id: str) -> None:
    ban = await prisma.communityban.find_unique(where={"userId": user_id})
    if ban:
        await prisma.communityban.delete(where={"id": ban.id})
