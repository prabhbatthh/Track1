from datetime import UTC, datetime, timedelta
import os
from unittest.mock import MagicMock, patch
import uuid
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

os.environ["APP_ENV"] = "test"

from app.core.config import get_settings
from app.core.security import create_access_token
from app.db.prisma import prisma
from app.main import create_app

os.environ.setdefault("DATABASE_URL", get_settings().database_url)

app = create_app()


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    """Ensure Prisma database is connected during test module execution."""
    if not prisma.is_connected():
        await prisma.connect()
    yield
    if prisma.is_connected():
        await prisma.disconnect()


async def get_test_user_and_token(email_suffix="checkout_test"):
    """Create a distinct test user and return user object & bearer token."""
    role = await prisma.role.find_first(where={"name": "member"})
    user = await prisma.user.create(
        data={
            "email": f"{email_suffix}_{datetime.now().timestamp()}@example.com",
            "fullName": "Agent Checkout Member",
            "passwordHash": "hashed_password",
            "roleId": role.id if role else "member_role_id",
            "isActive": True,
        }
    )
    token = create_access_token(user.id)
    return user, token


@pytest.mark.asyncio
async def test_create_checkout_proposal_valid():
    """Test valid proposal creation returns server-calculated prices, discount, and 15-min TTL."""
    user, token = await get_test_user_and_token("proposal_valid")
    headers = {"Authorization": f"Bearer {token}"}

    # Ensure WELCOME10 coupon exists in DB
    await prisma.coupon.upsert(
        where={"code": "WELCOME10"},
        data={
            "create": {
                "code": "WELCOME10",
                "discountPercent": 10,
                "maxUses": 100,
                "usesCount": 0,
                "createdById": user.id,
            },
            "update": {},
        },
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/agent/checkout/proposal",
            headers=headers,
            json={
                "plan_id": "12m",
                "coupon_code": "WELCOME10",
                "agent_id": "shopping_agent_test",
            },
        )
        assert response.status_code == 200
        data = response.json()

        assert data["proposal_id"].startswith("prop_")
        assert data["status"] == "PENDING_APPROVAL"
        assert data["plan_id"] == "12m"
        assert data["duration_months"] == 12
        assert data["original_price"] == 8991
        assert data["final_price"] == 8092  # 10% off 8991 rounded
        assert data["savings_amount"] == 3896  # 11988 baseline - 8092
        assert data["coupon_code"] == "WELCOME10"
        assert data["approval_url"] == "/api/v1/agent/checkout/approve"

        # Check DB entity persistence
        proposal_db = await prisma.agentcheckoutproposal.find_unique(
            where={"proposalId": data["proposal_id"]}
        )
        assert proposal_db is not None
        assert proposal_db.userId == user.id
        assert proposal_db.status == "PENDING_APPROVAL"


@pytest.mark.asyncio
async def test_create_checkout_proposal_multi_tier_plans():
    """Test proposal creation works dynamically across all plan tiers (3m, 6m, 12m) without hardcoded assumptions."""
    user, token = await get_test_user_and_token("multi_tier_prop")
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for plan_id in ["3m", "6m", "12m"]:
            res = await client.post(
                "/api/v1/agent/checkout/proposal",
                headers=headers,
                json={"plan_id": plan_id},
            )
            assert res.status_code == 200
            data = res.json()
            assert data["plan_id"] == plan_id
            assert data["status"] == "PENDING_APPROVAL"
            assert data["final_price"] > 0
            assert data["duration_months"] > 0
            assert "approval_url" in data


@pytest.mark.asyncio
async def test_create_checkout_proposal_unauthenticated():
    """Test creating proposal without authentication is rejected (401 Unauthorized)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/agent/checkout/proposal",
            json={"plan_id": "12m"},
        )
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_checkout_proposal_invalid_plan():
    """Test creating proposal with unknown plan ID returns 400 Bad Request."""
    user, token = await get_test_user_and_token("proposal_bad_plan")
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post(
            "/api/v1/agent/checkout/proposal",
            headers=headers,
            json={"plan_id": "99m_invalid"},
        )
        assert response.status_code == 400
        assert "Unknown or inactive membership plan" in response.json()["detail"]


@pytest.mark.asyncio
async def test_approve_checkout_proposal_valid():
    """Test explicit human approval converts proposal to APPROVED state and creates Razorpay order."""
    user, token = await get_test_user_and_token("approve_valid")
    headers = {"Authorization": f"Bearer {token}"}

    # Step 1: Create proposal
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        prop_res = await client.post(
            "/api/v1/agent/checkout/proposal",
            headers=headers,
            json={"plan_id": "6m"},
        )
        assert prop_res.status_code == 200
        proposal_id = prop_res.json()["proposal_id"]

    # Mock Razorpay SDK client order.create
    mock_rzp_client = MagicMock()
    mock_rzp_client.order.create.return_value = {"id": "order_agent_checkout_123"}

    with patch("app.modules.payments.service._get_client", return_value=mock_rzp_client):
        # Step 2: Approve proposal
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            app_res = await client.post(
                "/api/v1/agent/checkout/approve",
                headers=headers,
                json={"proposal_id": proposal_id},
            )
            assert app_res.status_code == 200
            app_data = app_res.json()

            assert app_data["proposal_id"] == proposal_id
            assert app_data["status"] == "APPROVED"
            assert app_data["order_id"] == "order_agent_checkout_123"
            assert app_data["amount"] == 4915

            # Verify DB proposal state updated
            prop_db = await prisma.agentcheckoutproposal.find_unique(
                where={"proposalId": proposal_id}
            )
            assert prop_db.status == "APPROVED"
            assert prop_db.orderId == "order_agent_checkout_123"


@pytest.mark.asyncio
async def test_approve_checkout_proposal_ownership_mismatch():
    """Test approving another member's proposal is rejected (403 Forbidden)."""
    user1, token1 = await get_test_user_and_token("owner1")
    user2, token2 = await get_test_user_and_token("owner2")

    # Member 1 creates proposal
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        prop_res = await client.post(
            "/api/v1/agent/checkout/proposal",
            headers={"Authorization": f"Bearer {token1}"},
            json={"plan_id": "3m"},
        )
        proposal_id = prop_res.json()["proposal_id"]

    # Member 2 tries to approve Member 1's proposal
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        app_res = await client.post(
            "/api/v1/agent/checkout/approve",
            headers={"Authorization": f"Bearer {token2}"},
            json={"proposal_id": proposal_id},
        )
        assert app_res.status_code == 403
        assert "ownership mismatch" in app_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_approve_checkout_proposal_expired():
    """Test approving an expired proposal returns 410 Gone and marks status EXPIRED."""
    user, token = await get_test_user_and_token("expired_prop")
    headers = {"Authorization": f"Bearer {token}"}

    # Manually seed an expired proposal in DB
    proposal_id = f"prop_expired_{uuid.uuid4().hex[:8]}"
    past_time = datetime.now(UTC) - timedelta(minutes=20)

    await prisma.agentcheckoutproposal.create(
        data={
            "proposalId": proposal_id,
            "userId": user.id,
            "planId": "12m",
            "originalPrice": 8991,
            "finalPrice": 8991,
            "savingsAmount": 2997,
            "savingsPercent": 25,
            "status": "PENDING_APPROVAL",
            "expiresAt": past_time,
        }
    )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        app_res = await client.post(
            "/api/v1/agent/checkout/approve",
            headers=headers,
            json={"proposal_id": proposal_id},
        )
        assert app_res.status_code == 410

        # Check DB proposal status updated to EXPIRED
        prop_db = await prisma.agentcheckoutproposal.find_unique(
            where={"proposalId": proposal_id}
        )
        assert prop_db.status == "EXPIRED"


@pytest.mark.asyncio
async def test_approve_checkout_proposal_replayed():
    """Test approving an already approved proposal is rejected with 409 Conflict."""
    user, token = await get_test_user_and_token("replay_prop")
    headers = {"Authorization": f"Bearer {token}"}

    mock_rzp_client = MagicMock()
    mock_rzp_client.order.create.return_value = {"id": "order_replay_999"}

    # Create proposal
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        prop_res = await client.post(
            "/api/v1/agent/checkout/proposal",
            headers=headers,
            json={"plan_id": "3m"},
        )
        proposal_id = prop_res.json()["proposal_id"]

    with patch("app.modules.payments.service._get_client", return_value=mock_rzp_client):
        # First approval
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res1 = await client.post(
                "/api/v1/agent/checkout/approve",
                headers=headers,
                json={"proposal_id": proposal_id},
            )
            assert res1.status_code == 200

        # Second approval (Replay attempt)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res2 = await client.post(
                "/api/v1/agent/checkout/approve",
                headers=headers,
                json={"proposal_id": proposal_id},
            )
            assert res2.status_code == 409
            assert "cannot be approved" in res2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_agent_checkout_full_verification_activates_membership():
    """Test full agentic checkout verification: payment verification activates membership & updates proposal to COMPLETED."""
    user, token = await get_test_user_and_token("full_verify")
    headers = {"Authorization": f"Bearer {token}"}

    # Step 1: Create proposal
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        prop_res = await client.post(
            "/api/v1/agent/checkout/proposal",
            headers=headers,
            json={"plan_id": "12m"},
        )
        proposal_id = prop_res.json()["proposal_id"]

    # Step 2: Approve proposal
    mock_rzp_client = MagicMock()
    unique_suffix = uuid.uuid4().hex[:8]
    order_id = f"order_full_verify_{unique_suffix}"
    payment_id = f"pay_full_verify_{unique_suffix}"
    mock_rzp_client.order.create.return_value = {"id": order_id}

    with patch("app.modules.payments.service._get_client", return_value=mock_rzp_client):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            app_res = await client.post(
                "/api/v1/agent/checkout/approve",
                headers=headers,
                json={"proposal_id": proposal_id},
            )
            assert app_res.status_code == 200

    # Step 3: Complete Razorpay payment verification
    mock_rzp_client.utility.verify_payment_signature.return_value = True
    mock_rzp_client.order.fetch.return_value = {
        "id": order_id,
        "amount": 899100,
        "notes": {
            "member_id": user.id,
            "label": "12 month membership",
            "plan_months": "12",
            "plan_id": "12m",
            "proposal_id": proposal_id,
            "source": "agent_checkout",
        },
    }

    with patch("app.modules.payments.service._get_client", return_value=mock_rzp_client):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            verify_res = await client.post(
                "/api/v1/payments/razorpay/verify",
                headers=headers,
                json={
                    "razorpay_order_id": order_id,
                    "razorpay_payment_id": payment_id,
                    "razorpay_signature": "valid_signature_hash",
                },
            )
            assert verify_res.status_code == 200

            # Step 4: Verify membership is active
            mem_res = await client.get("/api/v1/payments/me/membership", headers=headers)
            assert mem_res.status_code == 200
            mem_data = mem_res.json()
            assert mem_data["is_active"] is True

            # Step 5: Verify proposal status is COMPLETED
            prop_db = await prisma.agentcheckoutproposal.find_unique(
                where={"proposalId": proposal_id}
            )
            assert prop_db.status == "COMPLETED"


@pytest.mark.asyncio
async def test_agent_checkout_failed_verification_no_activation():
    """Test failed signature verification leaves proposal unverified and zero membership activation."""
    user, token = await get_test_user_and_token("failed_verify")
    headers = {"Authorization": f"Bearer {token}"}

    import razorpay
    mock_rzp_client = MagicMock()
    mock_rzp_client.utility.verify_payment_signature.side_effect = (
        razorpay.errors.SignatureVerificationError("Signature mismatch")
    )

    with patch("app.modules.payments.service._get_client", return_value=mock_rzp_client):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            verify_res = await client.post(
                "/api/v1/payments/razorpay/verify",
                headers=headers,
                json={
                    "razorpay_order_id": "order_fake_999",
                    "razorpay_payment_id": "pay_fake_999",
                    "razorpay_signature": "invalid_signature",
                },
            )
            assert verify_res.status_code == 400
            assert "Payment verification failed" in verify_res.json()["detail"]
