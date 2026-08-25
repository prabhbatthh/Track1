import os
from unittest.mock import MagicMock, patch
import pytest
import pytest_asyncio

os.environ["APP_ENV"] = "test"

from app.core.config import get_settings
from app.core.constants import Role
from app.db.prisma import prisma
from app.modules.guardian_autopay.schemas import (
    AutopayEvaluateRequest,
    AutopayPolicyUpdate,
)
from app.modules.guardian_autopay.service import (
    evaluate_autopay,
    get_or_create_policy,
    update_policy,
)

os.environ.setdefault("DATABASE_URL", get_settings().database_url)


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    """Ensure Prisma database is connected during tests module."""
    if not prisma.is_connected():
        await prisma.connect()
    yield
    if prisma.is_connected():
        await prisma.disconnect()


async def setup_guardian_and_child():
    """Create or find a test guardian and linked member child."""
    guardian_role = await prisma.role.find_first(where={"name": Role.GUARDIAN})
    member_role = await prisma.role.find_first(where={"name": Role.MEMBER})

    guardian = await prisma.user.find_first(where={"email": "test_guardian_autopay@example.com"})
    if not guardian:
        guardian = await prisma.user.create(
            data={
                "email": "test_guardian_autopay@example.com",
                "fullName": "Test Guardian",
                "passwordHash": "hashed",
                "roleId": guardian_role.id,
                "isActive": True,
            }
        )

    child = await prisma.user.find_first(where={"email": "test_child_autopay@example.com"})
    if not child:
        child = await prisma.user.create(
            data={
                "email": "test_child_autopay@example.com",
                "fullName": "Test Child Member",
                "passwordHash": "hashed",
                "roleId": member_role.id,
                "isActive": True,
            }
        )

    link = await prisma.guardianlink.find_first(where={"guardianId": guardian.id, "memberId": child.id})
    if not link:
        link = await prisma.guardianlink.create(
            data={
                "guardianId": guardian.id,
                "memberId": child.id,
            }
        )

    return guardian, child, link


@pytest.mark.asyncio
async def test_autopay_valid_policy_and_evaluation():
    """1 & 7: Test valid policy creation and compliant fine charge approval."""
    guardian, child, link = await setup_guardian_and_child()

    policy = await get_or_create_policy(guardian.id, child.id)
    assert policy.enabled is True
    assert policy.per_transaction_cap == 200
    assert policy.monthly_spending_cap == 1000

    req = AutopayEvaluateRequest(
        guardian_id=guardian.id,
        child_id=child.id,
        charge_type="fine",
        amount=150,
    )

    decision = await evaluate_autopay(req)
    assert decision.allowed is True
    assert "within the guardian's" in decision.reason
    assert decision.transaction_cap == 200
    assert decision.monthly_cap == 1000


@pytest.mark.asyncio
async def test_autopay_disabled_policy():
    """2: Test evaluation when auto-pay is disabled."""
    guardian, child, link = await setup_guardian_and_child()

    # Disable auto-pay
    await update_policy(guardian.id, child.id, AutopayPolicyUpdate(enabled=False))

    req = AutopayEvaluateRequest(
        guardian_id=guardian.id,
        child_id=child.id,
        charge_type="fine",
        amount=50,
    )

    decision = await evaluate_autopay(req)
    assert decision.allowed is False
    assert "disabled" in decision.reason.lower()

    # Restore enabled
    await update_policy(guardian.id, child.id, AutopayPolicyUpdate(enabled=True))


@pytest.mark.asyncio
async def test_autopay_unlinked_guardian_child():
    """3: Test evaluation fails when guardian is not linked to child."""
    guardian, child, link = await setup_guardian_and_child()

    req = AutopayEvaluateRequest(
        guardian_id=guardian.id,
        child_id="00000000-0000-0000-0000-000000000000",
        charge_type="fine",
        amount=50,
    )

    decision = await evaluate_autopay(req)
    assert decision.allowed is False
    assert "not linked" in decision.reason.lower()


@pytest.mark.asyncio
async def test_autopay_disallowed_charge_type():
    """4: Test charge type other than fine (e.g. membership) is rejected."""
    guardian, child, link = await setup_guardian_and_child()

    req = AutopayEvaluateRequest(
        guardian_id=guardian.id,
        child_id=child.id,
        charge_type="membership_renewal",
        amount=100,
    )

    decision = await evaluate_autopay(req)
    assert decision.allowed is False
    assert "not allowed" in decision.reason.lower()


@pytest.mark.asyncio
async def test_autopay_transaction_cap_exceeded():
    """5: Test charge exceeding per_transaction_cap is rejected."""
    guardian, child, link = await setup_guardian_and_child()

    # Cap is 200, charge is 250
    req = AutopayEvaluateRequest(
        guardian_id=guardian.id,
        child_id=child.id,
        charge_type="fine",
        amount=250,
    )

    decision = await evaluate_autopay(req)
    assert decision.allowed is False
    assert "exceeds per-transaction cap" in decision.reason.lower()


@pytest.mark.asyncio
async def test_autopay_monthly_cap_exceeded():
    """6: Test charge exceeding monthly spending cap is rejected."""
    guardian, child, link = await setup_guardian_and_child()

    # Mock monthly spent to 900 (cap is 1000)
    with patch("app.modules.guardian_autopay.service.calculate_monthly_autopay_spend", return_value=900):
        req = AutopayEvaluateRequest(
            guardian_id=guardian.id,
            child_id=child.id,
            charge_type="fine",
            amount=150,  # 900 + 150 = 1050 > 1000
        )

        decision = await evaluate_autopay(req)
        assert decision.allowed is False
        assert "exceed monthly spending cap" in decision.reason.lower()


@pytest.mark.asyncio
async def test_autopay_already_processed_charge():
    """8: Test charge for a fine already marked as paid is rejected."""
    guardian, child, link = await setup_guardian_and_child()

    # Create dummy loan marked finePaid = True
    book = await prisma.book.find_first()
    if not book:
        book = await prisma.book.create(
            data={"title": "Test Book", "author": "Author", "category": "Fiction"}
        )

    from datetime import UTC, datetime

    loan = await prisma.loan.create(
        data={
            "memberId": child.id,
            "bookId": book.id,
            "createdById": guardian.id,
            "dueDate": datetime.now(UTC),
            "finePaid": True,  # Already processed
        }
    )

    req = AutopayEvaluateRequest(
        guardian_id=guardian.id,
        child_id=child.id,
        charge_type="fine",
        amount=50,
        charge_id=loan.id,
    )

    decision = await evaluate_autopay(req)
    assert decision.allowed is False
    assert "already been processed" in decision.reason.lower()
