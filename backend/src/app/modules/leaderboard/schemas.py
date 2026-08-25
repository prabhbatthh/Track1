from pydantic import BaseModel


class LeaderboardEntryOut(BaseModel):
    rank: int
    member_id: str
    full_name: str
    avatar_url: str | None = None
    score: int
    books_completed: int
    reviews_count: int
    reading_streak: int
    badges: list[str]
    is_current_user: bool
