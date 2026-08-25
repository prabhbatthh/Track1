"""Guardian monthly reading-digest sweep (guardian/service.py::send_monthly_reading_digests).

Drives the sweep function directly rather than through an HTTP endpoint — like
send_due_soon_reminders, this is a background job with no route of its own.
"""

import os
import uuid
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, patch

os.environ["APP_ENV"] = "test"

import pytest_asyncio
from prisma.models import User

from app.core.config import get_settings
from app.core.constants import Role
from app.db.prisma import prisma
from app.modules.guardian import service as guardian_service
from app.modules.members import repository as member_repository

os.environ.setdefault("DATABASE_URL", get_settings().database_url)

TEST_EMAIL_DOMAIN = "@guardian-digest-test.example.com"
TEST_TITLE_MARKER = "GUARDIAN-DIGEST-TEST-"


def _unique_email() -> str:
    return f"{uuid.uuid4().hex}{TEST_EMAIL_DOMAIN}"


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    db: Any = prisma
    await db.connect()
    yield
    domain_filter = {"email": {"endswith": TEST_EMAIL_DOMAIN}}
    await db.readingprogress.delete_many(where={"member": domain_filter})
    await db.guardianlink.delete_many(where={"member": domain_filter})
    await db.notification.delete_many(where={"user": domain_filter})
    await db.book.delete_many(where={"title": {"startswith": TEST_TITLE_MARKER}})
    await db.user.delete_many(where=domain_filter)
    await db.disconnect()


async def _make_user(role_name: str) -> User:
    role = await member_repository.upsert_role(role_name)
    return await member_repository.create_member(
        email=_unique_email(),
        password_hash=None,
        full_name=f"Test {role_name.title()} {uuid.uuid4().hex[:6]}",
        phone=None,
        avatar_url=None,
        role_id=role.id,
    )


async def _link(guardian: User, child: User):
    return await prisma.guardianlink.create(data={"guardianId": guardian.id, "memberId": child.id})


async def _make_completed_progress(child: User) -> None:
    book = await prisma.book.create(
        data={
            "title": f"{TEST_TITLE_MARKER}{uuid.uuid4().hex}",
            "author": "A",
            "category": "Fiction",
        }
    )
    await prisma.readingprogress.create(
        data={
            "memberId": child.id,
            "bookId": book.id,
            "status": "completed",
            "percentComplete": 100,
        }
    )


def _fake_llm(reply_text: str) -> SimpleNamespace:
    return SimpleNamespace(ainvoke=AsyncMock(return_value=SimpleNamespace(content=reply_text)))


async def test_digest_notifies_guardian_and_marks_link_sent():
    guardian = await _make_user(Role.GUARDIAN)
    child = await _make_user(Role.MEMBER)
    link = await _link(guardian, child)
    await _make_completed_progress(child)

    fake_llm = _fake_llm("Test Member finished 1 book this month, up from 0 last month.")
    with patch("app.modules.guardian.service.build_chat_llm", return_value=fake_llm):
        await guardian_service.send_monthly_reading_digests()

    notifications = await prisma.notification.find_many(where={"userId": guardian.id})
    assert len(notifications) == 1
    assert notifications[0].type == "reading-digest"
    assert (
        notifications[0].message == "Test Member finished 1 book this month, up from 0 last month."
    )

    updated_link = await prisma.guardianlink.find_unique(where={"id": link.id})
    assert updated_link is not None
    assert updated_link.lastDigestSentAt is not None


async def test_digest_skips_a_link_already_sent_this_month():
    guardian = await _make_user(Role.GUARDIAN)
    child = await _make_user(Role.MEMBER)
    await _link(guardian, child)

    fake_llm = _fake_llm("First run.")
    with patch("app.modules.guardian.service.build_chat_llm", return_value=fake_llm):
        await guardian_service.send_monthly_reading_digests()
    assert fake_llm.ainvoke.await_count == 1

    fake_llm_2 = _fake_llm("Should not be called.")
    with patch("app.modules.guardian.service.build_chat_llm", return_value=fake_llm_2):
        await guardian_service.send_monthly_reading_digests()

    fake_llm_2.ainvoke.assert_not_awaited()
    notifications = await prisma.notification.find_many(where={"userId": guardian.id})
    assert len(notifications) == 1


async def test_digest_falls_back_to_a_template_message_when_llm_fails():
    guardian = await _make_user(Role.GUARDIAN)
    child = await _make_user(Role.MEMBER)
    await _link(guardian, child)

    fake_llm = SimpleNamespace(ainvoke=AsyncMock(side_effect=RuntimeError("connection refused")))
    with patch("app.modules.guardian.service.build_chat_llm", return_value=fake_llm):
        await guardian_service.send_monthly_reading_digests()

    # A broken LLM must not skip the notification entirely — it degrades to a plain
    # deterministic sentence instead.
    notifications = await prisma.notification.find_many(where={"userId": guardian.id})
    assert len(notifications) == 1
    assert notifications[0].type == "reading-digest"
    assert "hasn't finished a book yet this month" in notifications[0].message
