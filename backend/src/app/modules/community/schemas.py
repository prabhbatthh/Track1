from datetime import datetime

from pydantic import BaseModel, Field


class PostCreate(BaseModel):
    book_title: str | None = Field(default=None, max_length=255)
    content: str = Field(min_length=1, max_length=2000)
    images: list[str] = Field(default_factory=list, max_length=4)


class CommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=1000)
    parent_id: str | None = None


class CommentOut(BaseModel):
    id: str
    author_id: str
    author_name: str
    author_avatar_url: str | None
    content: str
    created_at: datetime
    reported: bool
    reported_by_me: bool = False
    replies: list["CommentOut"] = Field(default_factory=list)

    @staticmethod
    def from_prisma(comment, current_user_id: str | None = None) -> "CommentOut":
        reports = getattr(comment, "reports", []) or []
        reported_by_me = (
            any(getattr(r, "userId", None) == current_user_id for r in reports)
            if current_user_id
            else False
        )
        is_reported = bool(comment.reported or reports)
        return CommentOut(
            id=comment.id,
            author_id=comment.authorId,
            author_name=comment.author.fullName,
            author_avatar_url=comment.author.avatarUrl,
            content=comment.content,
            created_at=comment.createdAt,
            reported=is_reported,
            reported_by_me=reported_by_me,
            replies=[],
        )


class PostOut(BaseModel):
    id: str
    author_id: str
    author_name: str
    author_avatar_url: str | None
    book_title: str | None
    content: str
    images: list[str]
    created_at: datetime
    like_count: int
    is_liked: bool
    is_saved: bool
    is_own: bool
    reported: bool
    reported_by_me: bool = False
    comments: list[CommentOut]

    @staticmethod
    def from_prisma(post, *, current_user_id: str) -> "PostOut":
        reports = getattr(post, "reports", []) or []
        reported_by_me = any(getattr(r, "userId", None) == current_user_id for r in reports)
        return PostOut(
            id=post.id,
            author_id=post.authorId,
            author_name=post.author.fullName,
            author_avatar_url=post.author.avatarUrl,
            book_title=post.bookTitle,
            content=post.content,
            images=post.images,
            created_at=post.createdAt,
            like_count=len(post.likes),
            is_liked=any(like.userId == current_user_id for like in post.likes),
            is_saved=any(save.userId == current_user_id for save in post.saves),
            is_own=post.authorId == current_user_id,
            reported=post.reported,
            reported_by_me=reported_by_me,
            comments=_build_comment_tree(post.comments, current_user_id=current_user_id),
        )


def _build_comment_tree(comments: list, current_user_id: str | None = None) -> list[CommentOut]:
    by_id = {
        comment.id: CommentOut.from_prisma(comment, current_user_id=current_user_id)
        for comment in comments
    }
    roots: list[CommentOut] = []
    for comment in comments:
        node = by_id[comment.id]
        if comment.parentId and comment.parentId in by_id:
            by_id[comment.parentId].replies.append(node)
        else:
            roots.append(node)
    return roots


class PostListResponse(BaseModel):
    items: list[PostOut]
    total: int
    page: int
    page_size: int


class BannedAuthorOut(BaseModel):
    user_id: str
    full_name: str
