import os
import uuid

os.environ["APP_ENV"] = "test"

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.constants import Role
from app.db.prisma import prisma
from app.main import create_app
from app.modules.members import repository as member_repository

os.environ.setdefault("DATABASE_URL", get_settings().database_url)

TEST_EMAIL_DOMAIN = "@community-notif-test.example.com"


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
    await prisma.communitypost.delete_many(
        where={"author": {"email": {"endswith": TEST_EMAIL_DOMAIN}}}
    )
    await prisma.user.delete_many(where={"email": {"endswith": TEST_EMAIL_DOMAIN}})
    await prisma.disconnect()


def _client_as(user) -> AsyncClient:
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def test_reporting_a_post_notifies_every_moderator():
    author = await _make_user(Role.MEMBER)
    reporter = await _make_user(Role.MANAGER)
    admin = await _make_user(Role.ADMIN)
    it_head = await _make_user(Role.IT_HEAD)

    async with _client_as(author) as client:
        created = await client.post("/api/v1/community/posts", json={"content": "Hello community"})
    post_id = created.json()["id"]

    async with _client_as(reporter) as client:
        response = await client.post(f"/api/v1/community/posts/{post_id}/report")
    assert response.status_code == 200

    async with _client_as(admin) as client:
        admin_notifications = await client.get("/api/v1/notifications/me")
    async with _client_as(it_head) as client:
        it_head_notifications = await client.get("/api/v1/notifications/me")

    assert any(n["type"] == "reported-comment" for n in admin_notifications.json())
    assert any(n["type"] == "reported-comment" for n in it_head_notifications.json())


async def test_commenting_on_a_post_notifies_the_author():
    author = await _make_user(Role.MEMBER)
    commenter = await _make_user(Role.MEMBER)

    async with _client_as(author) as client:
        created = await client.post("/api/v1/community/posts", json={"content": "Hello community"})
    post_id = created.json()["id"]

    async with _client_as(commenter) as client:
        await client.post(
            f"/api/v1/community/posts/{post_id}/comments", json={"content": "Nice post!"}
        )

    async with _client_as(author) as client:
        author_notifications = await client.get("/api/v1/notifications/me")
    async with _client_as(commenter) as client:
        commenter_notifications = await client.get("/api/v1/notifications/me")

    assert any(n["type"] == "post-comment" for n in author_notifications.json())
    assert not any(n["type"] == "post-comment" for n in commenter_notifications.json())


async def test_liking_a_post_notifies_the_author_once_per_like():
    author = await _make_user(Role.MEMBER)
    liker = await _make_user(Role.MEMBER)

    async with _client_as(author) as client:
        created = await client.post("/api/v1/community/posts", json={"content": "Hello community"})
    post_id = created.json()["id"]

    async with _client_as(liker) as client:
        await client.post(f"/api/v1/community/posts/{post_id}/like")  # like
        await client.post(f"/api/v1/community/posts/{post_id}/like")  # unlike
        await client.post(f"/api/v1/community/posts/{post_id}/like")  # like again

    async with _client_as(author) as client:
        author_notifications = await client.get("/api/v1/notifications/me")

    like_notifications = [n for n in author_notifications.json() if n["type"] == "post-like"]
    assert len(like_notifications) == 2


async def test_replying_to_a_comment_notifies_the_comment_author_not_the_post_author():
    post_author = await _make_user(Role.MEMBER)
    commenter = await _make_user(Role.MEMBER)
    replier = await _make_user(Role.MEMBER)

    async with _client_as(post_author) as client:
        created = await client.post("/api/v1/community/posts", json={"content": "Hello community"})
    post_id = created.json()["id"]

    async with _client_as(commenter) as client:
        commented = await client.post(
            f"/api/v1/community/posts/{post_id}/comments", json={"content": "First!"}
        )
    comment_id = commented.json()["comments"][0]["id"]

    async with _client_as(replier) as client:
        await client.post(
            f"/api/v1/community/posts/{post_id}/comments",
            json={"content": "Totally agree", "parent_id": comment_id},
        )

    async with _client_as(commenter) as client:
        commenter_notifications = await client.get("/api/v1/notifications/me")
    async with _client_as(post_author) as client:
        post_author_notifications = await client.get("/api/v1/notifications/me")

    assert any(n["type"] == "post-comment" for n in commenter_notifications.json())
    # The reply is to the comment, not the post — the post author (who didn't write
    # the parent comment) shouldn't get a second notification for the same reply.
    assert sum(1 for n in post_author_notifications.json() if n["type"] == "post-comment") == 1
