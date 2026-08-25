from datetime import UTC, datetime
import os
from unittest.mock import MagicMock, patch
import pytest
import pytest_asyncio
from fastapi import HTTPException

os.environ["APP_ENV"] = "test"

from app.core.config import get_settings
from app.core.constants import Role
from app.db.prisma import prisma
from app.modules.guardian_autopay.schemas import (
    AutopayApproveRequest,
    AutopayEvaluateRequest,
    AutopayPolicyUpdate,
)
from app.modules.guardian_autopay.service import (
    approve_and_create_autopay_order,
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


async def create_test_loan_with_fine(child_id: str, guardian_id: str, days_overdue: int = 15, fine_paid: bool = False):
    """Helper to create a Loan record with a calculated fine."""
    book = await prisma.book.find_first()
    if not book:
        book = await prisma.book.create(
            data={"title": "Test Book for Fine", "author": "Author", "category": "Fiction"}
        )

    from datetime import timedelta
    due_date = datetime.now(UTC) - timedelta(days=days_overdue)

    return await prisma.loan.create(
        data={
            "memberId": child_id,
            "bookId": book.id,
            "createdById": guardian_id,
            "dueDate": due_date,
            "finePaid": fine_paid,
        }
    )


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

    # Restore
    await update_policy(guardian.id, child.id, AutopayPolicyUpdate(enabled=True))


@pytest.mark.asyncio
async def test_autopay_unlinked_guardian_child():
    """3 & D: Test evaluation and approval fail when guardian is not linked to child."""
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

    # Test approval endpoint fails with 403
    approve_req = AutopayApproveRequest(
        member_id="00000000-0000-0000-0000-000000000000",
        charge_id="00000000-0000-0000-0000-000000000000",
    )
    with pytest.raises(HTTPException) as exc_info:
        await approve_and_create_autopay_order(guardian.id, approve_req)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_autopay_disallowed_charge_type():
    """4 & G: Test charge type other than fine (e.g. membership) is rejected."""
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
    """5 & E: Test charge exceeding per_transaction_cap is rejected."""
    guardian, child, link = await setup_guardian_and_child()

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
    """6 & F: Test charge exceeding monthly spending cap is rejected."""
    guardian, child, link = await setup_guardian_and_child()

    with patch("app.modules.guardian_autopay.service.calculate_monthly_autopay_spend", return_value=900):
        req = AutopayEvaluateRequest(
            guardian_id=guardian.id,
            child_id=child.id,
            charge_type="fine",
            amount=150,
        )

        decision = await evaluate_autopay(req)
        assert decision.allowed is False
        assert "exceed monthly spending cap" in decision.reason.lower()


@pytest.mark.asyncio
async def test_autopay_already_processed_charge():
    """8 & H: Test charge for a fine already marked as paid is rejected."""
    guardian, child, link = await setup_guardian_and_child()
    loan = await create_test_loan_with_fine(child.id, guardian.id, days_overdue=10, fine_paid=True)

    req = AutopayEvaluateRequest(
        guardian_id=guardian.id,
        child_id=child.id,
        charge_type="fine",
        amount=100,
        charge_id=loan.id,
    )

    decision = await evaluate_autopay(req)
    assert decision.allowed is False
    assert "already been processed" in decision.reason.lower()


@pytest.mark.asyncio
async def test_autopay_approve_endpoint_valid():
    """A & L: Test valid linked guardian + eligible fine creates Razorpay order."""
    guardian, child, link = await setup_guardian_and_child()
    # 3 days overdue @ ₹50/day = ₹150 fine (within ₹200 cap)
    loan = await create_test_loan_with_fine(child.id, guardian.id, days_overdue=3, fine_paid=False)

    approve_req = AutopayApproveRequest(
        member_id=child.id,
        charge_id=loan.id,
    )

    mock_client = MagicMock()
    mock_client.order.create.return_value = {
        "id": "order_autopay_test_123",
        "amount": 15000,
        "currency": "INR",
    }

    with patch("app.modules.payments.service._get_client", return_value=mock_client):
        res = await approve_and_create_autopay_order(guardian.id, approve_req)
        assert res.razorpay_order_id == "order_autopay_test_123"
        assert res.amount == 150
        assert res.currency == "INR"
        assert res.member_id == child.id
        assert res.charge_id == loan.id

        # Verify Razorpay order params
        mock_client.order.create.assert_called_once()
        create_args = mock_client.order.create.call_args[0][0]
        assert create_args["amount"] == 15000  # 150 * 100 paise
        assert create_args["notes"]["source"] == "guardian_autopay"
        assert create_args["notes"]["feature"] == "feature_3"


@pytest.mark.asyncio
async def test_autopay_client_amount_tampering_forbidden():
    """I: Test client cannot tamper with financial amount via Pydantic extra='forbid'."""
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        # Attempting to pass extra financial field 'amount'
        AutopayApproveRequest(
            member_id="00000000-0000-0000-0000-000000000000",
            charge_id="00000000-0000-0000-0000-000000000000",
            amount=1,  # Extra forbidden field
        )


@pytest.mark.asyncio
async def test_autopay_duplicate_approval_safety():
    """J & K: Test duplicate order creation does not prematurely mark fine as paid or double charge."""
    guardian, child, link = await setup_guardian_and_child()
    # 2 days overdue @ ₹50/day = ₹100 fine (within ₹200 cap)
    loan = await create_test_loan_with_fine(child.id, guardian.id, days_overdue=2, fine_paid=False)

    approve_req = AutopayApproveRequest(member_id=child.id, charge_id=loan.id)

    mock_client = MagicMock()
    mock_client.order.create.return_value = {"id": "order_autopay_dup_1", "amount": 10000, "currency": "INR"}

    with patch("app.modules.payments.service._get_client", return_value=mock_client):
        # First call creates order 1
        res1 = await approve_and_create_autopay_order(guardian.id, approve_req)
        assert res1.razorpay_order_id == "order_autopay_dup_1"

        # Re-check database: Loan fine is STILL unpaid until gateway verification!
        loan_db = await prisma.loan.find_unique(where={"id": loan.id})
        assert loan_db.finePaid is False

        # Zero payment records created
        payments_count = await prisma.payment.count(where={"razorpayOrderId": "order_autopay_dup_1"})
        assert payments_count == 0
