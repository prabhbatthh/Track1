import asyncio
from dataclasses import dataclass

from app.modules.leaderboard import repository
from app.modules.leaderboard.schemas import LeaderboardEntryOut
from app.modules.members.service import compute_streaks

LEADERBOARD_LIMIT = 50


@dataclass
class MemberStats:
    member_id: str
    full_name: str
    avatar_url: str | None
    score: int
    books_completed: int
    reviews_count: int
    events_attended: int
    on_time_returns: int
    reading_streak: int
    is_current_user: bool


async def get_leaderboard(current_user_id: str) -> list[LeaderboardEntryOut]:
    """Rank members by activity score.

    Every count is aggregated in SQL and the six queries run concurrently. The previous
    version loaded six whole tables — including one login-activity row per member per
    day, for all time — and counted them in Python on every page view.
    """
    (
        members,
        completed_counts,
        review_counts,
        event_counts,
        returns,
        login_dates_per_member,
    ) = await asyncio.gather(
        repository.list_member_users(),
        repository.count_completed_progress_by_member(),
        repository.count_reviews_by_member(),
        repository.count_attended_events_by_member(),
        repository.count_returns_by_member(),
        repository.list_recent_login_dates(),
    )
    if not members:
        return []
    on_time_returns, late_returns = returns

    # Build intermediate records
    member_stats: list[MemberStats] = []
    for m in members:
        m_id = m.id
        books_completed = completed_counts.get(m_id, 0)
        reviews_cnt = review_counts.get(m_id, 0)
        events_cnt = event_counts.get(m_id, 0)
        on_time_cnt = on_time_returns.get(m_id, 0)
        late_cnt = late_returns.get(m_id, 0)
        current_streak, _ = compute_streaks(login_dates_per_member.get(m_id, set()))

        # Scoring:
        # Complete a book: 100
        # Write a review: 25
        # Event: 30
        # On-time return: 15
        # Late return: -10
        # 7-day streak: 50
        score = (
            (books_completed * 100)
            + (reviews_cnt * 25)
            + (events_cnt * 30)
            + (on_time_cnt * 15)
            - (late_cnt * 10)
            + (50 if current_streak >= 7 else 0)
        )

        member_stats.append(
            MemberStats(
                member_id=m_id,
                full_name=m.fullName,
                avatar_url=m.avatarUrl,
                score=score,
                books_completed=books_completed,
                reviews_count=reviews_cnt,
                events_attended=events_cnt,
                on_time_returns=on_time_cnt,
                reading_streak=current_streak,
                is_current_user=m_id == current_user_id,
            )
        )

    # Tie-breaking hierarchy:
    # 1. Total Score (DESC)
    # 2. Books Completed (DESC)
    # 3. Reviews Count (DESC)
    # 4. Reading Streak (DESC)
    # 5. Full Name Alphabetical A-Z (ASC)
    member_stats.sort(
        key=lambda x: (
            -x.score,
            -x.books_completed,
            -x.reviews_count,
            -x.reading_streak,
            x.full_name.lower(),
        )
    )

    # Rank across everyone. "reading_champion" depends on rank 1.
    results = []
    for rank, stats in enumerate(member_stats, start=1):
        badges = []
        if stats.books_completed >= 10:
            badges.append("bookworm")
        if stats.reading_streak >= 7:
            badges.append("7_day_streak")
        if stats.reviews_count >= 10:
            badges.append("top_reviewer")
        if stats.on_time_returns >= 10:
            badges.append("perfect_returner")
        if rank == 1:
            badges.append("reading_champion")
        if stats.events_attended >= 5:
            badges.append("community_star")

        results.append(
            LeaderboardEntryOut(
                rank=rank,
                member_id=stats.member_id,
                full_name=stats.full_name,
                avatar_url=stats.avatar_url,
                score=stats.score,
                books_completed=stats.books_completed,
                reviews_count=stats.reviews_count,
                reading_streak=stats.reading_streak,
                badges=badges,
                is_current_user=stats.is_current_user,
            )
        )

    return results
