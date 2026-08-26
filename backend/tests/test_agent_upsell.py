import os
from unittest.mock import MagicMock, patch
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
    """Ensure Prisma database is connected during tests module."""
    if not prisma.is_connected():
        await prisma.connect()
    yield
    if prisma.is_connected():
        await prisma.disconnect()


async def get_test_user_and_token():
    """Find or create an active test user and return user object & bearer token."""
    user = await prisma.user.find_first(where={"deletedAt": None, "isActive": True})
    if not user:
        role = await prisma.role.find_first(where={"name": "member"})
        user = await prisma.user.create(
            data={
                "email": "upsell_test_user@example.com",
                "fullName": "Upsell Test User",
                "passwordHash": "hashed_password",
                "roleId": role.id if role else "member_role_id",
                "isActive": True,
            }
        )
    token = create_access_token(user.id)
    return user, token


@pytest.mark.asyncio
async def test_agent_upsell_unauthenticated():
    """H: Test unauthenticated request is blocked with HTTP 401."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/agent/upsell/evaluate",
            json={"current_plan_id": "1m"},
        )
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_agent_upsell_valid_upgrade():
    """A: Test valid upgrade recommendation when starting from 1m plan with mock usage activity."""
    user, token = await get_test_user_and_token()
    headers = {"Authorization": f"Bearer {token}"}

    from app.modules.agent_upsell.schemas import MemberUsageSignals

    mock_signals = MemberUsageSignals(total_loans=5, active_loans=2, total_visits=8)

    with patch("app.modules.agent_upsell.service.get_member_usage_signals", return_value=mock_signals):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/v1/agent/upsell/evaluate",
                json={"current_plan_id": "1m"},
                headers=headers,
            )
            assert response.status_code == 200
            data = response.json()

            assert data["eligible"] is True
            assert data["usage_signals"]["total_loans"] == 5
            assert data["usage_signals"]["total_visits"] == 8
            assert data["policy"]["decision"] == "recommend"
            assert data["policy"]["reason_code"] == "high_usage"
            assert data["current_plan"]["plan_id"] == "1m"
            assert data["recommended_plan"] is not None
            assert data["recommended_plan"]["months"] > 1
            assert isinstance(data["price_difference"], int)
            assert data["savings_percent"] >= 0
            assert isinstance(data["reason"], str)


@pytest.mark.asyncio
async def test_agent_upsell_multi_tier_recommendations():
    """Test that growth engine selects appropriate higher plan tier based on usage intensity."""
    user, token = await get_test_user_and_token()
    headers = {"Authorization": f"Bearer {token}"}

    from app.modules.agent_upsell.schemas import MemberUsageSignals

    # Light usage (1 loan, 1 visit -> 2 total activity) should recommend 3m plan
    light_signals = MemberUsageSignals(total_loans=1, active_loans=1, total_visits=1)
    with patch("app.modules.agent_upsell.service.get_member_usage_signals", return_value=light_signals):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post("/api/v1/agent/upsell/evaluate", json={"current_plan_id": "1m"}, headers=headers)
            assert res.status_code == 200
            data = res.json()
            assert data["recommended_plan"]["months"] == 3
            assert data["recommended_plan"]["plan_id"] == "3m"

    # Moderate usage (3 loans, 2 visits -> 5 total activity) should recommend 6m plan
    mod_signals = MemberUsageSignals(total_loans=3, active_loans=1, total_visits=2)
    with patch("app.modules.agent_upsell.service.get_member_usage_signals", return_value=mod_signals):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            res = await client.post("/api/v1/agent/upsell/evaluate", json={"current_plan_id": "1m"}, headers=headers)
            assert res.status_code == 200
            data = res.json()
            assert data["recommended_plan"]["months"] == 6
            assert data["recommended_plan"]["plan_id"] == "6m"


@pytest.mark.asyncio
async def test_agent_upsell_no_usage_insufficient_policy():
    """Test member with 0 loans and 0 visits receives no_offer policy decision."""
    user, token = await get_test_user_and_token()
    headers = {"Authorization": f"Bearer {token}"}

    from app.modules.agent_upsell.schemas import MemberUsageSignals

    mock_zero_signals = MemberUsageSignals(total_loans=0, active_loans=0, total_visits=0)

    with patch("app.modules.agent_upsell.service.get_member_usage_signals", return_value=mock_zero_signals):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/v1/agent/upsell/evaluate",
                json={"current_plan_id": "1m"},
                headers=headers,
            )
            assert response.status_code == 200
            data = response.json()

            assert data["eligible"] is False
            assert data["policy"]["decision"] == "no_offer"
            assert data["policy"]["reason_code"] == "insufficient_usage"


@pytest.mark.asyncio
async def test_agent_upsell_no_upgrade_available():
    """B: Test no upgrade available when user is already on 12m plan."""
    user, token = await get_test_user_and_token()
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/agent/upsell/evaluate",
            json={"current_plan_id": "12m"},
            headers=headers,
        )
        assert response.status_code == 200
        data = response.json()

        assert data["eligible"] is False
        assert data["recommended_plan"] is None
        assert "highest tier" in data["reason"].lower()


@pytest.mark.asyncio
async def test_agent_upsell_client_price_tampering():
    """C: Test client price tampering — extra fake price fields in payload are ignored."""
    user, token = await get_test_user_and_token()
    headers = {"Authorization": f"Bearer {token}"}

    from app.modules.agent_upsell.schemas import MemberUsageSignals
    mock_signals = MemberUsageSignals(total_loans=3, active_loans=1, total_visits=4)

    with patch("app.modules.agent_upsell.service.get_member_usage_signals", return_value=mock_signals):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/v1/agent/upsell/evaluate",
                json={
                    "current_plan_id": "1m",
                    "price": 1,  # Malicious client price
                    "recommended_price": 5,  # Malicious client price
                },
                headers=headers,
            )
            assert response.status_code == 200
            data = response.json()

            # Price must come strictly from DB (e.g. 999 for 1m, not 1)
            assert data["current_plan"]["price"] == 999


@pytest.mark.asyncio
async def test_agent_upsell_invalid_plan():
    """D: Test invalid plan ID returns HTTP 400."""
    user, token = await get_test_user_and_token()
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/agent/upsell/evaluate",
            json={"current_plan_id": "nonexistent_plan_99"},
            headers=headers,
        )
        assert response.status_code == 400


@pytest.mark.asyncio
async def test_agent_upsell_llm_failure_fallback():
    """E: Test deterministic fallback rationale when LLM call fails."""
    user, token = await get_test_user_and_token()
    headers = {"Authorization": f"Bearer {token}"}

    from app.modules.agent_upsell.schemas import MemberUsageSignals
    mock_signals = MemberUsageSignals(total_loans=2, active_loans=1, total_visits=3)

    with patch("app.modules.agent_upsell.service.get_member_usage_signals", return_value=mock_signals):
        with patch("app.modules.agent_upsell.service.build_chat_llm") as mock_build_llm:
            mock_llm = mock_build_llm.return_value
            mock_llm.ainvoke.side_effect = RuntimeError("Simulated LLM API Timeout")

            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/api/v1/agent/upsell/evaluate",
                    json={"current_plan_id": "1m"},
                    headers=headers,
                )
                assert response.status_code == 200
                data = response.json()

                assert data["eligible"] is True
                assert data["ai_generated"] is False
                assert "saves you" in data["reason"].lower()


@pytest.mark.asyncio
async def test_agent_upsell_llm_price_manipulation():
    """F: Test that an LLM returning fake text cannot mutate DB prices."""
    user, token = await get_test_user_and_token()
    headers = {"Authorization": f"Bearer {token}"}

    from langchain_core.messages import AIMessage
    from app.modules.agent_upsell.schemas import MemberUsageSignals
    mock_signals = MemberUsageSignals(total_loans=4, active_loans=1, total_visits=5)

    with patch("app.modules.agent_upsell.service.get_member_usage_signals", return_value=mock_signals):
        with patch("app.modules.agent_upsell.service.build_chat_llm") as mock_build_llm:
            mock_llm = mock_build_llm.return_value
            mock_llm.ainvoke.return_value = AIMessage(
                content="Get this special plan for only $0.01 dollar!"
            )

            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as client:
                response = await client.post(
                    "/api/v1/agent/upsell/evaluate",
                    json={"current_plan_id": "1m"},
                    headers=headers,
                )
                assert response.status_code == 200
                data = response.json()

                # Structured fields remain server-authoritative from database
                assert data["current_plan"]["price"] == 999
                assert data["recommended_plan"]["price"] > 999


@pytest.mark.asyncio
async def test_agent_upsell_audit_logging():
    """G: Test UPSELL_RECOMMENDED is recorded in audit log with usage signals and policy metadata."""
    user, token = await get_test_user_and_token()
    headers = {"Authorization": f"Bearer {token}"}

    from app.modules.agent_upsell.schemas import MemberUsageSignals
    mock_signals = MemberUsageSignals(total_loans=6, active_loans=2, total_visits=10)

    with patch("app.modules.agent_upsell.service.get_member_usage_signals", return_value=mock_signals):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/v1/agent/upsell/evaluate",
                json={"current_plan_id": "1m"},
                headers=headers,
            )
            assert response.status_code == 200

    # Query audit log entry in DB
    audit_entry = await prisma.auditlogentry.find_first(
        where={"actorId": user.id, "action": "UPSELL_RECOMMENDED"},
        order={"createdAt": "desc"},
    )
    assert audit_entry is not None
    assert audit_entry.action == "UPSELL_RECOMMENDED"
    assert "usage_signals" in audit_entry.metadata
    assert "policy_decision" in audit_entry.metadata


@pytest.mark.asyncio
async def test_agent_upsell_audit_trail_endpoint():
    """Test GET /api/v1/agent/upsell/audit endpoint returns correlated audit records."""
    user, token = await get_test_user_and_token()
    headers = {"Authorization": f"Bearer {token}"}

    from app.modules.agent_upsell.schemas import MemberUsageSignals
    mock_signals = MemberUsageSignals(total_loans=2, active_loans=1, total_visits=3)

    with patch("app.modules.agent_upsell.service.get_member_usage_signals", return_value=mock_signals):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            # 1. Evaluate
            eval_resp = await client.post(
                "/api/v1/agent/upsell/evaluate",
                json={"current_plan_id": "1m"},
                headers=headers,
            )
            assert eval_resp.status_code == 200
            eval_data = eval_resp.json()
            assert "eval_id" in eval_data

            # 2. Query audit endpoint
            audit_resp = await client.get("/api/v1/agent/upsell/audit", headers=headers)
            assert audit_resp.status_code == 200
            audit_data = audit_resp.json()
            assert "records" in audit_data
            assert len(audit_data["records"]) >= 1
            rec = audit_data["records"][0]
            assert rec["reason_code"] == "high_usage"
            assert rec["payment_status"] == "pending"


@pytest.mark.asyncio
async def test_langgraph_upsell_tool_invocation():
    """Test LangGraph evaluate_membership_upsell tool invocation."""
    user, _ = await get_test_user_and_token()
    from app.modules.chat.orchestrator import evaluate_membership_upsell, _ctx
    from app.modules.agent_upsell.schemas import MemberUsageSignals

    mock_signals = MemberUsageSignals(total_loans=3, active_loans=1, total_visits=4)

    # Set contextvar
    _ctx.set({"member_id": user.id, "plan_id": "1m", "user_name": "Upsell Test User"})

    with patch("app.modules.agent_upsell.service.get_member_usage_signals", return_value=mock_signals):
        res = await evaluate_membership_upsell.ainvoke({})
        assert isinstance(res, str)
        assert "AI Recommendation" in res or "No upgrade recommendation" in res
        assert "/payment" in res or "No upgrade recommendation" in res


# ==========================================
# PHASE 3 — ACCEPTANCE & PAYMENT FLOW TESTS
# ==========================================


@pytest.mark.asyncio
async def test_accept_agent_upsell_unauthenticated():
    """Test unauthenticated accept request returns HTTP 401."""
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/agent/upsell/accept",
            json={"recommended_plan_id": "12m", "current_plan_id": "1m"},
        )
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_accept_agent_upsell_valid():
    """Test valid acceptance creates Razorpay order and records audit log entries."""
    user, token = await get_test_user_and_token()
    headers = {"Authorization": f"Bearer {token}"}

    mock_rz_client = MagicMock()
    mock_rz_client.order.create.return_value = {"id": "order_test_upsell_123"}

    with patch("app.modules.payments.service._get_client", return_value=mock_rz_client):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/v1/agent/upsell/accept",
                json={"recommended_plan_id": "12m", "current_plan_id": "1m"},
                headers=headers,
            )
            assert response.status_code == 200
            data = response.json()

            assert data["order_id"] == "order_test_upsell_123"
            assert data["plan_id"] == "12m"
            assert data["amount"] == 8991  # Server authoritative price for 12m plan
            assert data["source"] == "ai_upsell"

    # Verify audit entries
    accepted_audit = await prisma.auditlogentry.find_first(
        where={"actorId": user.id, "action": "UPSELL_ACCEPTED"},
        order={"createdAt": "desc"},
    )
    assert accepted_audit is not None

    created_audit = await prisma.auditlogentry.find_first(
        where={"actorId": user.id, "action": "UPSELL_ORDER_CREATED"},
        order={"createdAt": "desc"},
    )
    assert created_audit is not None


@pytest.mark.asyncio
async def test_accept_agent_upsell_fake_amount_ignored():
    """Test client attempts to submit fake amount/price are completely ignored by server."""
    user, token = await get_test_user_and_token()
    headers = {"Authorization": f"Bearer {token}"}

    mock_rz_client = MagicMock()
    mock_rz_client.order.create.return_value = {"id": "order_test_fake_amount"}

    with patch("app.modules.payments.service._get_client", return_value=mock_rz_client):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/v1/agent/upsell/accept",
                json={
                    "recommended_plan_id": "12m",
                    "current_plan_id": "1m",
                    "amount": 1,  # Malicious fake amount
                    "price": 10,  # Malicious fake price
                },
                headers=headers,
            )
            assert response.status_code == 200
            data = response.json()

            # Amount MUST be 8991 (from DB), not 1
            assert data["amount"] == 8991
            # Verify Razorpay order was called with 8991 * 100
            mock_rz_client.order.create.assert_called_once()
            call_args = mock_rz_client.order.create.call_args[0][0]
            assert call_args["amount"] == 899100


@pytest.mark.asyncio
async def test_accept_agent_upsell_not_an_upgrade():
    """Test accept request where recommended plan is equal/lower duration returns HTTP 400."""
    user, token = await get_test_user_and_token()
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/agent/upsell/accept",
            json={"recommended_plan_id": "1m", "current_plan_id": "12m"},
            headers=headers,
        )
        assert response.status_code == 400
        assert "not a valid upgrade" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_accept_agent_upsell_invalid_plan():
    """Test accept request with non-existent plan ID returns HTTP 400."""
    user, token = await get_test_user_and_token()
    headers = {"Authorization": f"Bearer {token}"}

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        response = await client.post(
            "/api/v1/agent/upsell/accept",
            json={"recommended_plan_id": "invalid_plan_99", "current_plan_id": "1m"},
            headers=headers,
        )
        assert response.status_code == 400
        assert "not available or inactive" in response.json()["detail"].lower()
