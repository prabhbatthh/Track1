"""Admin reporting maths — pure functions, no database needed.

Covers the two arithmetic defects the follow-up audit found: trend percentages went
negative when the baseline was a loss, and the admin members table re-derived
membership expiry with a 30-day month instead of sharing the member-facing function.
"""

from datetime import UTC, datetime

from app.modules.admin.service import _trend
from app.modules.payments.service import calculate_membership_expiry


class _Payment:
    """Minimal stand-in for the fields calculate_membership_expiry reads."""

    def __init__(self, created_at: datetime, plan_months: int) -> None:
        self.createdAt = created_at
        self.planMonths = plan_months


def test_trend_percent_is_never_negative_for_a_shrinking_loss():
    trend = _trend(-100, -200)

    assert trend.direction == "up"
    assert trend.percent == 50


def test_trend_percent_is_never_negative_for_a_deepening_loss():
    trend = _trend(-400, -200)

    assert trend.direction == "down"
    assert trend.percent == 100


def test_trend_still_correct_for_ordinary_positive_growth():
    trend = _trend(150, 100)

    assert trend.direction == "up"
    assert trend.percent == 50


def test_trend_handles_a_zero_baseline():
    assert _trend(10, 0).percent == 100
    assert _trend(0, 0).percent == 0


def test_annual_membership_expiry_uses_calendar_months_not_30_day_blocks():
    """The 30-day approximation put a 12-month plan five days early."""
    bought = datetime(2026, 1, 15, tzinfo=UTC)

    expires = calculate_membership_expiry([_Payment(bought, 12)])

    assert expires == datetime(2027, 1, 15, tzinfo=UTC)


def test_renewals_extend_the_membership_rather_than_replacing_it():
    """The admin view read only the latest payment, so renewals vanished from it."""
    first = datetime(2026, 1, 15, tzinfo=UTC)
    renewal = datetime(2026, 1, 20, tzinfo=UTC)

    expires = calculate_membership_expiry([_Payment(first, 1), _Payment(renewal, 1)])

    # First payment covers to 15 Feb; the renewal extends from there, not from its own date.
    assert expires == datetime(2026, 3, 15, tzinfo=UTC)


def test_no_payments_means_no_expiry():
    assert calculate_membership_expiry([]) is None
