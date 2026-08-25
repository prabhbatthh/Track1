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

TEST_EMAIL_DOMAIN = "@wishlist-test.example.com"
TEST_TITLE_MARKER = "WISHLIST-TEST-"


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
    domain_filter = {"email": {"endswith": TEST_EMAIL_DOMAIN}}
    await prisma.wishlist.delete_many(where={"member": domain_filter})
    await prisma.book.delete_many(where={"title": {"startswith": TEST_TITLE_MARKER}})
    await prisma.user.delete_many(where=domain_filter)
    await prisma.disconnect()


@pytest_asyncio.fixture
async def member_user():
    return await _make_user(Role.MEMBER)


def _client_as(user) -> AsyncClient:
    from app.api.deps import get_current_user

    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _create_book() -> str:
    book = await prisma.book.create(
        data={
            "title": f"{TEST_TITLE_MARKER}{uuid.uuid4().hex}",
            "author": "Test Author",
            "category": "Fiction",
        }
    )
    return book.id


async def test_wishlist_requires_authentication():
    async with AsyncClient(
        transport=ASGITransport(app=create_app()), base_url="http://test"
    ) as client:
        response = await client.get("/api/v1/wishlist")
    assert response.status_code == 401


async def test_new_member_has_an_empty_wishlist(member_user):
    async with _client_as(member_user) as client:
        response = await client.get("/api/v1/wishlist")

    assert response.status_code == 200
    assert response.json() == []


async def test_add_then_list_shows_the_book(member_user):
    book_id = await _create_book()

    async with _client_as(member_user) as client:
        add_response = await client.post(f"/api/v1/wishlist/{book_id}")
        list_response = await client.get("/api/v1/wishlist")

    assert add_response.status_code == 204
    assert book_id in list_response.json()


async def test_adding_the_same_book_twice_does_not_duplicate(member_user):
    book_id = await _create_book()

    async with _client_as(member_user) as client:
        await client.post(f"/api/v1/wishlist/{book_id}")
        await client.post(f"/api/v1/wishlist/{book_id}")
        list_response = await client.get("/api/v1/wishlist")

    assert list_response.json().count(book_id) == 1


async def test_remove_takes_the_book_off_the_list(member_user):
    book_id = await _create_book()

    async with _client_as(member_user) as client:
        await client.post(f"/api/v1/wishlist/{book_id}")
        remove_response = await client.delete(f"/api/v1/wishlist/{book_id}")
        list_response = await client.get("/api/v1/wishlist")

    assert remove_response.status_code == 204
    assert book_id not in list_response.json()


async def test_removing_a_book_never_wishlisted_is_a_harmless_no_op(member_user):
    book_id = await _create_book()

    async with _client_as(member_user) as client:
        response = await client.delete(f"/api/v1/wishlist/{book_id}")

    assert response.status_code == 204


async def test_adding_a_nonexistent_book_returns_404(member_user):
    async with _client_as(member_user) as client:
        response = await client.post(f"/api/v1/wishlist/{uuid.uuid4()}")

    assert response.status_code == 404


async def test_two_members_have_independent_wishlists(member_user):
    other_member = await _make_user(Role.MEMBER)
    book_id = await _create_book()

    async with _client_as(member_user) as client:
        await client.post(f"/api/v1/wishlist/{book_id}")

    async with _client_as(other_member) as client:
        other_list = await client.get("/api/v1/wishlist")

    assert book_id not in other_list.json()
