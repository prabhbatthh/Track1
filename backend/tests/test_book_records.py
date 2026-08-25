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

TEST_EMAIL_DOMAIN = "@book-records-test.example.com"
TEST_BOOK_TITLE_PREFIX = "Book Records Test Book"


def _unique_email() -> str:
    return f"{uuid.uuid4().hex}{TEST_EMAIL_DOMAIN}"


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    await prisma.connect()
    yield
    domain_filter = {"email": {"endswith": TEST_EMAIL_DOMAIN}}
    await prisma.bookrecord.delete_many(where={"loggedBy": domain_filter})
    await prisma.user.delete_many(where=domain_filter)
    await prisma.book.delete_many(where={"title": {"startswith": TEST_BOOK_TITLE_PREFIX}})
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
        full_name=f"{role_name.title()} User",
        phone=None,
        avatar_url=None,
        role_id=role.id,
    )


async def _login(client: AsyncClient, user) -> str:
    response = await client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": "Password123!"}
    )
    return response.json()["access_token"]


async def test_create_book_record_requires_it_head_role(client):
    """Test Case 1: Create Book Record Requires IT-Head Role"""

    member = await _make_user(Role.MEMBER)
    token = await _login(client, member)
    book = await prisma.book.create(
        data={"title": f"{TEST_BOOK_TITLE_PREFIX} A", "author": "A", "category": "Fiction"}
    )

    response = await client.post(
        "/api/v1/book-records",
        json={"book_id": book.id, "type": "lost"},
        headers={"Authorization": f"Bearer {token}"},
    )

    print("\nCreate Book Record Response:", response.status_code, response.text)

    assert response.status_code == 403


async def test_create_and_list_book_record(client):
    """Test Case 2: Create and List Book Record Success"""

    it_head = await _make_user(Role.IT_HEAD)
    token = await _login(client, it_head)
    book = await prisma.book.create(
        data={"title": f"{TEST_BOOK_TITLE_PREFIX} B", "author": "A", "category": "Fiction"}
    )
    create_response = await client.post(
        "/api/v1/book-records",
        json={"book_id": book.id, "type": "donated", "note": "Donated by a member"},
        headers={"Authorization": f"Bearer {token}"},
    )
    print("\nCreate Book Record Response:", create_response.status_code, create_response.text)
    assert create_response.status_code == 201
    body = create_response.json()
    assert body["type"] == "donated"
    assert body["book_title"] == f"{TEST_BOOK_TITLE_PREFIX} B"
    assert body["note"] == "Donated by a member"
    assert body["logged_by_name"] == it_head.fullName
    list_response = await client.get(
        "/api/v1/book-records", headers={"Authorization": f"Bearer {token}"}
    )
    print("\nList Book Records Response:", list_response.status_code, list_response.text)

    assert list_response.status_code == 200
    assert any(r["id"] == body["id"] for r in list_response.json())


async def test_create_book_record_rejects_unknown_type(client):
    """Test Case 3: Create Book Record Unknown Type"""

    it_head = await _make_user(Role.IT_HEAD)
    token = await _login(client, it_head)
    book = await prisma.book.create(
        data={"title": f"{TEST_BOOK_TITLE_PREFIX} C", "author": "A", "category": "Fiction"}
    )

    response = await client.post(
        "/api/v1/book-records",
        json={"book_id": book.id, "type": "damaged"},
        headers={"Authorization": f"Bearer {token}"},
    )

    print("\nCreate Book Record Response:", response.status_code, response.text)

    assert response.status_code == 422


async def test_create_book_record_rejects_unknown_book(client):
    """Test Case 4: Create Book Record Unknown Book"""

    it_head = await _make_user(Role.IT_HEAD)
    token = await _login(client, it_head)

    response = await client.post(
        "/api/v1/book-records",
        json={"book_id": str(uuid.uuid4()), "type": "lost"},
        headers={"Authorization": f"Bearer {token}"},
    )

    print("\nCreate Book Record Response:", response.status_code, response.text)

    assert response.status_code == 404
