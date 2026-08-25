import os
import uuid

os.environ["APP_ENV"] = "test"

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.core.constants import Role
from app.db.prisma import prisma
from app.main import create_app
from app.modules.members import repository as member_repository

os.environ.setdefault("DATABASE_URL", get_settings().database_url)

TEST_EMAIL_DOMAIN = "@contact-test.example.com"


def _unique_email() -> str:
    return f"{uuid.uuid4().hex}{TEST_EMAIL_DOMAIN}"


async def _make_user(role_name: str):
    role = await member_repository.upsert_role(role_name)
    return await member_repository.create_member(
        email=_unique_email(),
        password_hash=None,
        full_name=f"Test {role_name.title()}",
        phone=None,
        avatar_url=None,
        role_id=role.id,
    )


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    await prisma.connect()
    yield
    await prisma.notification.delete_many(
        where={"user": {"email": {"endswith": TEST_EMAIL_DOMAIN}}}
    )
    await prisma.user.delete_many(where={"email": {"endswith": TEST_EMAIL_DOMAIN}})
    await prisma.disconnect()


@pytest_asyncio.fixture
async def client():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


_VALID_PAYLOAD = {
    "name": "Jordan Visitor",
    "email": "jordan@example.com",
    "phone_number": "+91 98765 43210",
    "organization": "Acme Reading Circle",
    "subject": "Bulk membership question",
    "message": "We'd like to enroll 20 people, what's the process?",
}


async def test_contact_message_requires_no_authentication(client):
    response = await client.post("/api/v1/contact", json=_VALID_PAYLOAD)
    assert response.status_code == 204


async def test_contact_message_rejects_invalid_email(client):
    response = await client.post(
        "/api/v1/contact", json={**_VALID_PAYLOAD, "email": "not-an-email"}
    )
    assert response.status_code == 422


async def test_contact_message_notifies_admins_and_it_head_but_not_managers(client):
    admin = await _make_user(Role.ADMIN)
    it_head = await _make_user(Role.IT_HEAD)
    manager = await _make_user(Role.MANAGER)

    response = await client.post("/api/v1/contact", json=_VALID_PAYLOAD)
    assert response.status_code == 204

    admin_notification = await prisma.notification.find_first(
        where={"userId": admin.id, "type": "contact-message"}
    )
    it_head_notification = await prisma.notification.find_first(
        where={"userId": it_head.id, "type": "contact-message"}
    )
    manager_notification = await prisma.notification.find_first(
        where={"userId": manager.id, "type": "contact-message"}
    )

    assert admin_notification is not None
    assert "Jordan Visitor" in admin_notification.message
    assert it_head_notification is not None
    assert manager_notification is None
