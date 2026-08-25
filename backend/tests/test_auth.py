import asyncio
import os
import uuid
from datetime import UTC, datetime, timedelta

os.environ["APP_ENV"] = "test"

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.db.prisma import prisma
from app.main import create_app
from app.modules.auth import service

os.environ.setdefault("DATABASE_URL", get_settings().database_url)

TEST_EMAIL_DOMAIN = "@auth-test.example.com"


def _unique_email() -> str:
    return f"{uuid.uuid4().hex}{TEST_EMAIL_DOMAIN}"


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    await prisma.connect()
    yield
    await prisma.user.delete_many(where={"email": {"endswith": TEST_EMAIL_DOMAIN}})
    await prisma.disconnect()


@pytest_asyncio.fixture
async def client():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


def _google_claims(email: str, *, verified: bool = True) -> dict:
    return {
        "email": email,
        "email_verified": verified,
        "name": "Google Test User",
        "picture": "https://example.com/avatar.png",
    }


async def test_register_returns_token_and_member_role(client):
    email = _unique_email()
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "New Member"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["access_token"]
    assert body["user"]["email"] == email
    assert body["user"]["role"]["name"] == "member"


async def test_email_identity_is_case_insensitive(client):
    email = _unique_email()
    registered = await client.post(
        "/api/v1/auth/register",
        json={"email": email.upper(), "password": "Password123!", "full_name": "Case Test"},
    )
    duplicate = await client.post(
        "/api/v1/auth/register",
        json={"email": email.lower(), "password": "Password123!", "full_name": "Duplicate"},
    )
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email.swapcase(), "password": "Password123!"},
    )

    assert registered.status_code == 201
    assert registered.json()["user"]["email"] == email.lower()
    assert duplicate.status_code == 409
    assert login.status_code == 200


async def test_register_duplicate_email_conflicts(client):
    """Test Case 7: Duplicate Email"""

    payload = {"email": _unique_email(), "password": "Password123!", "full_name": "Dup"}
    first = await client.post("/api/v1/auth/register", json=payload)
    second = await client.post("/api/v1/auth/register", json=payload)

    print("\nRegister Response:", second.status_code, second.text)

    assert first.status_code == 201
    assert second.status_code == 409


async def test_register_missing_email(client):
    """Test Case 2: Missing Email"""

    payload = {"password": "Password123!", "full_name": "New User"}
    headers = {"Content-Type": "application/json"}

    response = await client.post("/api/v1/auth/register", json=payload, headers=headers)

    print("\nRegister Response:", response.status_code, response.text)

    assert response.status_code == 422
    body = response.json()
    assert body["detail"][0]["loc"] == ["body", "email"]
    assert body["detail"][0]["type"] == "missing"


async def test_register_missing_password(client):
    """Test Case 3: Missing Password"""

    payload = {"email": _unique_email(), "full_name": "New User"}
    headers = {"Content-Type": "application/json"}

    response = await client.post("/api/v1/auth/register", json=payload, headers=headers)

    print("\nRegister Response:", response.status_code, response.text)

    assert response.status_code == 422
    body = response.json()
    assert body["detail"][0]["loc"] == ["body", "password"]
    assert body["detail"][0]["type"] == "missing"


async def test_register_missing_full_name(client):
    """Test Case 4: Missing Full Name"""

    payload = {"email": _unique_email(), "password": "Password123!"}
    headers = {"Content-Type": "application/json"}

    response = await client.post("/api/v1/auth/register", json=payload, headers=headers)

    print("\nRegister Response:", response.status_code, response.text)

    assert response.status_code == 422
    body = response.json()
    assert body["detail"][0]["loc"] == ["body", "full_name"]
    assert body["detail"][0]["type"] == "missing"


async def test_register_invalid_email_format(client):
    """Test Case 5: Invalid Email Format"""

    payload = {"email": "not-an-email", "password": "Password123!", "full_name": "New User"}
    headers = {"Content-Type": "application/json"}

    response = await client.post("/api/v1/auth/register", json=payload, headers=headers)

    print("\nRegister Response:", response.status_code, response.text)

    assert response.status_code == 422
    body = response.json()
    assert body["detail"][0]["loc"] == ["body", "email"]
    assert body["detail"][0]["type"] == "value_error"


async def test_register_weak_password(client):
    """Test Case 6: Weak Password"""

    payload = {"email": _unique_email(), "password": "abc123", "full_name": "New User"}
    headers = {"Content-Type": "application/json"}

    response = await client.post("/api/v1/auth/register", json=payload, headers=headers)

    print("\nRegister Response:", response.status_code, response.text)

    assert response.status_code == 422
    body = response.json()
    assert body["detail"][0]["loc"] == ["body", "password"]
    assert body["detail"][0]["type"] == "string_too_short"


async def test_register_invalid_role_is_ignored(client):
    """Test Case 8: Invalid Role"""
    payload = {
        "email": _unique_email(),
        "password": "Password123!",
        "full_name": "New User",
        "role": "superadmin",
    }
    headers = {"Content-Type": "application/json"}

    response = await client.post("/api/v1/auth/register", json=payload, headers=headers)

    print("\nRegister Response:", response.status_code, response.text)

    assert response.status_code == 201
    body = response.json()
    assert body["user"]["role"]["name"] == "member"


async def test_login_with_correct_password_returns_token(client):
    """Test Case 1: Login Success"""

    email = _unique_email()
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "Login Test"},
    )
    response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "Password123!"}
    )

    print("\nLogin Response:", response.status_code, response.text)

    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["user"]["email"] == email


async def test_login_with_wrong_password_rejected(client):
    """Test Case 2: Login with Wrong Password"""

    email = _unique_email()
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "Login Test"},
    )
    response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "WrongPassword1"}
    )
    print("\nLogin Response:", response.status_code, response.text)
    assert response.status_code == 401


async def test_login_unknown_email_rejected(client):
    """Test Case 3: Unknown Email"""

    response = await client.post(
        "/api/v1/auth/login", json={"email": _unique_email(), "password": "Password123!"}
    )

    print("\nLogin Response:", response.status_code, response.text)

    assert response.status_code == 401


async def test_login_missing_email(client):
    """Test Case 4: Missing Email"""

    payload = {"password": "Password123!"}
    headers = {"Content-Type": "application/json"}

    response = await client.post("/api/v1/auth/login", json=payload, headers=headers)

    print("\nLogin Response:", response.status_code, response.text)

    assert response.status_code == 422
    body = response.json()
    assert body["detail"][0]["loc"] == ["body", "email"]
    assert body["detail"][0]["type"] == "missing"


async def test_login_missing_password(client):
    """Test Case 5: Missing Password"""

    payload = {"email": _unique_email()}
    headers = {"Content-Type": "application/json"}

    response = await client.post("/api/v1/auth/login", json=payload, headers=headers)

    print("\nLogin Response:", response.status_code, response.text)

    assert response.status_code == 422
    body = response.json()
    assert body["detail"][0]["loc"] == ["body", "password"]
    assert body["detail"][0]["type"] == "missing"


async def test_login_invalid_email_format(client):
    """Test Case 6: Invalid Email Format"""

    payload = {"email": "not-an-email", "password": "Password123!"}
    headers = {"Content-Type": "application/json"}

    response = await client.post("/api/v1/auth/login", json=payload, headers=headers)

    print("\nLogin Response:", response.status_code, response.text)

    assert response.status_code == 422
    body = response.json()
    assert body["detail"][0]["loc"] == ["body", "email"]
    assert body["detail"][0]["type"] == "value_error"


async def test_google_login_without_configured_client_id_returns_503(client, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "google_client_id", "")
    monkeypatch.setattr(service, "get_settings", lambda: settings)

    response = await client.post("/api/v1/auth/google", json={"id_token": "irrelevant"})

    assert response.status_code == 503


async def test_google_login_creates_new_member(client, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(service, "get_settings", lambda: settings)

    email = _unique_email()
    monkeypatch.setattr(
        service.google_id_token,
        "verify_oauth2_token",
        lambda *args, **kwargs: _google_claims(email),
    )

    response = await client.post("/api/v1/auth/google", json={"id_token": "fake-valid-token"})

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["email"] == email
    assert body["user"]["role"]["name"] == "member"
    assert body["access_token"]
    assert body["is_new_user"] is True

    second_response = await client.post(
        "/api/v1/auth/google", json={"id_token": "fake-valid-token"}
    )
    assert second_response.status_code == 200
    assert second_response.json()["is_new_user"] is False


async def test_concurrent_first_google_logins_share_one_account(client, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(service, "get_settings", lambda: settings)
    email = _unique_email()
    monkeypatch.setattr(
        service.google_id_token,
        "verify_oauth2_token",
        lambda *args, **kwargs: _google_claims(email.upper()),
    )

    first, second = await asyncio.gather(
        client.post("/api/v1/auth/google", json={"id_token": "first"}),
        client.post("/api/v1/auth/google", json={"id_token": "second"}),
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["user"]["id"] == second.json()["user"]["id"]
    assert await prisma.user.count(where={"email": email.lower()}) == 1


async def test_google_login_unverified_email_rejected(client, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(service, "get_settings", lambda: settings)

    monkeypatch.setattr(
        service.google_id_token,
        "verify_oauth2_token",
        lambda *args, **kwargs: _google_claims(_unique_email(), verified=False),
    )

    response = await client.post("/api/v1/auth/google", json={"id_token": "fake-token"})

    assert response.status_code == 401


async def test_google_login_invalid_token_rejected(client, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(service, "get_settings", lambda: settings)

    def _raise(*args, **kwargs):
        raise ValueError("bad token")

    monkeypatch.setattr(service.google_id_token, "verify_oauth2_token", _raise)

    response = await client.post("/api/v1/auth/google", json={"id_token": "garbage"})

    assert response.status_code == 401


async def test_complete_profile_requires_authentication(client):
    response = await client.patch(
        "/api/v1/auth/me",
        json={"full_name": "Someone", "phone": "+911234567890", "password": "Password123!"},
    )

    assert response.status_code == 401


async def test_complete_profile_updates_fields_and_sets_password(client, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "google_client_id", "test-client-id")
    monkeypatch.setattr(service, "get_settings", lambda: settings)

    email = _unique_email()
    monkeypatch.setattr(
        service.google_id_token,
        "verify_oauth2_token",
        lambda *args, **kwargs: _google_claims(email),
    )
    google_response = await client.post(
        "/api/v1/auth/google", json={"id_token": "fake-valid-token"}
    )
    token = google_response.json()["access_token"]

    response = await client.patch(
        "/api/v1/auth/me",
        json={"full_name": "Completed Profile", "phone": "+911234567890", "password": "NewPass123"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["full_name"] == "Completed Profile"
    assert body["user"]["phone"] == "+911234567890"

    login_response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "NewPass123"}
    )
    assert login_response.status_code == 200


async def test_update_profile_partial_update_leaves_other_fields_alone(client):
    email = _unique_email()
    register_response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "Original Name"},
    )
    token = register_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.patch(
        "/api/v1/auth/me", json={"phone": "+911234567890"}, headers=headers
    )

    assert response.status_code == 200
    body = response.json()["user"]
    assert body["full_name"] == "Original Name"
    assert body["phone"] == "+911234567890"

    # Old password still works — omitting it in the PATCH must not clear it.
    login_response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "Password123!"}
    )
    assert login_response.status_code == 200


async def test_update_profile_can_set_avatar_url(client):
    email = _unique_email()
    register_response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "Avatar Tester"},
    )
    token = register_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.patch(
        "/api/v1/auth/me",
        json={"avatar_url": "data:image/svg+xml,%3Csvg%3E%3C/svg%3E"},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["user"]["avatar_url"] == "data:image/svg+xml,%3Csvg%3E%3C/svg%3E"


async def test_password_change_invalidates_previous_refresh_token(client):
    email = _unique_email()
    registered = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "Password Changer"},
    )
    old_refresh = registered.json()["refresh_token"]

    changed = await client.patch(
        "/api/v1/auth/me",
        json={"password": "NewPassword123!", "current_password": "Password123!"},
        headers={"Authorization": f"Bearer {registered.json()['access_token']}"},
    )
    stale_refresh = await client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh})

    assert changed.status_code == 200
    assert stale_refresh.status_code == 401
    fresh_refresh = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": changed.json()["refresh_token"]}
    )
    assert fresh_refresh.status_code == 200


async def test_password_change_without_current_password_is_rejected(client):
    """A stolen access token must not be enough to take the account over."""
    email = _unique_email()
    registered = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "Takeover Target"},
    )
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}

    response = await client.patch(
        "/api/v1/auth/me", json={"password": "AttackerPass123!"}, headers=headers
    )

    assert response.status_code == 403
    # The original password must still work — the attempt changed nothing.
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "Password123!"}
    )
    assert login.status_code == 200


async def test_password_change_with_wrong_current_password_is_rejected(client):
    email = _unique_email()
    registered = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "Wrong Current"},
    )
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}

    response = await client.patch(
        "/api/v1/auth/me",
        json={"password": "AttackerPass123!", "current_password": "NotThePassword!"},
        headers=headers,
    )

    assert response.status_code == 403
    login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "Password123!"}
    )
    assert login.status_code == 200


async def test_non_password_updates_still_need_no_current_password(client):
    """The check must not leak into ordinary profile edits."""
    email = _unique_email()
    registered = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "Profile Editor"},
    )
    headers = {"Authorization": f"Bearer {registered.json()['access_token']}"}

    response = await client.patch("/api/v1/auth/me", json={"full_name": "Renamed"}, headers=headers)

    assert response.status_code == 200
    assert response.json()["user"]["full_name"] == "Renamed"


async def test_register_returns_a_refresh_token_too(client):
    email = _unique_email()
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "Refresh Test"},
    )

    assert response.status_code == 201
    assert response.json()["refresh_token"]


async def test_refresh_issues_a_new_access_token(client):
    email = _unique_email()
    register_response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "Refresh Test"},
    )
    refresh_token = register_response.json()["refresh_token"]

    response = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})

    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["refresh_token"]

    # the new access token actually works against a protected endpoint
    whoami = await client.patch(
        "/api/v1/auth/me",
        json={},
        headers={"Authorization": f"Bearer {body['access_token']}"},
    )
    assert whoami.status_code == 200


async def test_refresh_rejects_garbage_token(client):
    response = await client.post("/api/v1/auth/refresh", json={"refresh_token": "not-a-jwt"})

    assert response.status_code == 401


async def test_refresh_rejects_an_access_token(client):
    email = _unique_email()
    register_response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "Refresh Test"},
    )
    access_token = register_response.json()["access_token"]

    response = await client.post("/api/v1/auth/refresh", json={"refresh_token": access_token})

    assert response.status_code == 401


async def test_logout_requires_authentication(client):
    response = await client.post("/api/v1/auth/logout")

    assert response.status_code == 401


async def test_forgot_password_unknown_email_returns_204(client):
    response = await client.post("/api/v1/auth/forgot-password", json={"email": _unique_email()})

    assert response.status_code == 204


async def test_forgot_password_sends_email_and_reset_token_changes_password(client, monkeypatch):
    sent = {}

    async def _capture(to, subject, body):
        sent.update(to=to, subject=subject, body=body)

    monkeypatch.setattr(service, "send_email_async", _capture)

    email = _unique_email()
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "Reset Test"},
    )

    response = await client.post("/api/v1/auth/forgot-password", json={"email": email})
    assert response.status_code == 204
    assert sent["to"] == email
    assert "reset-password?token=" in sent["body"]

    token = sent["body"].split("token=")[1].split("\n")[0]
    reset_response = await client.post(
        "/api/v1/auth/reset-password", json={"token": token, "password": "NewPassword123"}
    )
    assert reset_response.status_code == 204

    old_login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "Password123!"}
    )
    assert old_login.status_code == 401

    new_login = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "NewPassword123"}
    )
    assert new_login.status_code == 200


async def test_reset_password_rejects_reused_token(client, monkeypatch):
    sent = {}

    async def _capture(to, subject, body):
        sent.update(body=body)

    monkeypatch.setattr(service, "send_email_async", _capture)

    email = _unique_email()
    await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "Reset Reuse Test"},
    )
    await client.post("/api/v1/auth/forgot-password", json={"email": email})
    token = sent["body"].split("token=")[1].split("\n")[0]

    first = await client.post(
        "/api/v1/auth/reset-password", json={"token": token, "password": "NewPassword123"}
    )
    assert first.status_code == 204

    second = await client.post(
        "/api/v1/auth/reset-password", json={"token": token, "password": "AnotherPass123"}
    )
    assert second.status_code == 400


async def test_reset_password_rejects_garbage_token(client):
    response = await client.post(
        "/api/v1/auth/reset-password", json={"token": "not-a-jwt", "password": "NewPassword123"}
    )

    assert response.status_code == 400


async def test_logout_revokes_outstanding_refresh_tokens(client):
    email = _unique_email()
    register_response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "Logout Test"},
    )
    access_token = register_response.json()["access_token"]
    refresh_token = register_response.json()["refresh_token"]

    logout_response = await client.post(
        "/api/v1/auth/logout", headers={"Authorization": f"Bearer {access_token}"}
    )
    assert logout_response.status_code == 204

    reuse_response = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": refresh_token}
    )
    assert reuse_response.status_code == 401


async def test_delete_account_soft_deletes_and_blocks_login(client):
    email = _unique_email()
    password = "Password123!"
    register_response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "full_name": "Delete Me"},
    )
    access_token = register_response.json()["access_token"]

    delete_response = await client.delete(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"}
    )
    assert delete_response.status_code == 204

    login_response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )
    assert login_response.status_code == 401


async def test_delete_account_blocked_by_outstanding_loan(client):
    email = _unique_email()
    register_response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "Password123!", "full_name": "Borrower"},
    )
    access_token = register_response.json()["access_token"]
    user = await prisma.user.find_unique(where={"email": email})
    book = await prisma.book.create(
        data={
            "title": f"Auth Test Book {uuid.uuid4().hex[:8]}",
            "author": "A",
            "category": "Fiction",
        }
    )
    loan = await prisma.loan.create(
        data={
            "bookId": book.id,
            "memberId": user.id,
            "dueDate": datetime.now(UTC) + timedelta(days=14),
            "createdById": user.id,
        }
    )

    try:
        response = await client.delete(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"}
        )
        assert response.status_code == 409
    finally:
        await prisma.loan.delete(where={"id": loan.id})
        await prisma.book.delete(where={"id": book.id})
