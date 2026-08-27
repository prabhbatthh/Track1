import os
import uuid
import pytest
import pytest_asyncio
from fastapi import HTTPException
from unittest.mock import patch

os.environ["APP_ENV"] = "test"

from app.core.config import get_settings
from app.core.constants import Role
from app.core.security import hash_password
from app.db.prisma import prisma
from app.modules.members import repository as members_repository
from app.modules.payments import service as payments_service
from app.modules.payments.schemas import PaymentCreate, RazorpayVerifyRequest
from app.modules.agent_upsell import service as agent_upsell_service
from app.modules.agent_upsell.schemas import AgentCheckoutProposalRequest, AgentCheckoutApproveRequest
from app.modules.guardian_autopay import service as guardian_autopay_service


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    if not prisma.is_connected():
        await prisma.connect()
    yield
    if prisma.is_connected():
        await prisma.disconnect()


@pytest.fixture(autouse=True)
def reset_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


async def _create_test_user(email_prefix: str = "demotest"):
    role = await members_repository.upsert_role(Role.MEMBER)
    return await members_repository.create_member(
        email=f"{email_prefix}_{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
        full_name="Demo Gateway Test Member",
        phone=None,
        avatar_url=None,
        role_id=role.id,
    )


@pytest.mark.asyncio
async def test_demo_mode_direct_payment_success(monkeypatch):
    """Verify demo mode direct membership order creation & verification without Razorpay SDK."""
    monkeypatch.setattr(get_settings(), "payment_gateway_mode", "demo")

    user = await _create_test_user("direct")

    # 1. Create Demo Order
    payload = PaymentCreate(amount=499, label="1 Month Membership", plan_months=1)
    order_out = await payments_service.create_razorpay_order(user, payload)

    assert order_out.order_id.startswith("order_demo_")
    assert order_out.key_id == "rzp_demo_key"
    assert order_out.amount == 499

    # 2. Verify Demo Payment Signature
    payment_id = f"pay_demo_{uuid.uuid4().hex[:10]}"
    verify_payload = RazorpayVerifyRequest(
        razorpay_order_id=order_out.order_id,
        razorpay_payment_id=payment_id,
        razorpay_signature="demo_signature_valid",
    )
    payment_out = await payments_service.verify_and_record_razorpay_payment(user, verify_payload)

    assert payment_out.amount == 499
    assert payment_out.label == "1 Month Membership"

    # Verify payment record in DB
    db_payment = await prisma.payment.find_unique(where={"id": payment_out.id})
    assert db_payment is not None
    assert db_payment.razorpayOrderId == order_out.order_id
    assert db_payment.razorpayPaymentId == payment_id


@pytest.mark.asyncio
async def test_demo_mode_upgrade_payment_success(monkeypatch):
    """Verify demo mode AI upgrade proposal creation, approval, and verification."""
    monkeypatch.setattr(get_settings(), "payment_gateway_mode", "demo")

    user = await _create_test_user("upgrade")

    # 1. Create Proposal
    prop_req = AgentCheckoutProposalRequest(plan_id="6m")
    proposal = await agent_upsell_service.create_checkout_proposal(user, prop_req)
    assert proposal.status == "PENDING_APPROVAL"

    # 2. Approve Proposal
    app_req = AgentCheckoutApproveRequest(proposal_id=proposal.proposal_id)
    approve_out = await agent_upsell_service.approve_checkout_proposal(user, app_req)

    assert approve_out.status == "APPROVED"
    assert approve_out.order_id.startswith("order_demo_")
    assert approve_out.key_id == "rzp_demo_key"

    # 3. Verify Demo Payment
    payment_id = f"pay_demo_{uuid.uuid4().hex[:10]}"
    verify_payload = RazorpayVerifyRequest(
        razorpay_order_id=approve_out.order_id,
        razorpay_payment_id=payment_id,
        razorpay_signature="demo_signature_valid",
    )
    payment_out = await payments_service.verify_and_record_razorpay_payment(user, verify_payload)
    assert payment_out.id is not None

    # Verify proposal status updated to COMPLETED
    db_prop = await prisma.agentcheckoutproposal.find_unique(where={"proposalId": proposal.proposal_id})
    assert db_prop is not None
    assert db_prop.status == "COMPLETED"


@pytest.mark.asyncio
async def test_demo_mode_invalid_signature_rejection(monkeypatch):
    """Verify invalid demo signature is rejected with zero payment records created."""
    monkeypatch.setattr(get_settings(), "payment_gateway_mode", "demo")

    user = await _create_test_user("invalid")

    payload = PaymentCreate(amount=499, label="1 Month Membership", plan_months=1)
    order_out = await payments_service.create_razorpay_order(user, payload)

    payment_id = f"pay_demo_{uuid.uuid4().hex[:10]}"
    verify_payload = RazorpayVerifyRequest(
        razorpay_order_id=order_out.order_id,
        razorpay_payment_id=payment_id,
        razorpay_signature="invalid_tampered_signature",
    )

    with pytest.raises(HTTPException) as exc_info:
        await payments_service.verify_and_record_razorpay_payment(user, verify_payload)
    
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Payment verification failed"

    # Assert 0 payment records created
    db_payment = await prisma.payment.find_unique(where={"razorpayPaymentId": payment_id})
    assert db_payment is None


@pytest.mark.asyncio
async def test_demo_mode_idempotent_verification(monkeypatch):
    """Verify re-submitting an existing demo payment signature returns the existing payment idempotently."""
    monkeypatch.setattr(get_settings(), "payment_gateway_mode", "demo")

    user = await _create_test_user("idempotent")

    payload = PaymentCreate(amount=499, label="1 Month Membership", plan_months=1)
    order_out = await payments_service.create_razorpay_order(user, payload)

    payment_id = f"pay_demo_{uuid.uuid4().hex[:10]}"
    verify_payload = RazorpayVerifyRequest(
        razorpay_order_id=order_out.order_id,
        razorpay_payment_id=payment_id,
        razorpay_signature="demo_signature_valid",
    )

    p1 = await payments_service.verify_and_record_razorpay_payment(user, verify_payload)
    p2 = await payments_service.verify_and_record_razorpay_payment(user, verify_payload)

    assert p1.id == p2.id


@pytest.mark.asyncio
async def test_demo_mode_never_invokes_razorpay_client(monkeypatch):
    """Verify demo mode never invokes _get_client() or external Razorpay SDK."""
    monkeypatch.setattr(get_settings(), "payment_gateway_mode", "demo")

    user = await _create_test_user("nosdk")

    with patch("app.modules.payments.service._get_client") as mock_get_client:
        payload = PaymentCreate(amount=499, label="1 Month Membership", plan_months=1)
        order_out = await payments_service.create_razorpay_order(user, payload)

        payment_id = f"pay_demo_{uuid.uuid4().hex[:10]}"
        verify_payload = RazorpayVerifyRequest(
            razorpay_order_id=order_out.order_id,
            razorpay_payment_id=payment_id,
            razorpay_signature="demo_signature_valid",
        )
        await payments_service.verify_and_record_razorpay_payment(user, verify_payload)

        # Assert _get_client was NEVER called
        mock_get_client.assert_not_called()


@pytest.mark.asyncio
async def test_guardian_autopay_isolation_preserved():
    """Verify Guardian Autonomous Auto-Pay functions unchanged alongside payment gateway modes."""
    loan = await prisma.loan.find_first(where={"finePaid": False})
    if loan is not None:
        res = await guardian_autopay_service.AutonomousGatewayAdapter.capture_autonomous_payment(loan.id, 50)
        assert res["settlement_type"] == "autonomous_simulated"
        assert res["payment_id"].startswith("pay_auto_")
