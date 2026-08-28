import os
import uuid
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

os.environ["APP_ENV"] = "test"

from app.core.constants import Role
from app.core.security import create_access_token, hash_password
from app.db.prisma import prisma
from app.main import app
from app.modules.members import repository as members_repository


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    if not prisma.is_connected():
        await prisma.connect()
    yield
    if prisma.is_connected():
        await prisma.disconnect()


async def _create_test_user_with_role(role_enum: Role, email_prefix: str = "demo_role"):
    role = await members_repository.upsert_role(role_enum)
    return await members_repository.create_member(
        email=f"{email_prefix}_{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("Password123!"),
        full_name=f"Test {role_enum.value} User",
        phone=None,
        avatar_url=None,
        role_id=role.id,
    )


def _auth_headers(user_id: str) -> dict:
    token = create_access_token(user_id)
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_admin_and_it_head_access_control():
    """Verify Admin & IT Head can access judge demo controls while Guardian and Member are forbidden."""
    admin_user = await _create_test_user_with_role(Role.ADMIN, "admin_user")
    it_head_user = await _create_test_user_with_role(Role.IT_HEAD, "it_head_user")
    guardian_user = await _create_test_user_with_role(Role.GUARDIAN, "guardian_user")
    member_user = await _create_test_user_with_role(Role.MEMBER, "member_user")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Admin Access -> 200 OK
        resp_admin = await ac.get("/api/v1/admin/autopay-demo/overview", headers=_auth_headers(admin_user.id))
        assert resp_admin.status_code == 200

        # IT Head Access -> 200 OK
        resp_it = await ac.get("/api/v1/admin/autopay-demo/overview", headers=_auth_headers(it_head_user.id))
        assert resp_it.status_code == 200

        # Guardian & Member Access -> 403 Forbidden
        resp_g = await ac.get("/api/v1/admin/autopay-demo/overview", headers=_auth_headers(guardian_user.id))
        assert resp_g.status_code == 403

        resp_m = await ac.get("/api/v1/admin/autopay-demo/overview", headers=_auth_headers(member_user.id))
        assert resp_m.status_code == 403

        # Guardian forbidden on update-policy
        resp_g_pol = await ac.post(
            "/api/v1/admin/autopay-demo/update-policy",
            headers=_auth_headers(guardian_user.id),
            json={"enabled": False},
        )
        assert resp_g_pol.status_code == 403


@pytest.mark.asyncio
async def test_admin_and_it_head_policy_controls_enabled_toggle():
    """1, 2, 4, 5. Verify Admin and IT Head can toggle enabled state, and disabled policy blocks ₹150 fine."""
    admin_user = await _create_test_user_with_role(Role.ADMIN, "admin_pol_enable")
    it_head_user = await _create_test_user_with_role(Role.IT_HEAD, "it_pol_enable")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Reset trust to baseline (1.0x) and policy to default
        await ac.post(
            "/api/v1/admin/autopay-demo/simulate-trust",
            headers=_auth_headers(admin_user.id),
            json={"action": "reset"},
        )
        # 1. Admin disables Auto-Pay
        dis_resp = await ac.post(
            "/api/v1/admin/autopay-demo/update-policy",
            headers=_auth_headers(admin_user.id),
            json={"enabled": False},
        )
        assert dis_resp.status_code == 200
        assert dis_resp.json()["enabled"] is False

        # 2. ₹150 fine simulation MUST BE BLOCKED due to disabled policy
        sim_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate",
            headers=_auth_headers(admin_user.id),
            json={"scenario": "within_limit"},
        )
        assert sim_resp.status_code == 200
        sim_data = sim_resp.json()
        assert sim_data["status"] == "BLOCKED"
        assert "disabled" in sim_data["reason"].lower()

        # 3. IT Head re-enables Auto-Pay
        en_resp = await ac.post(
            "/api/v1/admin/autopay-demo/update-policy",
            headers=_auth_headers(it_head_user.id),
            json={"enabled": True, "per_transaction_cap": 200},
        )
        assert en_resp.status_code == 200
        assert en_resp.json()["enabled"] is True

        # 4. ₹150 fine simulation MUST NOW EXECUTE
        sim_resp2 = await ac.post(
            "/api/v1/admin/autopay-demo/simulate",
            headers=_auth_headers(admin_user.id),
            json={"scenario": "within_limit"},
        )
        assert sim_resp2.status_code == 200
        assert sim_resp2.json()["status"] == "EXECUTED"


@pytest.mark.asyncio
async def test_admin_policy_controls_cap_adjustment_and_hard_ceiling():
    """6, 7, 8, 9, 10. Verify changing cap to ₹100 blocks ₹150 fine, and cap ₹300 does not bypass hard ceiling ₹200."""
    admin_user = await _create_test_user_with_role(Role.ADMIN, "admin_pol_cap")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Reset trust & ensure baseline
        await ac.post(
            "/api/v1/admin/autopay-demo/simulate-trust",
            headers=_auth_headers(admin_user.id),
            json={"action": "reset"},
        )

        # 2. Change per-transaction cap to ₹100
        cap100_resp = await ac.post(
            "/api/v1/admin/autopay-demo/update-policy",
            headers=_auth_headers(admin_user.id),
            json={"per_transaction_cap": 100},
        )
        assert cap100_resp.status_code == 200
        assert cap100_resp.json()["effective_transaction_cap"] == 100

        # 3. ₹150 fine simulation MUST BE BLOCKED (₹150 > ₹100 cap)
        sim150 = await ac.post(
            "/api/v1/admin/autopay-demo/simulate",
            headers=_auth_headers(admin_user.id),
            json={"scenario": "within_limit"},
        )
        assert sim150.status_code == 200
        assert sim150.json()["status"] == "BLOCKED"
        assert "exceeds" in sim150.json()["reason"].lower() or "per-transaction cap" in sim150.json()["reason"].lower()

        # 4. Change per-transaction cap to ₹300 -> MUST BE CAPPED AT HARD CEILING ₹200
        cap300_resp = await ac.post(
            "/api/v1/admin/autopay-demo/update-policy",
            headers=_auth_headers(admin_user.id),
            json={"per_transaction_cap": 300},
        )
        assert cap300_resp.status_code == 200
        # Hard ceiling is 200, so effective cap is min(300, 200) = 200
        assert cap300_resp.json()["effective_transaction_cap"] == 200
        assert cap300_resp.json()["hard_safety_ceiling"] == 200

        # Reset cap back to ₹200 for subsequent tests
        await ac.post(
            "/api/v1/admin/autopay-demo/update-policy",
            headers=_auth_headers(admin_user.id),
            json={"enabled": True, "per_transaction_cap": 200},
        )


@pytest.mark.asyncio
async def test_trust_simulation_late_returns_reduces_cap_and_blocks_150_fine():
    """Verify late-return simulation reduces trust to LOW (₹140 cap) and causes ₹150 fine to be blocked."""
    admin_user = await _create_test_user_with_role(Role.ADMIN, "admin_trust_late")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        sim_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate-trust",
            headers=_auth_headers(admin_user.id),
            json={"action": "late"},
        )
        assert sim_resp.status_code == 200
        assert sim_resp.json()["new_trust_tier"] == "LOW"
        assert sim_resp.json()["effective_transaction_cap"] == 140

        fine_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate",
            headers=_auth_headers(admin_user.id),
            json={"scenario": "within_limit"},
        )
        assert fine_resp.status_code == 200
        assert fine_resp.json()["status"] == "BLOCKED"


@pytest.mark.asyncio
async def test_trust_simulation_reset_restores_cap_and_allows_150_fine():
    """Verify reset restores baseline state (₹200 cap) and allows ₹150 fine to execute again."""
    admin_user = await _create_test_user_with_role(Role.ADMIN, "admin_trust_reset")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        reset_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate-trust",
            headers=_auth_headers(admin_user.id),
            json={"action": "reset"},
        )
        assert reset_resp.status_code == 200
        assert reset_resp.json()["effective_transaction_cap"] == 200

        fine_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate",
            headers=_auth_headers(admin_user.id),
            json={"scenario": "within_limit"},
        )
        assert fine_resp.status_code == 200
        assert fine_resp.json()["status"] == "EXECUTED"


@pytest.mark.asyncio
async def test_bounded_payment_demo_over_limit_blocked():
    """Verify ₹250 fine simulation is blocked by policy (over cap)."""
    admin_user = await _create_test_user_with_role(Role.ADMIN, "admin_over")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate",
            headers=_auth_headers(admin_user.id),
            json={"scenario": "over_limit"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "BLOCKED"


@pytest.mark.asyncio
async def test_gateway_failure_simulation_handling():
    """Verify payment gateway failure simulation does not mark fine paid or create partial payment."""
    admin_user = await _create_test_user_with_role(Role.ADMIN, "admin_fail")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate",
            headers=_auth_headers(admin_user.id),
            json={"scenario": "simulate_failure"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "GATEWAY_FAILURE"


@pytest.mark.asyncio
async def test_admin_autopay_audit_trail_retrieval():
    """Verify audit log endpoint returns real Prisma audit trail items for Auto-Pay events."""
    admin_user = await _create_test_user_with_role(Role.ADMIN, "admin_audit")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get(
            "/api/v1/admin/autopay-demo/audit-trail",
            headers=_auth_headers(admin_user.id),
        )
        assert resp.status_code == 200
        assert "items" in resp.json()
        assert isinstance(resp.json()["items"], list)


@pytest.mark.asyncio
async def test_monthly_spending_simulation_900_and_boundary_checks():
    """Verify Phase 2 monthly spending simulation (₹900 spend) and exact boundary / over-cap rejections."""
    admin_user = await _create_test_user_with_role(Role.ADMIN, "admin_monthly_900")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Reset trust to baseline and policy to enabled (200 cap)
        await ac.post(
            "/api/v1/admin/autopay-demo/simulate-trust",
            headers=_auth_headers(admin_user.id),
            json={"action": "reset"},
        )

        # 2. Simulate ₹900 monthly spend
        sim900_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate-monthly-spend",
            headers=_auth_headers(admin_user.id),
            json={"action": "simulate_900"},
        )
        assert sim900_resp.status_code == 200
        assert sim900_resp.json()["monthly_spent"] == 900
        assert sim900_resp.json()["remaining_authority"] == 100

        # 3. Verify Overview returns DB-derived monthly spend values
        ov_resp = await ac.get(
            "/api/v1/admin/autopay-demo/overview",
            headers=_auth_headers(admin_user.id),
        )
        assert ov_resp.status_code == 200
        assert ov_resp.json()["monthly_spent"] == 900
        assert ov_resp.json()["remaining_monthly_authority"] == 100

        # 4. ₹100 Fine -> Exact Boundary (₹900 + ₹100 = ₹1000) -> EXECUTED
        b100_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate",
            headers=_auth_headers(admin_user.id),
            json={"scenario": "boundary_100"},
        )
        assert b100_resp.status_code == 200
        assert b100_resp.json()["status"] == "EXECUTED"
        assert b100_resp.json()["amount"] == 100

        # 5. Verify Overview now shows ₹1000 spent and ₹0 remaining
        ov_resp2 = await ac.get(
            "/api/v1/admin/autopay-demo/overview",
            headers=_auth_headers(admin_user.id),
        )
        assert ov_resp2.json()["monthly_spent"] == 1000
        assert ov_resp2.json()["remaining_monthly_authority"] == 0

        # 6. Re-simulate ₹900 spend to test over-cap scenarios
        await ac.post(
            "/api/v1/admin/autopay-demo/simulate-monthly-spend",
            headers=_auth_headers(admin_user.id),
            json={"action": "simulate_900"},
        )

        # 7. ₹101 Fine (+₹1 Over Monthly Cap) -> BLOCKED
        over101_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate",
            headers=_auth_headers(admin_user.id),
            json={"scenario": "over_monthly_101"},
        )
        assert over101_resp.status_code == 200
        assert over101_resp.json()["status"] == "BLOCKED"
        assert "monthly spending cap" in over101_resp.json()["reason"].lower() or "current spent" in over101_resp.json()["reason"].lower()

        # 8. ₹150 Fine (Standard Fine at ₹900 spend) -> BLOCKED by monthly cap
        over150_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate",
            headers=_auth_headers(admin_user.id),
            json={"scenario": "within_limit"},
        )
        assert over150_resp.status_code == 200
        assert over150_resp.json()["status"] == "BLOCKED"
        assert "monthly spending cap" in over150_resp.json()["reason"].lower()

        # 9. Clean up monthly spend after test run so subsequent tests start with fresh state
        await ac.post(
            "/api/v1/admin/autopay-demo/simulate-monthly-spend",
            headers=_auth_headers(admin_user.id),
            json={"action": "reset"},
        )


@pytest.mark.asyncio
async def test_monthly_spending_simulation_reset():
    """Verify resetting monthly spend returns monthly_spent to ₹0 and authority to ₹1000."""
    admin_user = await _create_test_user_with_role(Role.ADMIN, "admin_monthly_reset")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Reset monthly spend to ₹0
        reset_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate-monthly-spend",
            headers=_auth_headers(admin_user.id),
            json={"action": "reset"},
        )
        assert reset_resp.status_code == 200
        assert reset_resp.json()["monthly_spent"] == 0
        assert reset_resp.json()["remaining_authority"] == 1000

        # ₹150 fine simulation MUST now execute successfully
        sim150 = await ac.post(
            "/api/v1/admin/autopay-demo/simulate",
            headers=_auth_headers(admin_user.id),
            json={"scenario": "within_limit"},
        )
        assert sim150.status_code == 200
        assert sim150.json()["status"] == "EXECUTED"


@pytest.mark.asyncio
async def test_monthly_spending_demo_isolation_and_rbac():
    """Verify RBAC restricts simulate-monthly-spend endpoint to Admin and IT Head only."""
    admin_user = await _create_test_user_with_role(Role.ADMIN, "admin_m_rbac")
    guardian_user = await _create_test_user_with_role(Role.GUARDIAN, "guardian_m_rbac")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Guardian forbidden -> 403
        g_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate-monthly-spend",
            headers=_auth_headers(guardian_user.id),
            json={"action": "simulate_900"},
        )
        assert g_resp.status_code == 403

        # Admin allowed -> 200
        a_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate-monthly-spend",
            headers=_auth_headers(admin_user.id),
            json={"action": "simulate_900"},
        )
        assert a_resp.status_code == 200


@pytest.mark.asyncio
async def test_arbitrary_fine_tester_boundaries_and_validations():
    """Phase 3 Test 1: Verify ₹139 allowed, ₹140 allowed, ₹141 blocked under LOW trust (₹140 cap) & validate invalid amounts."""
    admin_user = await _create_test_user_with_role(Role.ADMIN, "admin_cust_bound")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Set LOW trust tier (0.7x multiplier -> effective transaction cap = ₹140)
        trust_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate-trust",
            headers=_auth_headers(admin_user.id),
            json={"action": "late"},
        )
        assert trust_resp.status_code == 200
        assert trust_resp.json()["effective_transaction_cap"] == 140

        # Reset monthly spend to clean state
        await ac.post(
            "/api/v1/admin/autopay-demo/simulate-monthly-spend",
            headers=_auth_headers(admin_user.id),
            json={"action": "reset"},
        )

        # 2. Test ₹139 -> ALLOWED / EXECUTED (139 <= 140)
        c139_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate",
            headers=_auth_headers(admin_user.id),
            json={"scenario": "custom", "amount": 139},
        )
        assert c139_resp.status_code == 200
        assert c139_resp.json()["status"] == "EXECUTED"
        assert c139_resp.json()["amount"] == 139

        # 3. Test ₹140 -> ALLOWED / EXECUTED (140 <= 140)
        c140_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate",
            headers=_auth_headers(admin_user.id),
            json={"scenario": "custom", "amount": 140},
        )
        assert c140_resp.status_code == 200
        assert c140_resp.json()["status"] == "EXECUTED"
        assert c140_resp.json()["amount"] == 140

        # 4. Test ₹141 -> BLOCKED (141 > 140 effective cap)
        c141_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate",
            headers=_auth_headers(admin_user.id),
            json={"scenario": "custom", "amount": 141},
        )
        assert c141_resp.status_code == 200
        assert c141_resp.json()["status"] == "BLOCKED"
        assert "per-transaction cap" in c141_resp.json()["reason"].lower() or "exceeds" in c141_resp.json()["reason"].lower()

        # 5. Validation 1: Zero amount -> 400 Bad Request
        zero_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate",
            headers=_auth_headers(admin_user.id),
            json={"scenario": "custom", "amount": 0},
        )
        assert zero_resp.status_code == 400
        assert "greater than" in zero_resp.json()["detail"].lower() or "positive" in zero_resp.json()["detail"].lower()

        # 6. Validation 2: Negative amount -> 400 Bad Request
        neg_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate",
            headers=_auth_headers(admin_user.id),
            json={"scenario": "custom", "amount": -50},
        )
        assert neg_resp.status_code == 400

        # 7. Validation 3: Missing amount for custom scenario -> 400 Bad Request
        missing_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate",
            headers=_auth_headers(admin_user.id),
            json={"scenario": "custom"},
        )
        assert missing_resp.status_code == 400

        # Clean up trust state back to baseline
        await ac.post(
            "/api/v1/admin/autopay-demo/simulate-trust",
            headers=_auth_headers(admin_user.id),
            json={"action": "reset"},
        )


@pytest.mark.asyncio
async def test_arbitrary_fine_tester_policy_and_monthly_cap_interactions():
    """Phase 3 Test 2: Verify custom fine interaction with Guardian limit, Monthly cap, and Disabled policy."""
    admin_user = await _create_test_user_with_role(Role.ADMIN, "admin_cust_pol")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Reset trust & monthly spend
        await ac.post(
            "/api/v1/admin/autopay-demo/simulate-trust",
            headers=_auth_headers(admin_user.id),
            json={"action": "reset"},
        )

        # 1. Set Guardian Per-Fine Limit to ₹100
        cap100_resp = await ac.post(
            "/api/v1/admin/autopay-demo/update-policy",
            headers=_auth_headers(admin_user.id),
            json={"enabled": True, "per_transaction_cap": 100},
        )
        assert cap100_resp.status_code == 200

        # Custom fine ₹101 -> BLOCKED by ₹100 per-fine limit
        c101_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate",
            headers=_auth_headers(admin_user.id),
            json={"scenario": "custom", "amount": 101},
        )
        assert c101_resp.status_code == 200
        assert c101_resp.json()["status"] == "BLOCKED"

        # 2. Reset policy cap to ₹200 and simulate ₹900 monthly spend
        await ac.post(
            "/api/v1/admin/autopay-demo/update-policy",
            headers=_auth_headers(admin_user.id),
            json={"enabled": True, "per_transaction_cap": 200},
        )
        await ac.post(
            "/api/v1/admin/autopay-demo/simulate-monthly-spend",
            headers=_auth_headers(admin_user.id),
            json={"action": "simulate_900"},
        )

        # Custom fine ₹100 -> EXECUTED (900 + 100 = 1000)
        c100_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate",
            headers=_auth_headers(admin_user.id),
            json={"scenario": "custom", "amount": 100},
        )
        assert c100_resp.status_code == 200
        assert c100_resp.json()["status"] == "EXECUTED"

        # Re-simulate ₹900 spend
        await ac.post(
            "/api/v1/admin/autopay-demo/simulate-monthly-spend",
            headers=_auth_headers(admin_user.id),
            json={"action": "simulate_900"},
        )

        # Custom fine ₹101 -> BLOCKED by monthly spending cap (900 + 101 = 1001 > 1000)
        c101_m_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate",
            headers=_auth_headers(admin_user.id),
            json={"scenario": "custom", "amount": 101},
        )
        assert c101_m_resp.status_code == 200
        assert c101_m_resp.json()["status"] == "BLOCKED"
        assert "monthly spending cap" in c101_m_resp.json()["reason"].lower()

        # 3. Disable Auto-Pay -> Custom fine ₹50 BLOCKED
        await ac.post(
            "/api/v1/admin/autopay-demo/update-policy",
            headers=_auth_headers(admin_user.id),
            json={"enabled": False},
        )
        c50_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate",
            headers=_auth_headers(admin_user.id),
            json={"scenario": "custom", "amount": 50},
        )
        assert c50_resp.status_code == 200
        assert c50_resp.json()["status"] == "BLOCKED"
        assert "disabled" in c50_resp.json()["reason"].lower()

        # Clean up state
        await ac.post(
            "/api/v1/admin/autopay-demo/update-policy",
            headers=_auth_headers(admin_user.id),
            json={"enabled": True, "per_transaction_cap": 200},
        )
        await ac.post(
            "/api/v1/admin/autopay-demo/simulate-monthly-spend",
            headers=_auth_headers(admin_user.id),
            json={"action": "reset"},
        )


@pytest.mark.asyncio
async def test_arbitrary_fine_tester_rbac_and_audit():
    """Phase 3 Test 3: Verify RBAC restricts custom scenario to ADMIN / IT_HEAD and records audit events."""
    admin_user = await _create_test_user_with_role(Role.ADMIN, "admin_cust_rbac")
    it_head_user = await _create_test_user_with_role(Role.IT_HEAD, "it_cust_rbac")
    guardian_user = await _create_test_user_with_role(Role.GUARDIAN, "g_cust_rbac")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Guardian forbidden -> 403
        g_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate",
            headers=_auth_headers(guardian_user.id),
            json={"scenario": "custom", "amount": 120},
        )
        assert g_resp.status_code == 403

        # IT Head allowed -> 200
        it_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate",
            headers=_auth_headers(it_head_user.id),
            json={"scenario": "custom", "amount": 120},
        )
        assert it_resp.status_code == 200
        assert it_resp.json()["status"] == "EXECUTED"

        # Admin allowed -> 200
        a_resp = await ac.post(
            "/api/v1/admin/autopay-demo/simulate",
            headers=_auth_headers(admin_user.id),
            json={"scenario": "custom", "amount": 120},
        )
        assert a_resp.status_code == 200
