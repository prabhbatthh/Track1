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
from app.modules.guardian_autopay.service import execute_autonomous_autopay, get_or_create_policy

os.environ.setdefault("DATABASE_URL", get_settings().database_url)


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    """Ensure Prisma database is connected during test module."""
    if not prisma.is_connected():
        await prisma.connect()
    yield
    if prisma.is_connected():
        await prisma.disconnect()


async def setup_guardian_and_child():
    """Create a linked test guardian and child."""
    guardian_role = await prisma.role.find_first(where={"name": Role.GUARDIAN})
    member_role = await prisma.role.find_first(where={"name": Role.MEMBER})

    uid = uuid4().hex[:8]
    guardian = await prisma.user.create(
        data={
            "email": f"trust_g_{uid}@example.com",
            "fullName": "Trust Guardian",
            "passwordHash": "hashed",
            "roleId": guardian_role.id,
            "isActive": True,
        }
    )

    child = await prisma.user.create(
        data={
            "email": f"trust_c_{uid}@example.com",
            "fullName": "Trust Child",
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

    # Initialize default policy (cap 200)
    await get_or_create_policy(guardian.id, child.id)
    return guardian, child, link


async def get_test_book():
    book = await prisma.book.find_first()
    if not book:
        book = await prisma.book.create(
            data={"title": "Trust Integration Book", "author": "Author", "category": "Fiction"}
        )
    return book


@pytest.mark.asyncio
async def test_high_trust_calculation_hard_ceiling():
    """HIGH trust theoretical cap is ₹240, but hard ceiling caps effective cap at ₹200."""
    guardian, child, link = await setup_guardian_and_child()
    book = await get_test_book()
    now = datetime.now(UTC)

    # 10 on-time returned loans -> 100% rate -> HIGH trust (multiplier 1.2)
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
    assert res.amount == 150

    policy = await prisma.guardianautopaypolicy.find_unique(where={"guardianLinkId": link.id})
    assert policy.currentTrustTier == "HIGH"
    # HARD CEILING: 200 * 1.2 = 240 theoretical, but effective cap MUST be 200!
    assert policy.effectiveTransactionCap == 200
    assert policy.perTransactionCap == 200


@pytest.mark.asyncio
async def test_baseline_trust_calculation():
    """BASELINE trust multiplier 1.0 -> effective cap equals configured cap ₹200."""
    guardian, child, link = await setup_guardian_and_child()
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

    policy = await prisma.guardianautopaypolicy.find_unique(where={"guardianLinkId": link.id})
    assert policy.currentTrustTier == "BASELINE"
    assert policy.effectiveTransactionCap == 200


@pytest.mark.asyncio
async def test_low_trust_reduces_effective_cap_and_blocks_150_fine():
    """LOW trust (50% on-time) -> multiplier 0.7 -> effective cap ₹140. Blocks ₹150 fine."""
    guardian, child, link = await setup_guardian_and_child()
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

    # Fine ₹150 (3 days late @ ₹50). Should be BLOCKED because effective cap is ₹140!
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

    policy = await prisma.guardianautopaypolicy.find_unique(where={"guardianLinkId": link.id})
    assert policy.currentTrustTier == "LOW"
    assert policy.effectiveTransactionCap == 140

    # Verify fine remains unpaid
    reloaded_loan = await prisma.loan.find_unique(where={"id": fine_loan.id})
    assert reloaded_loan.finePaid is False


@pytest.mark.asyncio
async def test_baseline_allows_150_fine_whereas_low_blocks():
    """Demonstrates that ₹150 is allowed under BASELINE (cap 200) but blocked under LOW (cap 140)."""
    # 1. BASELINE case
    guardian_b, child_b, link_b = await setup_guardian_and_child()
    book = await get_test_book()
    now = datetime.now(UTC)

    # No returns -> BASELINE -> cap 200
    loan_b = await prisma.loan.create(
        data={
            "memberId": child_b.id,
            "bookId": book.id,
            "createdById": guardian_b.id,
            "dueDate": now - timedelta(days=3),
            "returnedAt": None,
            "finePaid": False,
        }
    )

    res_b = await execute_autonomous_autopay(loan_b.id)
    assert res_b.success is True
    assert res_b.amount == 150

    # 2. LOW case
    guardian_l, child_l, link_l = await setup_guardian_and_child()
    for i in range(10):
        due = now - timedelta(days=20 - i)
        returned = due + timedelta(days=5)  # All late -> 0% rate -> LOW
        await prisma.loan.create(
            data={
                "memberId": child_l.id,
                "bookId": book.id,
                "createdById": guardian_l.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    loan_l = await prisma.loan.create(
        data={
            "memberId": child_l.id,
            "bookId": book.id,
            "createdById": guardian_l.id,
            "dueDate": now - timedelta(days=3),
            "returnedAt": None,
            "finePaid": False,
        }
    )

    with pytest.raises(HTTPException) as exc_info:
        await execute_autonomous_autopay(loan_l.id)
    assert exc_info.value.status_code == 422
    assert "exceeds per-transaction cap of ₹140" in exc_info.value.detail


@pytest.mark.asyncio
async def test_tier_change_audit_logging():
    """Verify GUARDIAN_AUTOPAY_TRUST_TIER_CHANGED audit log is recorded when tier changes."""
    guardian, child, link = await setup_guardian_and_child()
    book = await get_test_book()
    now = datetime.now(UTC)

    # Initial state is BASELINE (0 returns). Create 10 late returns -> LOW trust
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

    fine_loan1 = await prisma.loan.create(
        data={
            "memberId": child.id,
            "bookId": book.id,
            "createdById": guardian.id,
            "dueDate": now - timedelta(days=2),  # ₹100 fine (within ₹140 LOW cap)
            "returnedAt": None,
            "finePaid": False,
        }
    )

    await execute_autonomous_autopay(fine_loan1.id)

    # Verify GUARDIAN_AUTOPAY_TRUST_TIER_CHANGED audit log
    logs = await prisma.auditlogentry.find_many(
        where={
            "actorId": guardian.id,
            "action": "GUARDIAN_AUTOPAY_TRUST_TIER_CHANGED",
        }
    )
    assert len(logs) == 1
    meta = logs[0].metadata
    assert meta["previous_trust_tier"] == "BASELINE"
    assert meta["new_trust_tier"] == "LOW"
    assert meta["previous_effective_cap"] == 200
    assert meta["new_effective_cap"] == 140
    assert "LOW" in meta["reason"]


@pytest.mark.asyncio
async def test_same_tier_repeated_execution_no_duplicate_audit():
    """Verify executing multiple times with unchanged trust tier produces NO duplicate tier-change logs."""
    guardian, child, link = await setup_guardian_and_child()
    book = await get_test_book()
    now = datetime.now(UTC)

    # Execute twice under BASELINE (0 returns)
    loan1 = await prisma.loan.create(
        data={
            "memberId": child.id,
            "bookId": book.id,
            "createdById": guardian.id,
            "dueDate": now - timedelta(days=2),
            "returnedAt": None,
            "finePaid": False,
        }
    )
    loan2 = await prisma.loan.create(
        data={
            "memberId": child.id,
            "bookId": book.id,
            "createdById": guardian.id,
            "dueDate": now - timedelta(days=3),
            "returnedAt": None,
            "finePaid": False,
        }
    )

    await execute_autonomous_autopay(loan1.id)
    await execute_autonomous_autopay(loan2.id)

    # Because initial tier was BASELINE and tier remained BASELINE on both executions, 0 tier change logs created
    logs = await prisma.auditlogentry.find_many(
        where={
            "actorId": guardian.id,
            "action": "GUARDIAN_AUTOPAY_TRUST_TIER_CHANGED",
        }
    )
    assert len(logs) == 0


@pytest.mark.asyncio
async def test_trust_recalculation_on_new_returns():
    """Verify that adding new returned loans updates trust tier dynamically on next execution."""
    guardian, child, link = await setup_guardian_and_child()
    book = await get_test_book()
    now = datetime.now(UTC)

    # 1. 10 late returns -> LOW trust
    for i in range(10):
        due = now - timedelta(days=40 - i)
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

    loan1 = await prisma.loan.create(
        data={
            "memberId": child.id,
            "bookId": book.id,
            "createdById": guardian.id,
            "dueDate": now - timedelta(days=2),
            "returnedAt": None,
            "finePaid": False,
        }
    )
    await execute_autonomous_autopay(loan1.id)

    pol1 = await prisma.guardianautopaypolicy.find_unique(where={"guardianLinkId": link.id})
    assert pol1.currentTrustTier == "LOW"

    # 2. Child returns 15 new books ON-TIME
    for i in range(15):
        due = now - timedelta(days=15 - i)
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
    await execute_autonomous_autopay(loan2.id)

    pol2 = await prisma.guardianautopaypolicy.find_unique(where={"guardianLinkId": link.id})
    # Trust tier dynamically updated to HIGH!
    assert pol2.currentTrustTier == "HIGH"
    assert pol2.effectiveTransactionCap == 200


@pytest.mark.asyncio
async def test_simulate_trust_history_late_return_and_restore():
    """Verify simulate_trust_history endpoints for late return downgrade and baseline restore."""
    from app.modules.guardian_autopay.service import simulate_trust_history

    guardian, child, link = await setup_guardian_and_child()

    # 1. Downgrade to LOW
    res_late = await simulate_trust_history(guardian.id, "simulate_late_return")
    assert res_late.trust_tier == "LOW"
    assert res_late.effective_transaction_cap == 140

    pol_low = await prisma.guardianautopaypolicy.find_unique(where={"guardianLinkId": link.id})
    assert pol_low.currentTrustTier == "LOW"
    assert pol_low.effectiveTransactionCap == 140

    # 2. Restore to BASELINE
    res_restore = await simulate_trust_history(guardian.id, "restore")
    assert res_restore.trust_tier in ["BASELINE", "HIGH"]
    assert res_restore.effective_transaction_cap == 200

    pol_restored = await prisma.guardianautopaypolicy.find_unique(where={"guardianLinkId": link.id})
    assert pol_restored.currentTrustTier in ["BASELINE", "HIGH"]
    assert pol_restored.effectiveTransactionCap == 200
