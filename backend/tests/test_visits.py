import os
import uuid

os.environ["APP_ENV"] = "test"

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.core.constants import Role
from app.core.security import hash_password
from app.db.prisma import prisma
from app.main import create_app
from app.modules.members import repository

os.environ.setdefault("DATABASE_URL", get_settings().database_url)

TEST_EMAIL_DOMAIN = "@visits-test.example.com"


def _unique_email() -> str:
    return f"{uuid.uuid4().hex}{TEST_EMAIL_DOMAIN}"


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    await prisma.connect()
    yield
    domain_filter = {"email": {"endswith": TEST_EMAIL_DOMAIN}}
    await prisma.libraryvisit.delete_many(where={"member": {"is": domain_filter}})
    await prisma.guardianlink.delete_many(where={"member": {"is": domain_filter}})
    await prisma.user.delete_many(where=domain_filter)
    await prisma.disconnect()


@pytest_asyncio.fixture
async def client():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


async def _make_user(role_name: str):
    role = await repository.upsert_role(role_name)
    return await repository.create_member(
        email=_unique_email(),
        password_hash=hash_password("Password123!"),
        full_name=f"{role_name.title()} User {uuid.uuid4().hex[:4]}",
        phone=None,
        avatar_url=None,
        role_id=role.id,
    )


async def _login(client: AsyncClient, user) -> str:
    response = await client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": "Password123!"}
    )
    return response.json()["access_token"]


async def _link(client: AsyncClient, admin_token: str, guardian, member):
    await client.post(
        "/api/v1/guardian/links",
        json={"guardian_id": guardian.id, "member_id": member.id},
        headers={"Authorization": f"Bearer {admin_token}"},
    )


async def test_successful_check_in_and_check_out_flow(client):
    manager = await _make_user(Role.MANAGER)
    member = await _make_user(Role.MEMBER)
    manager_token = await _login(client, manager)
    headers = {"Authorization": f"Bearer {manager_token}"}

    # 1. Initial check-in
    check_in_res = await client.post(
        "/api/v1/visits/check-in",
        json={"member_id": member.id},
        headers=headers,
    )
    assert check_in_res.status_code == 201
    body = check_in_res.json()
    assert body["member_id"] == member.id
    assert body["is_currently_inside"] is True
    assert body["checked_out_at"] is None

    # 2. Verify in active visits list
    active_res = await client.get("/api/v1/visits/active", headers=headers)
    assert active_res.status_code == 200
    active_ids = [v["member_id"] for v in active_res.json()]
    assert member.id in active_ids

    # 3. Check-out
    check_out_res = await client.post(
        "/api/v1/visits/check-out",
        json={"member_id": member.id},
        headers=headers,
    )
    assert check_out_res.status_code == 200
    out_body = check_out_res.json()
    assert out_body["member_id"] == member.id
    assert out_body["is_currently_inside"] is False
    assert out_body["checked_out_at"] is not None

    # 4. Verify removed from active visits
    active_after = await client.get("/api/v1/visits/active", headers=headers)
    active_ids_after = [v["member_id"] for v in active_after.json()]
    assert member.id not in active_ids_after


async def test_duplicate_check_in_rejected(client):
    librarian = await _make_user(Role.LIBRARIAN)
    member = await _make_user(Role.MEMBER)
    token = await _login(client, librarian)
    headers = {"Authorization": f"Bearer {token}"}

    first = await client.post(
        "/api/v1/visits/check-in",
        json={"member_id": member.id},
        headers=headers,
    )
    assert first.status_code == 201

    second = await client.post(
        "/api/v1/visits/check-in",
        json={"member_id": member.id},
        headers=headers,
    )
    assert second.status_code == 400
    assert "already checked in" in second.json()["detail"].lower()


async def test_check_out_without_check_in_rejected(client):
    manager = await _make_user(Role.MANAGER)
    member = await _make_user(Role.MEMBER)
    token = await _login(client, manager)
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.post(
        "/api/v1/visits/check-out",
        json={"member_id": member.id},
        headers=headers,
    )
    assert res.status_code == 400
    assert "not currently checked in" in res.json()["detail"].lower()


async def test_invalid_member_id_rejected(client):
    manager = await _make_user(Role.MANAGER)
    token = await _login(client, manager)
    headers = {"Authorization": f"Bearer {token}"}

    invalid_id = str(uuid.uuid4())
    check_in_res = await client.post(
        "/api/v1/visits/check-in",
        json={"member_id": invalid_id},
        headers=headers,
    )
    assert check_in_res.status_code == 404

    check_out_res = await client.post(
        "/api/v1/visits/check-out",
        json={"member_id": invalid_id},
        headers=headers,
    )
    assert check_out_res.status_code == 404


async def test_only_authorized_staff_can_check_in_and_out(client):
    member_user = await _make_user(Role.MEMBER)
    guardian_user = await _make_user(Role.GUARDIAN)
    target_member = await _make_user(Role.MEMBER)

    member_token = await _login(client, member_user)
    guardian_token = await _login(client, guardian_user)

    # Member attempt check-in -> 403
    m_res = await client.post(
        "/api/v1/visits/check-in",
        json={"member_id": target_member.id},
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert m_res.status_code == 403

    # Guardian attempt check-in -> 403
    g_res = await client.post(
        "/api/v1/visits/check-in",
        json={"member_id": target_member.id},
        headers={"Authorization": f"Bearer {guardian_token}"},
    )
    assert g_res.status_code == 403

    # Member attempt active list -> 403
    active_res = await client.get(
        "/api/v1/visits/active",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert active_res.status_code == 403


async def test_member_can_see_own_status(client):
    manager = await _make_user(Role.MANAGER)
    member = await _make_user(Role.MEMBER)
    manager_token = await _login(client, manager)
    member_token = await _login(client, member)

    # Before check-in: no history
    status_before = await client.get(
        "/api/v1/visits/my-status",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert status_before.status_code == 200
    assert status_before.json()["is_in_library"] is False
    assert status_before.json()["checked_in_at"] is None

    # Manager checks in member
    await client.post(
        "/api/v1/visits/check-in",
        json={"member_id": member.id},
        headers={"Authorization": f"Bearer {manager_token}"},
    )

    # Member checks own status -> inside
    status_inside = await client.get(
        "/api/v1/visits/my-status",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert status_inside.status_code == 200
    assert status_inside.json()["is_in_library"] is True
    assert status_inside.json()["checked_in_at"] is not None

    # Manager checks out member
    await client.post(
        "/api/v1/visits/check-out",
        json={"member_id": member.id},
        headers={"Authorization": f"Bearer {manager_token}"},
    )

    # Member checks status -> completed visit
    status_outside = await client.get(
        "/api/v1/visits/my-status",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert status_outside.status_code == 200
    assert status_outside.json()["is_in_library"] is False
    assert status_outside.json()["last_checked_out_at"] is not None


async def test_guardian_can_see_linked_child_status_and_not_unrelated(client):
    admin = await _make_user(Role.ADMIN)
    manager = await _make_user(Role.MANAGER)
    guardian = await _make_user(Role.GUARDIAN)
    child = await _make_user(Role.MEMBER)
    stranger = await _make_user(Role.MEMBER)

    admin_token = await _login(client, admin)
    manager_token = await _login(client, manager)
    guardian_token = await _login(client, guardian)

    await _link(client, admin_token, guardian, child)

    # Manager checks in linked child
    await client.post(
        "/api/v1/visits/check-in",
        json={"member_id": child.id},
        headers={"Authorization": f"Bearer {manager_token}"},
    )

    # Guardian fetches children-status
    children_res = await client.get(
        "/api/v1/visits/children-status",
        headers={"Authorization": f"Bearer {guardian_token}"},
    )
    assert children_res.status_code == 200
    statuses = children_res.json()
    assert len(statuses) == 1
    assert statuses[0]["child_id"] == child.id
    assert statuses[0]["is_in_library"] is True

    # Ensure stranger member ID is not in guardian's status list
    stranger_ids = [s["child_id"] for s in statuses]
    assert stranger.id not in stranger_ids


async def test_export_active_visits_csv(client):
    manager = await _make_user(Role.MANAGER)
    member1 = await _make_user(Role.MEMBER)
    member2 = await _make_user(Role.MEMBER)

    manager_token = await _login(client, manager)
    headers = {"Authorization": f"Bearer {manager_token}"}

    # Check in member1 and member2
    await client.post("/api/v1/visits/check-in", json={"member_id": member1.id}, headers=headers)
    await client.post("/api/v1/visits/check-in", json={"member_id": member2.id}, headers=headers)

    # Check out member2 so only member1 is currently inside
    await client.post("/api/v1/visits/check-out", json={"member_id": member2.id}, headers=headers)

    # Export CSV
    export_res = await client.get("/api/v1/visits/export-csv", headers=headers)
    assert export_res.status_code == 200
    assert "text/csv" in export_res.headers["content-type"]
    assert (
        "attachment; filename=library-currently-present-"
        in export_res.headers["content-disposition"]
    )

    csv_text = export_res.text
    assert "Member ID,Member Name,Email,Check-In Date,Check-In Time,Status" in csv_text
    assert member1.id in csv_text
    assert member1.email in csv_text
    assert member2.id not in csv_text

    # Member user should not be authorized to export CSV
    member_token = await _login(client, member1)
    unauthorized_res = await client.get(
        "/api/v1/visits/export-csv", headers={"Authorization": f"Bearer {member_token}"}
    )
    assert unauthorized_res.status_code == 403
