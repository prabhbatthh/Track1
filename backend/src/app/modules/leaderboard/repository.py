from datetime import UTC, datetime, timedelta

from prisma.models import User

from app.core.constants import Role
from app.db.prisma import prisma

# A streak only needs enough history to walk back from today. Loading every login row
# ever recorded (one per member per day) to compute "days in a row" was the single
# most expensive query on this page.
STREAK_WINDOW_DAYS = 400


async def list_member_users() -> list[User]:
    return await prisma.user.find_many(where={"role": {"name": Role.MEMBER}, "deletedAt": None})


async def _counts_by_member(sql: str, *args) -> dict[str, int]:
    rows = await prisma.query_raw(sql, *args)
    return {row["member_id"]: int(row["count"]) for row in rows}


async def count_completed_progress_by_member() -> dict[str, int]:
    return await _counts_by_member(
        """SELECT rp.member_id::text AS member_id, COUNT(*)::bigint AS count
           FROM reading_progress rp
           JOIN users u ON u.id = rp.member_id
           JOIN roles r ON r.id = u.role_id
           WHERE rp.status = 'completed' AND r.name = $1
           GROUP BY 1""",
        Role.MEMBER.value,
    )


async def count_reviews_by_member() -> dict[str, int]:
    return await _counts_by_member(
        """SELECT rv.member_id::text AS member_id, COUNT(*)::bigint AS count
           FROM reviews rv
           JOIN users u ON u.id = rv.member_id
           JOIN roles r ON r.id = u.role_id
           WHERE r.name = $1
           GROUP BY 1""",
        Role.MEMBER.value,
    )


async def count_attended_events_by_member() -> dict[str, int]:
    return await _counts_by_member(
        """SELECT er.member_id::text AS member_id, COUNT(*)::bigint AS count
           FROM event_registrations er
           JOIN users u ON u.id = er.member_id
           JOIN roles r ON r.id = u.role_id
           JOIN events e ON e.id = er.event_id
           WHERE r.name = $1 AND e.deleted_at IS NULL AND e.date <= NOW()
           GROUP BY 1""",
        Role.MEMBER.value,
    )


async def count_returns_by_member() -> tuple[dict[str, int], dict[str, int]]:
    """On-time and late return counts per member, split in SQL.

    Previously every returned loan was loaded and the comparison done in Python.
    """
    rows = await prisma.query_raw(
        """SELECT l.member_id::text AS member_id,
                  COUNT(*) FILTER (WHERE l.returned_at <= l.due_date)::bigint AS on_time,
                  COUNT(*) FILTER (WHERE l.returned_at >  l.due_date)::bigint AS late
           FROM loans l
           JOIN users u ON u.id = l.member_id
           JOIN roles r ON r.id = u.role_id
           WHERE l.returned_at IS NOT NULL AND r.name = $1
           GROUP BY 1""",
        Role.MEMBER.value,
    )
    on_time = {row["member_id"]: int(row["on_time"]) for row in rows}
    late = {row["member_id"]: int(row["late"]) for row in rows}
    return on_time, late


async def list_recent_login_dates() -> dict[str, set]:
    """Login dates per member, limited to the streak window."""
    cutoff = datetime.now(UTC) - timedelta(days=STREAK_WINDOW_DAYS)
    rows = await prisma.query_raw(
        """SELECT la.member_id::text AS member_id, la.date
           FROM login_activity la
           JOIN users u ON u.id = la.member_id
           JOIN roles r ON r.id = u.role_id
           WHERE r.name = $1 AND la.date >= ($2::timestamptz AT TIME ZONE 'UTC')""",
        Role.MEMBER.value,
        cutoff,
    )
    dates: dict[str, set] = {}
    for row in rows:
        value = row["date"]
        # query_raw hands timestamps back as strings; only the calendar date matters here.
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
        dates.setdefault(row["member_id"], set()).add(parsed)
    return dates
