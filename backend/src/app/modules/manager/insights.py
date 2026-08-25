"""Pure scoring logic behind the manager dashboard's two "AI insight" cards: demand
forecasting and late-return risk. Deliberately deterministic, not an LLM call — both are
stats problems (trend comparison, historical rate), not language problems, so a
templated explanation built from the real numbers is both faster and more trustworthy
than asking a model to restate a formula. Kept in its own module, separate from
manager/service.py's data-fetching, so the scoring rules can be tuned or swapped without
touching how the data gets assembled.

Neither function is wired into any automatic action (loan issuance, fines, restrictions)
— both feed read-only dashboard cards for staff judgment, per the "assistant, not a
decision-maker" brief.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

# ── Demand forecast ──────────────────────────────────────────────────────────
DEMAND_RECENT_WINDOW_DAYS = 30
DEMAND_PRIOR_WINDOW_DAYS = 30
# A book with zero activity a month ago needs at least this many loans/reservations in
# the recent window before "went from 0 to something" counts as a real signal rather
# than a single one-off borrow.
DEMAND_MIN_NEW_ACTIVITY = 2
DEMAND_HIGH_GROWTH_PCT = 50.0
DEMAND_MEDIUM_GROWTH_PCT = 15.0
DEMAND_RESULT_LIMIT = 10

DemandLevel = Literal["high", "medium"]


@dataclass
class DemandSignal:
    book_id: str
    recent_activity: int  # loans + reservations created in the last DEMAND_RECENT_WINDOW_DAYS
    prior_activity: int  # same, for the DEMAND_PRIOR_WINDOW_DAYS before that
    pending_reservations: int  # right now, regardless of window
    total_copies: int


@dataclass
class DemandForecast:
    recent_activity: int
    prior_activity: int
    change_pct: float | None  # None when prior_activity is 0 (percentage undefined)
    pending_reservations: int
    demand_level: DemandLevel
    reason: str


def _demand_reason(signal: DemandSignal, change_pct: float | None) -> str:
    if change_pct is None:
        base = (
            f"{signal.recent_activity} loan(s)/reservation(s) in the last "
            f"{DEMAND_RECENT_WINDOW_DAYS} days, none in the previous "
            f"{DEMAND_PRIOR_WINDOW_DAYS}"
        )
    else:
        sign = "+" if change_pct >= 0 else ""
        base = (
            f"{signal.recent_activity} loan(s)/reservation(s) in the last "
            f"{DEMAND_RECENT_WINDOW_DAYS} days vs {signal.prior_activity} in the previous "
            f"{DEMAND_PRIOR_WINDOW_DAYS} ({sign}{change_pct:.0f}%)"
        )
    if signal.pending_reservations > 0:
        base += f"; {signal.pending_reservations} member(s) waiting on a reservation"
    if signal.total_copies > 0 and signal.pending_reservations >= signal.total_copies:
        copy_word = "copy is" if signal.total_copies == 1 else "copies are"
        base += f" — all {signal.total_copies} {copy_word} already claimed"
    return base


def score_demand(signal: DemandSignal) -> DemandForecast | None:
    """None means there isn't enough signal to call this book trending — never invents
    a level for a book with little or no recent activity."""
    if signal.recent_activity == 0:
        return None

    change_pct: float | None
    trend_level: DemandLevel | None
    if signal.prior_activity == 0:
        if signal.recent_activity < DEMAND_MIN_NEW_ACTIVITY:
            return None
        change_pct = None
        trend_level = "high"
    else:
        change_pct = (signal.recent_activity - signal.prior_activity) / signal.prior_activity * 100
        if change_pct >= DEMAND_HIGH_GROWTH_PCT:
            trend_level = "high"
        elif change_pct >= DEMAND_MEDIUM_GROWTH_PCT:
            trend_level = "medium"
        else:
            trend_level = None

    # Every available copy already spoken for is a directly observed supply shortfall,
    # not a trend inference — worth surfacing (at least as "medium") even when the
    # recent-vs-prior trend itself doesn't clear a growth threshold.
    unmet_demand = signal.total_copies > 0 and signal.pending_reservations >= signal.total_copies

    if trend_level is None and not unmet_demand:
        return None

    level: DemandLevel = "high" if (trend_level == "high" or unmet_demand) else "medium"

    return DemandForecast(
        recent_activity=signal.recent_activity,
        prior_activity=signal.prior_activity,
        change_pct=change_pct,
        pending_reservations=signal.pending_reservations,
        demand_level=level,
        reason=_demand_reason(signal, change_pct),
    )


# ── Late-return risk ─────────────────────────────────────────────────────────
RISK_MEDIUM_MIN = 34
RISK_HIGH_MIN = 67
RISK_SCORE_CAP = 97  # never claim near-certainty — this is a heuristic, not a guarantee
OVERDUE_BONUS = 40.0
DUE_SOON_DAYS = 2
DUE_SOON_BONUS = 15.0
LATE_RETURN_RESULT_LIMIT = 20

RiskLevel = Literal["low", "medium", "high"]


@dataclass
class MemberLoanHistory:
    late_returns: int
    total_returns: int


@dataclass
class LateReturnRisk:
    risk_score: int
    risk_level: RiskLevel
    reason: str


def score_late_return_risk(
    *,
    due_date: datetime,
    now: datetime,
    member_history: MemberLoanHistory | None,
    library_wide_late_rate_pct: float,
) -> LateReturnRisk:
    """member_history is None for a member with no returned loans yet — falls back to
    the library-wide average rather than assuming 0% or 100% for a borrower with no
    track record (both would be inventing a result the data doesn't support).
    """
    if member_history is not None and member_history.total_returns > 0:
        late_rate_pct = member_history.late_returns / member_history.total_returns * 100
        history_note = (
            f"returned {member_history.late_returns} of {member_history.total_returns} "
            f"past loan(s) late ({late_rate_pct:.0f}%)"
        )
    else:
        late_rate_pct = library_wide_late_rate_pct
        history_note = (
            f"no return history yet — using the library-wide average ({late_rate_pct:.0f}%)"
        )

    days_overdue = max(0, (now.date() - due_date.date()).days)
    days_until_due = (due_date.date() - now.date()).days

    score = late_rate_pct
    if days_overdue > 0:
        score += OVERDUE_BONUS
        status_note = f"already {days_overdue} day(s) overdue"
    elif 0 <= days_until_due <= DUE_SOON_DAYS:
        score += DUE_SOON_BONUS
        status_note = f"due in {days_until_due} day(s)"
    else:
        status_note = f"due in {days_until_due} day(s)"

    score_int = max(0, min(RISK_SCORE_CAP, round(score)))
    if score_int >= RISK_HIGH_MIN:
        level: RiskLevel = "high"
    elif score_int >= RISK_MEDIUM_MIN:
        level = "medium"
    else:
        level = "low"

    return LateReturnRisk(
        risk_score=score_int,
        risk_level=level,
        reason=f"{history_note[0].upper()}{history_note[1:]}; {status_note}.",
    )
