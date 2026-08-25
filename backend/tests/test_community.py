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

TEST_EMAIL_DOMAIN = "@community-test.example.com"


def _unique_email() -> str:
    return f"{uuid.uuid4().hex}{TEST_EMAIL_DOMAIN}"


async def _make_user(role_name: str):
    role = await member_repository.upsert_role(role_name)
    return await member_repository.create_member(
        email=_unique_email(),
        password_hash=None,
        full_name=f"Test {role_name.title()} {uuid.uuid4().hex[:6]}",
        phone=None,
        avatar_url=None,
        role_id=role.id,
    )


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    await prisma.connect()
    yield
    await prisma.communityban.delete_many(
        where={"user": {"email": {"endswith": TEST_EMAIL_DOMAIN}}}
    )
    await prisma.communitycomment.delete_many(
        where={"author": {"email": {"endswith": TEST_EMAIL_DOMAIN}}}
    )
    await prisma.communitypostlike.delete_many(
        where={"user": {"email": {"endswith": TEST_EMAIL_DOMAIN}}}
    )
    await prisma.communitypostsave.delete_many(
        where={"user": {"email": {"endswith": TEST_EMAIL_DOMAIN}}}
    )
    await prisma.communitypost.delete_many(
        where={"author": {"email": {"endswith": TEST_EMAIL_DOMAIN}}}
    )
    # Audit entries reference the actor with no cascade, so they have to go
    # before the users do (role changes, bans and fine settlement all log now).
    await prisma.auditlogentry.delete_many(
        where={"actor": {"email": {"endswith": TEST_EMAIL_DOMAIN}}}
    )
    await prisma.user.delete_many(where={"email": {"endswith": TEST_EMAIL_DOMAIN}})
    await prisma.disconnect()


@pytest_asyncio.fixture
async def member_user():
    return await _make_user(Role.MEMBER)


@pytest_asyncio.fixture
async def other_member_user():
    return await _make_user(Role.MEMBER)


@pytest_asyncio.fixture
async def manager_user():
    return await _make_user(Role.MANAGER)


@pytest_asyncio.fixture
async def admin_user():
    return await _make_user(Role.ADMIN)


@pytest_asyncio.fixture
async def it_head_user():
    return await _make_user(Role.IT_HEAD)


def _client_as(user) -> AsyncClient:
    from app.api.deps import get_current_user

    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _create_post(user, **overrides) -> dict:
    payload = {"content": "Hello community", "book_title": None, "images": []}
    payload.update(overrides)
    async with _client_as(user) as client:
        response = await client.post("/api/v1/community/posts", json=payload)
    return response.json()


async def test_create_post_requires_authentication():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/api/v1/community/posts", json={"content": "hi"})
    assert response.status_code == 401


async def test_member_can_create_post(member_user):
    async with _client_as(member_user) as client:
        response = await client.post(
            "/api/v1/community/posts",
            json={"content": "My first post", "book_title": "Sapiens", "images": []},
        )
    assert response.status_code == 201
    body = response.json()
    assert body["content"] == "My first post"
    assert body["book_title"] == "Sapiens"
    assert body["is_own"] is True
    assert body["like_count"] == 0
    assert body["comments"] == []


async def test_staff_cannot_create_post(manager_user):
    async with _client_as(manager_user) as client:
        response = await client.post(
            "/api/v1/community/posts", json={"content": "should fail", "images": []}
        )
    assert response.status_code == 403


# ═══════════════════════════════════════════════════════════════════════════
# Auto-moderation — a post/comment matching the shared harmful-content pattern
# (chat/guardrails.py::contains_harmful_content) is flagged the moment it's created,
# using the identical `reported` field a member report would set.
# ═══════════════════════════════════════════════════════════════════════════


async def test_post_with_harmful_content_is_auto_flagged(member_user):
    async with _client_as(member_user) as client:
        response = await client.post(
            "/api/v1/community/posts",
            json={"content": "This book has a scene about weapon trafficking.", "images": []},
        )
    assert response.status_code == 201
    body = response.json()
    assert body["reported"] is True
    # Nothing is hidden or blocked — the author sees their own post normally.
    assert body["is_own"] is True


async def test_ordinary_post_is_not_flagged(member_user):
    async with _client_as(member_user) as client:
        response = await client.post(
            "/api/v1/community/posts",
            json={"content": "I really enjoyed this book's pacing.", "images": []},
        )
    assert response.status_code == 201
    assert response.json()["reported"] is False


async def test_flagged_post_notifies_moderators(member_user, admin_user):
    async with _client_as(member_user) as client:
        response = await client.post(
            "/api/v1/community/posts",
            json={"content": "There's a bomb threat subplot in this thriller.", "images": []},
        )
    assert response.status_code == 201

    notifications = await prisma.notification.find_many(where={"userId": admin_user.id})
    assert any(
        n.type == "reported-comment" and "automatically flagged" in n.message for n in notifications
    )


async def test_comment_with_harmful_content_is_auto_flagged(member_user):
    post = await _create_post(member_user)
    async with _client_as(member_user) as client:
        response = await client.post(
            f"/api/v1/community/posts/{post['id']}/comments",
            json={"content": "This reminded me of a self-harm storyline."},
        )
    assert response.status_code == 201
    comment = response.json()["comments"][-1]
    assert comment["reported"] is True


async def test_list_posts_shows_new_post(member_user):
    post = await _create_post(member_user, content="Findable post")
    async with _client_as(member_user) as client:
        response = await client.get("/api/v1/community/posts")
    ids = [p["id"] for p in response.json()["items"]]
    assert post["id"] in ids


async def test_edit_post_only_by_author(member_user, other_member_user):
    post = await _create_post(member_user)

    async with _client_as(other_member_user) as client:
        forbidden = await client.put(
            f"/api/v1/community/posts/{post['id']}",
            json={"content": "hijacked", "images": []},
        )
    assert forbidden.status_code == 403

    async with _client_as(member_user) as client:
        response = await client.put(
            f"/api/v1/community/posts/{post['id']}",
            json={"content": "edited content", "images": []},
        )
    assert response.status_code == 200
    assert response.json()["content"] == "edited content"


async def test_delete_post_by_moderator(member_user, admin_user):
    post = await _create_post(member_user)
    async with _client_as(admin_user) as client:
        response = await client.delete(f"/api/v1/community/posts/{post['id']}")
    assert response.status_code == 204

    async with _client_as(member_user) as client:
        listed = await client.get("/api/v1/community/posts")
    assert all(p["id"] != post["id"] for p in listed.json()["items"])


async def test_delete_post_by_non_owner_non_moderator_forbidden(member_user, other_member_user):
    post = await _create_post(member_user)
    async with _client_as(other_member_user) as client:
        response = await client.delete(f"/api/v1/community/posts/{post['id']}")
    assert response.status_code == 403


async def test_toggle_like(member_user):
    post = await _create_post(member_user)
    async with _client_as(member_user) as client:
        liked = await client.post(f"/api/v1/community/posts/{post['id']}/like")
        assert liked.json()["is_liked"] is True
        assert liked.json()["like_count"] == 1

        unliked = await client.post(f"/api/v1/community/posts/{post['id']}/like")
        assert unliked.json()["is_liked"] is False
        assert unliked.json()["like_count"] == 0


async def test_toggle_save(member_user):
    post = await _create_post(member_user)
    async with _client_as(member_user) as client:
        saved = await client.post(f"/api/v1/community/posts/{post['id']}/save")
        assert saved.json()["is_saved"] is True

        unsaved = await client.post(f"/api/v1/community/posts/{post['id']}/save")
        assert unsaved.json()["is_saved"] is False


async def test_add_comment_and_reply(member_user, other_member_user):
    post = await _create_post(member_user)

    async with _client_as(other_member_user) as client:
        commented = await client.post(
            f"/api/v1/community/posts/{post['id']}/comments", json={"content": "Nice post!"}
        )
    assert commented.status_code == 201
    comment = commented.json()["comments"][0]
    assert comment["content"] == "Nice post!"
    assert comment["author_id"] == other_member_user.id

    async with _client_as(member_user) as client:
        replied = await client.post(
            f"/api/v1/community/posts/{post['id']}/comments",
            json={"content": "Thanks!", "parent_id": comment["id"]},
        )
    assert replied.status_code == 201
    updated_comment = replied.json()["comments"][0]
    assert len(updated_comment["replies"]) == 1
    assert updated_comment["replies"][0]["content"] == "Thanks!"


async def test_report_post_by_member_not_own(member_user, other_member_user):
    post = await _create_post(member_user)

    async with _client_as(member_user) as client:
        own_report = await client.post(f"/api/v1/community/posts/{post['id']}/report")
    assert own_report.status_code == 400

    async with _client_as(other_member_user) as client:
        response = await client.post(f"/api/v1/community/posts/{post['id']}/report")
    assert response.status_code == 200
    assert response.json()["reported"] is True
    assert response.json()["reported_by_me"] is True


async def test_report_comment_by_member_not_own(member_user, other_member_user):
    post = await _create_post(member_user)
    async with _client_as(member_user) as client:
        commented = await client.post(
            f"/api/v1/community/posts/{post['id']}/comments", json={"content": "Nice post"}
        )
    comment_id = commented.json()["comments"][0]["id"]

    async with _client_as(member_user) as client:
        own_report = await client.post(f"/api/v1/community/comments/{comment_id}/report")
    assert own_report.status_code == 400

    async with _client_as(other_member_user) as client:
        response = await client.post(f"/api/v1/community/comments/{comment_id}/report")
    assert response.status_code == 204


async def test_report_post_forbidden_for_staff(member_user, admin_user):
    post = await _create_post(member_user)
    async with _client_as(admin_user) as client:
        response = await client.post(f"/api/v1/community/posts/{post['id']}/report")
    assert response.status_code == 403


async def test_delete_comment_requires_staff(member_user, other_member_user):
    post = await _create_post(member_user)
    async with _client_as(other_member_user) as client:
        commented = await client.post(
            f"/api/v1/community/posts/{post['id']}/comments", json={"content": "spam"}
        )
    comment_id = commented.json()["comments"][0]["id"]

    async with _client_as(other_member_user) as client:
        forbidden = await client.delete(f"/api/v1/community/comments/{comment_id}")
    assert forbidden.status_code == 403

    async with _client_as(member_user) as client:
        forbidden2 = await client.delete(f"/api/v1/community/comments/{comment_id}")
    assert forbidden2.status_code == 403


async def test_delete_comment_by_it_head(member_user, other_member_user, it_head_user):
    post = await _create_post(member_user)
    async with _client_as(other_member_user) as client:
        commented = await client.post(
            f"/api/v1/community/posts/{post['id']}/comments", json={"content": "spam"}
        )
    comment_id = commented.json()["comments"][0]["id"]

    async with _client_as(it_head_user) as client:
        response = await client.delete(f"/api/v1/community/comments/{comment_id}")
    assert response.status_code == 204


async def test_ban_forbidden_for_non_moderator(member_user, manager_user):
    async with _client_as(manager_user) as client:
        response = await client.post(f"/api/v1/community/banned-authors/{member_user.id}")
    assert response.status_code == 403


async def test_ban_and_unban_author(member_user, admin_user):
    async with _client_as(admin_user) as client:
        banned = await client.post(f"/api/v1/community/banned-authors/{member_user.id}")
    assert banned.status_code == 204

    async with _client_as(member_user) as client:
        blocked = await client.post(
            "/api/v1/community/posts",
            json={"content": "trying to post while banned", "images": []},
        )
    assert blocked.status_code == 403

    async with _client_as(admin_user) as client:
        listed = await client.get("/api/v1/community/banned-authors")
    assert any(b["user_id"] == member_user.id for b in listed.json())

    async with _client_as(admin_user) as client:
        unban = await client.delete(f"/api/v1/community/banned-authors/{member_user.id}")
    assert unban.status_code == 204

    async with _client_as(member_user) as client:
        allowed = await client.post(
            "/api/v1/community/posts", json={"content": "posting again", "images": []}
        )
    assert allowed.status_code == 201


async def test_banned_author_cannot_edit_an_existing_post(member_user, admin_user):
    """A ban that only blocks new posts is bypassable: edit an old post instead."""
    post = await _create_post(member_user, content="original content")

    async with _client_as(admin_user) as client:
        await client.post(f"/api/v1/community/banned-authors/{member_user.id}")

    async with _client_as(member_user) as client:
        response = await client.put(
            f"/api/v1/community/posts/{post['id']}",
            json={"content": "the content they were banned for", "images": []},
        )

    assert response.status_code == 403

    # And the original content is untouched.
    async with _client_as(admin_user) as client:
        listed = await client.get("/api/v1/community/posts?page_size=100")
    stored = next(item for item in listed.json()["items"] if item["id"] == post["id"])
    assert stored["content"] == "original content"


async def test_banned_author_cannot_report_posts(member_user, other_member_user, admin_user):
    """Reporting notifies every moderator — a banned user keeps no channel to them."""
    post = await _create_post(other_member_user)

    async with _client_as(admin_user) as client:
        await client.post(f"/api/v1/community/banned-authors/{member_user.id}")

    async with _client_as(member_user) as client:
        response = await client.post(f"/api/v1/community/posts/{post['id']}/report")

    assert response.status_code == 403
