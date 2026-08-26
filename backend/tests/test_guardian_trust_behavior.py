from datetime import UTC, datetime, timedelta
import os
from uuid import uuid4
import pytest
import pytest_asyncio
from fastapi import HTTPException

os.environ["APP_ENV"] = "test"

from app.core.config import get_settings
from app.core.constants import Role
from app.db.prisma import prisma
from app.modules.guardian_autopay.service import execute_autonomous_autopay
from app.modules.guardian_autopay.trust_scoring import calculate_trust_tier

os.environ.setdefault("DATABASE_URL", get_settings().database_url)


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    """Ensure Prisma database is connected during test module."""
    if not prisma.is_connected():
        await prisma.connect()
    yield
    if prisma.is_connected():
        await prisma.disconnect()


async def setup_guardian_and_child(per_transaction_cap: int = 200, monthly_spending_cap: int = 1000):
    """Create a linked test guardian and child with specified policy caps."""
    guardian_role = await prisma.role.find_first(where={"name": Role.GUARDIAN})
    member_role = await prisma.role.find_first(where={"name": Role.MEMBER})

    uid = uuid4().hex[:8]
    guardian = await prisma.user.create(
        data={
            "email": f"trust_beh_g_{uid}@example.com",
            "fullName": "Trust Behavior Guardian",
            "passwordHash": "hashed",
            "roleId": guardian_role.id,
            "isActive": True,
        }
    )

    child = await prisma.user.create(
        data={
            "email": f"trust_beh_c_{uid}@example.com",
            "fullName": "Trust Behavior Child",
            "passwordHash": "hashed",
            "roleId": member_role.id,
            "isActive": True,
        }
    )

    link = await prisma.guardianlink.create(
        data={
            "guardianId": guardian.id,
            "memberId": child.id,
        }
    )

    policy = await prisma.guardianautopaypolicy.create(
        data={
            "guardianLinkId": link.id,
            "enabled": True,
            "perTransactionCap": per_transaction_cap,
            "monthlySpendingCap": monthly_spending_cap,
            "effectiveTransactionCap": per_transaction_cap,
            "allowedChargeTypes": ["fine"],
            "currentTrustTier": "BASELINE",
        }
    )
    return guardian, child, link, policy


async def get_test_book():
    book = await prisma.book.find_first()
    if not book:
        book = await prisma.book.create(
            data={"title": "Trust Behavior Book", "author": "Author", "category": "Fiction"}
        )
    return book


@pytest.mark.asyncio
async def test_1_high_trust_effective_cap_behavior():
    """TEST 1 — HIGH TRUST / EFFECTIVE CAP BEHAVIOR

    Verify:
    - 100% on-time return rate -> HIGH trust, 1.2 multiplier.
    - Theoretical cap = 200 * 1.2 = 240.
    - Effective cap is bounded by guardian hard ceiling (200).
    - Effective cap NEVER exceeds guardian_per_transaction_cap.
    - Audit/reasoning metadata contains all exact fields.
    """
    guardian, child, link, policy = await setup_guardian_and_child(per_transaction_cap=200)
    book = await get_test_book()
    now = datetime.now(UTC)

    # 10 on-time returned loans -> 100% rate -> HIGH tier
    for i in range(10):
        due = now - timedelta(days=30 - i)
        returned = due - timedelta(days=1)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": guardian.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    # Verify isolated trust calculation
    score = await calculate_trust_tier(child.id)
    assert score.tier == "HIGH"
    assert score.multiplier == 1.2
    assert score.on_time_rate == 1.0
    assert score.on_time_returns == 10
    assert score.total_returns == 10
    assert score.sample_size == 10

    # Overdue fine loan: 3 days late @ ₹50 = ₹150 fine
    fine_loan = await prisma.loan.create(
        data={
            "memberId": child.id,
            "bookId": book.id,
            "createdById": guardian.id,
            "dueDate": now - timedelta(days=3),
            "returnedAt": None,
            "finePaid": False,
        }
    )

    res = await execute_autonomous_autopay(fine_loan.id)
    assert res.success is True

    # Reload policy and audit logs
    updated_pol = await prisma.guardianautopaypolicy.find_unique(where={"guardianLinkId": link.id})
    assert updated_pol.currentTrustTier == "HIGH"

    # HARD CEILING PROOF: 200 * 1.2 = 240 theoretical, but effective cap MUST be 200!
    assert updated_pol.effectiveTransactionCap == 200
    assert updated_pol.effectiveTransactionCap <= updated_pol.perTransactionCap

    # Audit log verification
    tier_logs = await prisma.auditlogentry.find_many(
        where={
            "actorId": guardian.id,
            "action": "GUARDIAN_AUTOPAY_TRUST_TIER_CHANGED",
        }
    )
    assert len(tier_logs) == 1
    meta = tier_logs[0].metadata
    assert meta["on_time_return_rate"] == 1.0
    assert meta["on_time_returns"] == 10
    assert meta["total_returns"] == 10
    assert meta["sample_size"] == 10
    assert meta["multiplier"] == 1.2
    assert meta["guardian_per_transaction_cap"] == 200
    assert meta["theoretical_cap"] == 240
    assert meta["new_effective_cap"] == 200


@pytest.mark.asyncio
async def test_2_low_trust_reduces_effective_cap():
    """TEST 2 — LOW TRUST REDUCES EFFECTIVE CAP

    Verify:
    - 50% on-time rate -> LOW trust, 0.7 multiplier.
    - Guardian cap = 200 -> theoretical cap = 140, effective cap = 140.
    - Attempt autonomous fine of ₹150 (> ₹140, <= ₹200).
    - Execution is BLOCKED with HTTP 422 detailing effective cap violation.
    - Zero Payment records created, fine remains unpaid (finePaid == False).
    - Guardian notification dispatched & over-cap audit recorded.
    """
    guardian, child, link, policy = await setup_guardian_and_child(per_transaction_cap=200)
    book = await get_test_book()
    now = datetime.now(UTC)

    # 5 on-time, 5 late -> 50% -> LOW trust
    for i in range(5):
        due = now - timedelta(days=30 - i)
        returned = due - timedelta(days=1)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": guardian.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    for i in range(5):
        due = now - timedelta(days=10 - i)
        returned = due + timedelta(days=2)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": guardian.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    # Fine ₹150 (3 days late @ ₹50)
    fine_loan = await prisma.loan.create(
        data={
            "memberId": child.id,
            "bookId": book.id,
            "createdById": guardian.id,
            "dueDate": now - timedelta(days=3),
            "returnedAt": None,
            "finePaid": False,
        }
    )

    with pytest.raises(HTTPException) as exc_info:
        await execute_autonomous_autopay(fine_loan.id)

    assert exc_info.value.status_code == 422
    assert "exceeds per-transaction cap of ₹140" in exc_info.value.detail

    # Verify zero Payment records created for this child
    payments = await prisma.payment.find_many(where={"userId": child.id})
    assert len(payments) == 0

    # Verify loan fine Paid remains False
    reloaded_loan = await prisma.loan.find_unique(where={"id": fine_loan.id})
    assert reloaded_loan.finePaid is False

    # Verify guardian notification was created
    notifications = await prisma.notification.find_many(
        where={
            "userId": guardian.id,
        }
    )
    assert len(notifications) == 1

    # Verify over-cap audit record
    blocked_audits = await prisma.auditlogentry.find_many(
        where={
            "actorId": guardian.id,
            "action": "GUARDIAN_AUTOPAY_BLOCKED_OVERCAP",
        }
    )
    assert len(blocked_audits) == 1
    assert blocked_audits[0].metadata["reason_code"] == "TRANSACTION_CAP_EXCEEDED"
    assert blocked_audits[0].metadata["per_transaction_cap"] == 140


@pytest.mark.asyncio
async def test_3_baseline_trust_preserves_normal_behavior():
    """TEST 3 — BASELINE TRUST PRESERVES NORMAL BEHAVIOR

    Verify:
    - 80% on-time rate -> BASELINE trust, 1.0 multiplier.
    - Guardian cap = 200 -> theoretical cap = 200, effective cap = 200.
    - Autonomous fine of ₹150 succeeds.
    - Exactly one Payment created, finePaid becomes True, success audit recorded.
    """
    guardian, child, link, policy = await setup_guardian_and_child(per_transaction_cap=200)
    book = await get_test_book()
    now = datetime.now(UTC)

    # 8 on-time, 2 late -> 80% -> BASELINE
    for i in range(8):
        due = now - timedelta(days=30 - i)
        returned = due - timedelta(days=1)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": guardian.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    for i in range(2):
        due = now - timedelta(days=10 - i)
        returned = due + timedelta(days=2)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": guardian.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    fine_loan = await prisma.loan.create(
        data={
            "memberId": child.id,
            "bookId": book.id,
            "createdById": guardian.id,
            "dueDate": now - timedelta(days=3),
            "returnedAt": None,
            "finePaid": False,
        }
    )

    res = await execute_autonomous_autopay(fine_loan.id)
    assert res.success is True
    assert res.amount == 150

    # Exactly one Payment created for this child
    payments = await prisma.payment.find_many(where={"userId": child.id})
    assert len(payments) == 1

    # finePaid becomes True
    reloaded_loan = await prisma.loan.find_unique(where={"id": fine_loan.id})
    assert reloaded_loan.finePaid is True

    # Success audit recorded
    success_audits = await prisma.auditlogentry.find_many(
        where={
            "actorId": guardian.id,
            "action": "GUARDIAN_AUTOPAY_AUTONOMOUS_EXECUTED",
        }
    )
    assert len(success_audits) == 1


@pytest.mark.asyncio
async def test_4_high_trust_can_never_bypass_hard_ceiling():
    """TEST 4 — HIGH TRUST CAN NEVER BYPASS HARD CEILING

    Verify:
    - Guardian cap = 210, HIGH multiplier = 1.2.
    - Theoretical cap = 252 (210 * 1.2), but effective cap MUST remain 210.
    - Attempt ₹250 fine (5 days late @ ₹50).
    - ₹250 is <= theoretical 252, BUT > hard ceiling 210.
    - Expected: BLOCKED (HTTP 422), no Payment, fine remains unpaid, no success audit.
    """
    guardian, child, link, policy = await setup_guardian_and_child(per_transaction_cap=210)
    book = await get_test_book()
    now = datetime.now(UTC)

    # 10 on-time returns -> HIGH trust (multiplier 1.2)
    for i in range(10):
        due = now - timedelta(days=30 - i)
        returned = due - timedelta(days=1)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": guardian.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    # Fine loan of ₹250 (5 days late @ ₹50)
    fine_loan = await prisma.loan.create(
        data={
            "memberId": child.id,
            "bookId": book.id,
            "createdById": guardian.id,
            "dueDate": now - timedelta(days=5),
            "returnedAt": None,
            "finePaid": False,
        }
    )

    with pytest.raises(HTTPException) as exc_info:
        await execute_autonomous_autopay(fine_loan.id)

    assert exc_info.value.status_code == 422
    assert "exceeds per-transaction cap of ₹210" in exc_info.value.detail

    # No Payment created
    payments = await prisma.payment.find_many(where={"userId": child.id})
    assert len(payments) == 0

    # Fine remains unpaid
    reloaded_loan = await prisma.loan.find_unique(where={"id": fine_loan.id})
    assert reloaded_loan.finePaid is False

    # No successful execution audit logged for this loan
    exec_audits = await prisma.auditlogentry.find_many(
        where={
            "actorId": guardian.id,
            "action": "GUARDIAN_AUTOPAY_AUTONOMOUS_EXECUTED",
        }
    )
    assert len(exec_audits) == 0


@pytest.mark.asyncio
async def test_5_tier_change_audit_reasoning():
    """TEST 5 — TIER CHANGE AUDIT REASONING

    Verify:
    - Transition from BASELINE -> LOW records detailed audit reasoning.
    - previous_tier = BASELINE, new_tier = LOW, previous_effective_cap = 200, new_effective_cap = 140.
    - rate, return counts, sample size, multiplier, guardian hard ceiling, theoretical cap recorded.
    - Exactly ONE GUARDIAN_AUTOPAY_TRUST_TIER_CHANGED audit entry created.
    """
    guardian, child, link, policy = await setup_guardian_and_child(per_transaction_cap=200)
    book = await get_test_book()
    now = datetime.now(UTC)

    # Initial state: 0 returns -> BASELINE, cap 200
    # Now add 10 LATE returns -> 0% rate -> LOW trust
    for i in range(10):
        due = now - timedelta(days=30 - i)
        returned = due + timedelta(days=2)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": guardian.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    fine_loan = await prisma.loan.create(
        data={
            "memberId": child.id,
            "bookId": book.id,
            "createdById": guardian.id,
            "dueDate": now - timedelta(days=2),  # ₹100 fine (within ₹140 LOW cap)
            "returnedAt": None,
            "finePaid": False,
        }
    )

    await execute_autonomous_autopay(fine_loan.id)

    tier_logs = await prisma.auditlogentry.find_many(
        where={
            "actorId": guardian.id,
            "action": "GUARDIAN_AUTOPAY_TRUST_TIER_CHANGED",
        }
    )
    assert len(tier_logs) == 1
    meta = tier_logs[0].metadata

    assert meta["previous_trust_tier"] == "BASELINE"
    assert meta["new_trust_tier"] == "LOW"
    assert meta["previous_effective_cap"] == 200
    assert meta["new_effective_cap"] == 140
    assert meta["on_time_return_rate"] == 0.0
    assert meta["on_time_returns"] == 0
    assert meta["total_returns"] == 10
    assert meta["sample_size"] == 10
    assert meta["multiplier"] == 0.7
    assert meta["guardian_per_transaction_cap"] == 200
    assert meta["theoretical_cap"] == 140
    assert "LOW" in meta["reason"]


@pytest.mark.asyncio
async def test_6_no_audit_spam_when_nothing_changes():
    """TEST 6 — NO AUDIT SPAM WHEN NOTHING CHANGES

    Verify:
    - Repeated autonomous evaluations with unchanged trust tier produce ZERO additional GUARDIAN_AUTOPAY_TRUST_TIER_CHANGED audit entries.
    """
    guardian, child, link, policy = await setup_guardian_and_child(per_transaction_cap=200)
    book = await get_test_book()
    now = datetime.now(UTC)

    # Execute 3 separate autonomous payments under BASELINE (0 returns)
    for i in range(3):
        loan = await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": guardian.id,
                "dueDate": now - timedelta(days=2),
                "returnedAt": None,
                "finePaid": False,
            }
        )
        res = await execute_autonomous_autopay(loan.id)
        assert res.success is True

    tier_logs = await prisma.auditlogentry.find_many(
        where={
            "actorId": guardian.id,
            "action": "GUARDIAN_AUTOPAY_TRUST_TIER_CHANGED",
        }
    )
    assert len(tier_logs) == 0


@pytest.mark.asyncio
async def test_7_15_loan_window_is_respected():
    """TEST 7 — 15-LOAN WINDOW IS RESPECTED

    Verify:
    - Create 25 returned loans:
      - 10 oldest returned loans: all LATE.
      - 15 newest returned loans: all ON-TIME.
    - calculate_trust_tier() evaluates ONLY the 15 most recent returned loans.
    - Score MUST be HIGH (100% rate, 15/15).
    """
    guardian, child, link, policy = await setup_guardian_and_child(per_transaction_cap=200)
    book = await get_test_book()
    now = datetime.now(UTC)

    # 10 oldest returned loans (days 50..41 ago): all LATE
    for i in range(10):
        due = now - timedelta(days=50 - i)
        returned = due + timedelta(days=5)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": guardian.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    # 15 newest returned loans (days 30..16 ago): all ON-TIME
    for i in range(15):
        due = now - timedelta(days=30 - i)
        returned = due - timedelta(days=1)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": guardian.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    score = await calculate_trust_tier(child.id)
    assert score.sample_size == 15
    assert score.total_returns == 15
    assert score.on_time_returns == 15
    assert score.on_time_rate == 1.0
    assert score.tier == "HIGH"
    assert score.multiplier == 1.2


@pytest.mark.asyncio
async def test_8_active_unreturned_loans_do_not_affect_score():
    """TEST 8 — ACTIVE / UNRETURNED LOANS DO NOT AFFECT SCORE

    Verify:
    - 10 returned loans ON-TIME -> HIGH trust.
    - 20 ACTIVE loans with returnedAt = None.
    - Active loans are ignored in denominator. Score remains HIGH (100%, 10/10).
    """
    guardian, child, link, policy = await setup_guardian_and_child(per_transaction_cap=200)
    book = await get_test_book()
    now = datetime.now(UTC)

    # 10 returned loans ON-TIME
    for i in range(10):
        due = now - timedelta(days=30 - i)
        returned = due - timedelta(days=1)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": guardian.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    # 20 ACTIVE loans (returnedAt is None)
    for i in range(20):
        due = now - timedelta(days=10 - i)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": guardian.id,
                "dueDate": due,
                "returnedAt": None,
                "finePaid": False,
            }
        )

    score = await calculate_trust_tier(child.id)
    assert score.sample_size == 10
    assert score.total_returns == 10
    assert score.on_time_returns == 10
    assert score.on_time_rate == 1.0
    assert score.tier == "HIGH"


@pytest.mark.asyncio
async def test_9_no_history_default():
    """TEST 9 — NO HISTORY DEFAULT

    Verify:
    - Child with 0 returned loans defaults to BASELINE trust.
    - tier = BASELINE, multiplier = 1.0, on_time_rate = 0.0, sample_size = 0.
    """
    guardian, child, link, policy = await setup_guardian_and_child(per_transaction_cap=200)

    score = await calculate_trust_tier(child.id)
    assert score.tier == "BASELINE"
    assert score.multiplier == 1.0
    assert score.on_time_rate == 0.0
    assert score.on_time_returns == 0
    assert score.total_returns == 0
    assert score.sample_size == 0


@pytest.mark.asyncio
async def test_10_monthly_cap_remains_unchanged():
    """TEST 10 — MONTHLY CAP REMAINS UNCHANGED

    Verify:
    - Trust Ladder only affects transaction-cap dimension.
    - Monthly cap exceeded produces MONTHLY_CAP_EXCEEDED policy rejection.
    """
    guardian, child, link, policy = await setup_guardian_and_child(per_transaction_cap=200, monthly_spending_cap=200)
    book = await get_test_book()
    now = datetime.now(UTC)

    # Settle first fine of ₹150 under BASELINE (within ₹200 transaction cap & ₹200 monthly cap)
    loan1 = await prisma.loan.create(
        data={
            "memberId": child.id,
            "bookId": book.id,
            "createdById": guardian.id,
            "dueDate": now - timedelta(days=3),
            "returnedAt": None,
            "finePaid": False,
        }
    )
    res1 = await execute_autonomous_autopay(loan1.id)
    assert res1.success is True
    assert res1.amount == 150

    # Second fine of ₹100.
    # Transaction cap ₹200 is satisfied (100 <= 200).
    # But monthly spent ₹150 + ₹100 = ₹250 exceeds monthly cap of ₹200!
    loan2 = await prisma.loan.create(
        data={
            "memberId": child.id,
            "bookId": book.id,
            "createdById": guardian.id,
            "dueDate": now - timedelta(days=2),
            "returnedAt": None,
            "finePaid": False,
        }
    )

    with pytest.raises(HTTPException) as exc_info:
        await execute_autonomous_autopay(loan2.id)

    assert exc_info.value.status_code == 422
    assert "monthly spending cap" in exc_info.value.detail.lower()

    # Verify over-cap audit record specifically identifies MONTHLY_CAP_EXCEEDED
    monthly_audits = await prisma.auditlogentry.find_many(
        where={
            "actorId": guardian.id,
            "action": "GUARDIAN_AUTOPAY_BLOCKED_OVERCAP",
        }
    )
    assert len(monthly_audits) == 1
    assert monthly_audits[0].metadata["reason_code"] == "MONTHLY_CAP_EXCEEDED"
