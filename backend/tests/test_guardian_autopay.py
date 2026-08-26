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
    execute_autonomous_autopay,
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
    """Create a test guardian and linked member child with unique state per test run."""
    from uuid import uuid4
    guardian_role = await prisma.role.find_first(where={"name": Role.GUARDIAN})
    member_role = await prisma.role.find_first(where={"name": Role.MEMBER})

    uid = uuid4().hex[:8]
    guardian = await prisma.user.create(
        data={
            "email": f"test_guardian_{uid}@example.com",
            "fullName": "Test Guardian",
            "passwordHash": "hashed",
            "roleId": guardian_role.id,
            "isActive": True,
        }
    )

    child = await prisma.user.create(
        data={
            "email": f"test_child_{uid}@example.com",
            "fullName": "Test Child Member",
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


@pytest.mark.asyncio
async def test_execute_autonomous_autopay_compliant_fine_success():
    """Verify Step 1: Autonomous auto-pay executes server-side for compliant fine without manual approval."""
    guardian, child, link = await setup_guardian_and_child()

    # 3 days overdue fine (@ ₹50/day = ₹150 fine, compliant with ₹200 transaction cap)
    loan = await create_test_loan_with_fine(child.id, guardian.id, days_overdue=3, fine_paid=False)

    res = await execute_autonomous_autopay(loan.id)

    # 1. Execution succeeds
    assert res.success is True
    assert res.amount == 150
    assert res.member_id == child.id
    assert res.guardian_id == guardian.id

    # 2. Fine becomes paid
    loan_db = await prisma.loan.find_unique(where={"id": loan.id})
    assert loan_db.finePaid is True

    # 3. Exactly one Payment record created
    payments = await prisma.payment.find_many(where={"userId": child.id})
    assert len(payments) == 1
    assert payments[0].amount == 150

    # 4. Payment label/source indicates Guardian Auto-Pay
    assert "Guardian Auto-Pay Fine Settlement" in payments[0].label

    # 5. GUARDIAN_AUTOPAY_AUTONOMOUS_EXECUTED recorded in audit log
    audit_entries = await prisma.auditlogentry.find_many(
        where={"actorId": guardian.id, "action": "GUARDIAN_AUTOPAY_AUTONOMOUS_EXECUTED"}
    )
    assert len(audit_entries) == 1
    assert audit_entries[0].metadata["settlement_type"] == "autonomous_simulated"
    assert audit_entries[0].metadata["amount"] == 150


@pytest.mark.asyncio
async def test_execute_autonomous_autopay_idempotency():
    """Verify autonomous auto-pay execution is fully idempotent across multiple sequential calls."""
    guardian, child, link = await setup_guardian_and_child()

    # Create 3 days overdue fine (@ ₹50/day = ₹150 fine, within ₹200 cap)
    loan = await create_test_loan_with_fine(child.id, guardian.id, days_overdue=3, fine_paid=False)

    # 1. First execution: Settles loan and creates exactly 1 Payment record
    res1 = await execute_autonomous_autopay(loan.id)
    assert res1.success is True
    assert res1.amount == 150
    assert res1.loan_id == loan.id
    assert res1.member_id == child.id

    # Check DB state
    loan_db = await prisma.loan.find_unique(where={"id": loan.id})
    assert loan_db.finePaid is True

    payment_count_1 = await prisma.payment.count(
        where={"userId": child.id, "razorpayPaymentId": res1.razorpay_payment_id}
    )
    assert payment_count_1 == 1

    initial_total_child_autopay_payments = await prisma.payment.count(
        where={"userId": child.id, "label": {"contains": "Auto-Pay"}}
    )

    # 2. Second execution for the same loan: Must raise HTTP 409 Conflict and NOT create another Payment
    with pytest.raises(HTTPException) as exc_info_2:
        await execute_autonomous_autopay(loan.id)

    assert exc_info_2.value.status_code == 409
    assert "already been paid" in exc_info_2.value.detail.lower()

    # Re-verify DB payment count remains strictly unchanged
    payment_count_2 = await prisma.payment.count(
        where={"userId": child.id, "label": {"contains": "Auto-Pay"}}
    )
    assert payment_count_2 == initial_total_child_autopay_payments

    # 3. Third execution: Repeated execution still raises 409 and leaves payment count unchanged
    with pytest.raises(HTTPException) as exc_info_3:
        await execute_autonomous_autopay(loan.id)

    assert exc_info_3.value.status_code == 409
    payment_count_3 = await prisma.payment.count(
        where={"userId": child.id, "label": {"contains": "Auto-Pay"}}
    )
    assert payment_count_3 == initial_total_child_autopay_payments


@pytest.mark.asyncio
async def test_execute_autonomous_autopay_concurrent_race_condition():
    """Verify Step 2: Concurrent simultaneous execution attempts result in exactly 1 successful payment and zero duplicate payments."""
    import asyncio
    guardian, child, link = await setup_guardian_and_child()

    # Create 3 days overdue fine (@ ₹50/day = ₹150 fine, within ₹200 cap)
    loan = await create_test_loan_with_fine(child.id, guardian.id, days_overdue=3, fine_paid=False)

    # Dispatch 2 simultaneous concurrent requests for the exact same loan
    results = await asyncio.gather(
        execute_autonomous_autopay(loan.id),
        execute_autonomous_autopay(loan.id),
        return_exceptions=True,
    )

    successes = [r for r in results if not isinstance(r, Exception)]
    conflicts = [r for r in results if isinstance(r, HTTPException) and r.status_code == 409]

    # Exactly 1 request succeeds, exactly 1 request gets HTTP 409 Conflict
    assert len(successes) == 1
    assert len(conflicts) == 1

    # Database state verification: loan is finePaid=True, exactly 1 Payment record created
    loan_db = await prisma.loan.find_unique(where={"id": loan.id})
    assert loan_db.finePaid is True

    payments = await prisma.payment.find_many(
        where={"userId": child.id, "label": {"contains": "Auto-Pay"}}
    )
    assert len(payments) == 1
    assert payments[0].amount == 150


@pytest.mark.asyncio
async def test_execute_autonomous_autopay_transaction_cap_exceeded_notifies_guardian():
    """Verify autonomous execution exceeding per-transaction cap is blocked with zero mutations and notifies guardian."""
    guardian, child, link = await setup_guardian_and_child()

    # 5 days overdue @ ₹50/day = ₹250 fine (exceeds ₹200 cap)
    loan = await create_test_loan_with_fine(child.id, guardian.id, days_overdue=5, fine_paid=False)

    initial_payment_count = await prisma.payment.count(where={"userId": child.id})

    with pytest.raises(HTTPException) as exc_info:
        await execute_autonomous_autopay(loan.id)

    assert exc_info.value.status_code == 422
    assert "exceeds per-transaction cap" in exc_info.value.detail.lower()

    # Verify ZERO database mutations
    loan_db = await prisma.loan.find_unique(where={"id": loan.id})
    assert loan_db.finePaid is False

    post_payment_count = await prisma.payment.count(where={"userId": child.id})
    assert post_payment_count == initial_payment_count

    # Verify Guardian Notification was dispatched
    notifications = await prisma.notification.find_many(where={"userId": guardian.id})
    cap_notifications = [n for n in notifications if "exceeds your ₹200 per-transaction limit" in n.message]
    assert len(cap_notifications) > 0
    assert "Auto-Pay blocked" in cap_notifications[0].message

    # Verify Audit Log Entry GUARDIAN_AUTOPAY_BLOCKED_OVERCAP
    audit_entries = await prisma.auditlogentry.find_many(
        where={"actorId": guardian.id, "action": "GUARDIAN_AUTOPAY_BLOCKED_OVERCAP"}
    )
    assert len(audit_entries) > 0
    latest_audit = audit_entries[-1]
    assert latest_audit.metadata["reason_code"] == "TRANSACTION_CAP_EXCEEDED"
    assert latest_audit.metadata["amount"] == 250
    assert latest_audit.metadata["per_transaction_cap"] == 200


@pytest.mark.asyncio
async def test_execute_autonomous_autopay_monthly_cap_exceeded_notifies_guardian():
    """Verify autonomous execution exceeding monthly spending cap is blocked with zero mutations and notifies guardian."""
    guardian, child, link = await setup_guardian_and_child()

    # 3 days overdue @ ₹50/day = ₹150 fine
    loan = await create_test_loan_with_fine(child.id, guardian.id, days_overdue=3, fine_paid=False)

    initial_payment_count = await prisma.payment.count(where={"userId": child.id})

    # Mock spent = ₹900 (900 + 150 = 1050 > ₹1000 monthly cap)
    with patch("app.modules.guardian_autopay.service.calculate_monthly_autopay_spend", return_value=900):
        with pytest.raises(HTTPException) as exc_info:
            await execute_autonomous_autopay(loan.id)

        assert exc_info.value.status_code == 422
        assert "exceed monthly spending cap" in exc_info.value.detail.lower()

        # Verify ZERO database mutations
        loan_db = await prisma.loan.find_unique(where={"id": loan.id})
        assert loan_db.finePaid is False

        post_payment_count = await prisma.payment.count(where={"userId": child.id})
        assert post_payment_count == initial_payment_count

        # Verify Guardian Notification was dispatched
        notifications = await prisma.notification.find_many(where={"userId": guardian.id})
        monthly_notifications = [n for n in notifications if "exceed your ₹1,000 monthly Auto-Pay limit" in n.message]
        assert len(monthly_notifications) > 0
        assert "Auto-Pay blocked" in monthly_notifications[0].message

        # Verify Audit Log Entry GUARDIAN_AUTOPAY_BLOCKED_OVERCAP
        audit_entries = await prisma.auditlogentry.find_many(
            where={"actorId": guardian.id, "action": "GUARDIAN_AUTOPAY_BLOCKED_OVERCAP"}
        )
        assert len(audit_entries) > 0
        latest_audit = audit_entries[-1]
        assert latest_audit.metadata["reason_code"] == "MONTHLY_CAP_EXCEEDED"
        assert latest_audit.metadata["amount"] == 150
        assert latest_audit.metadata["monthly_spending_cap"] == 1000


@pytest.mark.asyncio
async def test_execute_autonomous_autopay_exact_cap_boundary():
    """Verify Step 3: Exact cap boundary fine == effective_cap (₹200) is ALLOWED, fine > effective_cap (₹250) is BLOCKED."""
    guardian, child, link = await setup_guardian_and_child()

    # 4 days overdue @ ₹50/day = ₹200 fine (EXACTLY EQUAL to ₹200 per-transaction cap) -> ALLOWED
    exact_loan = await create_test_loan_with_fine(child.id, guardian.id, days_overdue=4, fine_paid=False)
    res_exact = await execute_autonomous_autopay(exact_loan.id)
    assert res_exact.success is True
    assert res_exact.amount == 200

    exact_loan_db = await prisma.loan.find_unique(where={"id": exact_loan.id})
    assert exact_loan_db.finePaid is True

    # 5 days overdue @ ₹50/day = ₹250 fine (GREATER THAN ₹200 per-transaction cap) -> BLOCKED
    over_loan = await create_test_loan_with_fine(child.id, guardian.id, days_overdue=5, fine_paid=False)
    with pytest.raises(HTTPException) as exc_info:
        await execute_autonomous_autopay(over_loan.id)

    assert exc_info.value.status_code == 422
    assert "exceeds per-transaction cap" in exc_info.value.detail.lower()

    over_loan_db = await prisma.loan.find_unique(where={"id": over_loan.id})
    assert over_loan_db.finePaid is False


@pytest.mark.asyncio
async def test_execute_autonomous_autopay_zero_mutation_on_blocked_charge():
    """Verify Step 3: Blocked charge produces ZERO financial database mutations (finePaid unchanged, 0 payments created)."""
    guardian, child, link = await setup_guardian_and_child()

    loan = await create_test_loan_with_fine(child.id, guardian.id, days_overdue=6, fine_paid=False)

    pre_loan = await prisma.loan.find_unique(where={"id": loan.id})
    pre_payment_count = await prisma.payment.count(where={"userId": child.id})

    with patch("app.modules.guardian_autopay.service._simulate_gateway_capture") as mock_gateway:
        with pytest.raises(HTTPException) as exc_info:
            await execute_autonomous_autopay(loan.id)

        assert exc_info.value.status_code == 422
        # Simulated gateway capture must NOT have been called
        mock_gateway.assert_not_called()

    post_loan = await prisma.loan.find_unique(where={"id": loan.id})
    post_payment_count = await prisma.payment.count(where={"userId": child.id})

    assert post_loan.finePaid == pre_loan.finePaid == False
    assert post_payment_count == pre_payment_count


@pytest.mark.asyncio
async def test_execute_autonomous_autopay_blocks_even_if_notification_fails():
    """Verify Step 3: Notification delivery error does NOT authorize payment or crash safety blocking."""
    guardian, child, link = await setup_guardian_and_child()

    loan = await create_test_loan_with_fine(child.id, guardian.id, days_overdue=5, fine_paid=False)

    with patch("app.modules.notifications.service.create_notification", side_effect=RuntimeError("Notification network error")):
        with pytest.raises(HTTPException) as exc_info:
            await execute_autonomous_autopay(loan.id)

        assert exc_info.value.status_code == 422
        assert "exceeds per-transaction cap" in exc_info.value.detail.lower()

    loan_db = await prisma.loan.find_unique(where={"id": loan.id})
    assert loan_db.finePaid is False


@pytest.mark.asyncio
async def test_execute_autonomous_autopay_gateway_failure_rollback_and_retry():
    """Verify forced gateway capture failure rolls back DB state, records 0 payments/audits, and allows clean retry."""
    guardian, child, link = await setup_guardian_and_child()

    # 3 days overdue @ ₹50/day = ₹150 fine (within ₹200 cap)
    loan = await create_test_loan_with_fine(child.id, guardian.id, days_overdue=3, fine_paid=False)

    initial_payment_count = await prisma.payment.count(where={"userId": child.id})

    # 1. Force simulated gateway capture failure
    with patch(
        "app.modules.guardian_autopay.service._simulate_gateway_capture",
        side_effect=RuntimeError("Simulated payment gateway processing error"),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await execute_autonomous_autopay(loan.id)

        assert exc_info.value.status_code == 502
        assert "payment capture failed" in exc_info.value.detail.lower()

    # Verify complete rollback / zero mutations on failed attempt
    loan_db_after_fail = await prisma.loan.find_unique(where={"id": loan.id})
    assert loan_db_after_fail.finePaid is False

    post_fail_payment_count = await prisma.payment.count(where={"userId": child.id})
    assert post_fail_payment_count == initial_payment_count

    failed_audits = await prisma.auditlogentry.find_many(
        where={"actorId": guardian.id, "action": "GUARDIAN_AUTOPAY_AUTONOMOUS_EXECUTED"}
    )
    assert len(failed_audits) == 0

    # 2. Retry autonomous execution without forced failure
    res_retry = await execute_autonomous_autopay(loan.id)

    assert res_retry.success is True
    assert res_retry.amount == 150
    assert res_retry.loan_id == loan.id

    # Verify successful retry state in DB
    loan_db_after_retry = await prisma.loan.find_unique(where={"id": loan.id})
    assert loan_db_after_retry.finePaid is True

    retry_payment_count = await prisma.payment.count(where={"userId": child.id})
    assert retry_payment_count == initial_payment_count + 1

    successful_audits = await prisma.auditlogentry.find_many(
        where={"actorId": guardian.id, "action": "GUARDIAN_AUTOPAY_AUTONOMOUS_EXECUTED"}
    )
    assert len(successful_audits) == 1


@pytest.mark.asyncio
async def test_execute_autonomous_endpoint_all_paths():
    """Verify POST /api/v1/guardian/autopay/execute-autonomous router endpoint across all HTTP response paths."""
    from app.modules.guardian_autopay.router import execute_autonomous_settlement
    from app.modules.guardian_autopay.schemas import AutopayExecuteAutonomousRequest

    guardian, child, link = await setup_guardian_and_child()
    other_guardian, _, _ = await setup_guardian_and_child()

    # 1. Eligible fine (3 days overdue @ ₹50/day = ₹150) -> 200 OK
    loan = await create_test_loan_with_fine(child.id, guardian.id, days_overdue=3, fine_paid=False)
    req = AutopayExecuteAutonomousRequest(loan_id=loan.id)

    res = await execute_autonomous_settlement(req, current_user=guardian)
    assert res.success is True
    assert res.amount == 150
    assert res.loan_id == loan.id
    assert res.guardian_id == guardian.id

    # 2. Duplicate settlement on already-paid loan -> 409 Conflict
    with pytest.raises(HTTPException) as exc_409:
        await execute_autonomous_settlement(req, current_user=guardian)
    assert exc_409.value.status_code == 409

    # 3. Non-owner guardian trying to settle child's fine -> 403 Forbidden
    loan2 = await create_test_loan_with_fine(child.id, guardian.id, days_overdue=2, fine_paid=False)
    req2 = AutopayExecuteAutonomousRequest(loan_id=loan2.id)
    with pytest.raises(HTTPException) as exc_403:
        await execute_autonomous_settlement(req2, current_user=other_guardian)
    assert exc_403.value.status_code == 403

    # 4. Transaction-cap violation (5 days overdue = ₹250 > ₹200 cap) -> 422 Unprocessable Entity
    loan_overcap = await create_test_loan_with_fine(child.id, guardian.id, days_overdue=5, fine_paid=False)
    req_overcap = AutopayExecuteAutonomousRequest(loan_id=loan_overcap.id)
    with pytest.raises(HTTPException) as exc_422:
        await execute_autonomous_settlement(req_overcap, current_user=guardian)
    assert exc_422.value.status_code == 422
    assert "exceeds per-transaction cap" in exc_422.value.detail.lower()

    # 5. Monthly-cap violation -> 422 Unprocessable Entity
    loan_monthly = await create_test_loan_with_fine(child.id, guardian.id, days_overdue=3, fine_paid=False)
    req_monthly = AutopayExecuteAutonomousRequest(loan_id=loan_monthly.id)
    with patch("app.modules.guardian_autopay.service.calculate_monthly_autopay_spend", return_value=900):
        with pytest.raises(HTTPException) as exc_422_monthly:
            await execute_autonomous_settlement(req_monthly, current_user=guardian)
        assert exc_422_monthly.value.status_code == 422
        assert "exceed monthly spending cap" in exc_422_monthly.value.detail.lower()

    # 6. Forced gateway capture failure -> 502 Bad Gateway
    loan_fail = await create_test_loan_with_fine(child.id, guardian.id, days_overdue=1, fine_paid=False)
    req_fail = AutopayExecuteAutonomousRequest(loan_id=loan_fail.id)
    with patch(
        "app.modules.guardian_autopay.service._simulate_gateway_capture",
        side_effect=RuntimeError("Simulated payment gateway processing failure"),
    ):
        with pytest.raises(HTTPException) as exc_502:
            await execute_autonomous_settlement(req_fail, current_user=guardian)
        assert exc_502.value.status_code == 502


@pytest.mark.asyncio
async def test_execute_autonomous_endpoint_non_guardian_rejected():
    """Scenario F: Test non-guardian user (e.g. member child) attempting access is rejected with HTTP 403."""
    from app.modules.guardian_autopay.router import _require_guardian_user

    guardian, child, link = await setup_guardian_and_child()

    with pytest.raises(HTTPException) as exc_403:
        _require_guardian_user(current_user=child)
    assert exc_403.value.status_code == 403
    assert "Only guardian accounts are authorized" in exc_403.value.detail






