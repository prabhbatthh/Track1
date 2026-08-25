from datetime import datetime

from pydantic import BaseModel, Field


class LibraryReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str = Field(min_length=1, max_length=500)


class LibraryReviewOut(BaseModel):
    id: str
    rating: int
    comment: str
    status: str
    member_id: str
    member_name: str
    member_role: str
    created_at: datetime

    @staticmethod
    def from_prisma(row) -> "LibraryReviewOut":
        return LibraryReviewOut(
            id=row.id,
            rating=row.rating,
            comment=row.comment,
            status=row.status,
            member_id=row.memberId,
            member_name=row.member.fullName,
            member_role=row.member.role.name,
            created_at=row.createdAt,
        )
