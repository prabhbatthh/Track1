from datetime import UTC, datetime, timedelta
import os
from uuid import uuid4
import pytest
import pytest_asyncio

os.environ["APP_ENV"] = "test"

from app.core.config import get_settings
from app.core.constants import Role
from app.db.prisma import prisma
from app.modules.guardian_autopay.trust_scoring import calculate_trust_tier

os.environ.setdefault("DATABASE_URL", get_settings().database_url)


@pytest_asyncio.fixture(scope="module", autouse=True)
async def _db_connection():
    """Ensure Prisma database is connected during test module."""
    if not prisma.is_connected():
        await prisma.connect()
    yield
    if prisma.is_connected():
        await prisma.disconnect()


async def create_test_child():
    member_role = await prisma.role.find_first(where={"name": Role.MEMBER})
    uid = uuid4().hex[:8]
    return await prisma.user.create(
        data={
            "email": f"trust_child_{uid}@example.com",
            "fullName": f"Trust Child {uid}",
            "passwordHash": "hashed",
            "roleId": member_role.id,
            "isActive": True,
        }
    )


async def get_test_book():
    book = await prisma.book.find_first()
    if not book:
        book = await prisma.book.create(
            data={"title": "Trust Scoring Demo Book", "author": "Demo Author", "category": "Fiction"}
        )
    return book


@pytest.mark.asyncio
async def test_trust_scoring_100_percent_on_time():
    child = await create_test_child()
    book = await get_test_book()
    now = datetime.now(UTC)

    # 5 on-time returned loans
    for i in range(5):
        due = now - timedelta(days=10 - i)
        returned = due - timedelta(days=1)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": child.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    res = await calculate_trust_tier(child.id)
    assert res.tier == "HIGH"
    assert res.multiplier == 1.2
    assert res.on_time_rate == 1.0
    assert res.on_time_returns == 5
    assert res.total_returns == 5
    assert res.sample_size == 5


@pytest.mark.asyncio
async def test_trust_scoring_exactly_90_percent_boundary():
    child = await create_test_child()
    book = await get_test_book()
    now = datetime.now(UTC)

    # 9 on-time returned loans, 1 late returned loan (total 10 returned) -> 90%
    for i in range(9):
        due = now - timedelta(days=20 - i)
        returned = due - timedelta(days=1)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": child.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    # 1 late return
    due_late = now - timedelta(days=5)
    returned_late = due_late + timedelta(days=2)
    await prisma.loan.create(
        data={
            "memberId": child.id,
            "bookId": book.id,
            "createdById": child.id,
            "dueDate": due_late,
            "returnedAt": returned_late,
            "finePaid": True,
        }
    )

    res = await calculate_trust_tier(child.id)
    assert res.tier == "HIGH"
    assert res.multiplier == 1.2
    assert res.on_time_rate == 0.90
    assert res.on_time_returns == 9
    assert res.total_returns == 10


@pytest.mark.asyncio
async def test_trust_scoring_80_percent():
    child = await create_test_child()
    book = await get_test_book()
    now = datetime.now(UTC)

    # 8 on-time, 2 late -> 80% (BASELINE / 1.0)
    for i in range(8):
        due = now - timedelta(days=20 - i)
        returned = due - timedelta(days=1)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": child.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    for i in range(2):
        due = now - timedelta(days=10 - i)
        returned = due + timedelta(days=2)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": child.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    res = await calculate_trust_tier(child.id)
    assert res.tier == "BASELINE"
    assert res.multiplier == 1.0
    assert res.on_time_rate == 0.80
    assert res.on_time_returns == 8
    assert res.total_returns == 10


@pytest.mark.asyncio
async def test_trust_scoring_exactly_70_percent_boundary():
    child = await create_test_child()
    book = await get_test_book()
    now = datetime.now(UTC)

    # 7 on-time, 3 late -> 70% (BASELINE / 1.0)
    for i in range(7):
        due = now - timedelta(days=20 - i)
        returned = due - timedelta(days=1)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": child.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    for i in range(3):
        due = now - timedelta(days=10 - i)
        returned = due + timedelta(days=2)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": child.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    res = await calculate_trust_tier(child.id)
    assert res.tier == "BASELINE"
    assert res.multiplier == 1.0
    assert res.on_time_rate == 0.70
    assert res.on_time_returns == 7
    assert res.total_returns == 10


@pytest.mark.asyncio
async def test_trust_scoring_69_percent_low_boundary():
    child = await create_test_child()
    book = await get_test_book()
    now = datetime.now(UTC)

    # 6 on-time out of 9 returned (6 / 9 = 0.6667 < 0.70 -> LOW)
    for i in range(6):
        due = now - timedelta(days=20 - i)
        returned = due - timedelta(days=1)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": child.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    for i in range(3):
        due = now - timedelta(days=10 - i)
        returned = due + timedelta(days=2)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": child.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    res = await calculate_trust_tier(child.id)
    assert res.tier == "LOW"
    assert res.multiplier == 0.7
    assert res.on_time_rate < 0.70


@pytest.mark.asyncio
async def test_trust_scoring_50_percent():
    child = await create_test_child()
    book = await get_test_book()
    now = datetime.now(UTC)

    # 5 on-time, 5 late -> 50% (LOW / 0.7)
    for i in range(5):
        due = now - timedelta(days=20 - i)
        returned = due - timedelta(days=1)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": child.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    for i in range(5):
        due = now - timedelta(days=10 - i)
        returned = due + timedelta(days=2)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": child.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    res = await calculate_trust_tier(child.id)
    assert res.tier == "LOW"
    assert res.multiplier == 0.7
    assert res.on_time_rate == 0.50
    assert res.on_time_returns == 5
    assert res.total_returns == 10


@pytest.mark.asyncio
async def test_trust_scoring_no_returned_loans():
    child = await create_test_child()

    res = await calculate_trust_tier(child.id)
    assert res.tier == "BASELINE"
    assert res.multiplier == 1.0
    assert res.on_time_rate == 0.0
    assert res.on_time_returns == 0
    assert res.total_returns == 0
    assert res.sample_size == 0


@pytest.mark.asyncio
async def test_trust_scoring_fewer_than_15_returned_loans():
    child = await create_test_child()
    book = await get_test_book()
    now = datetime.now(UTC)

    # Create 4 returned loans
    for i in range(4):
        due = now - timedelta(days=10 - i)
        returned = due - timedelta(days=1)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": child.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    res = await calculate_trust_tier(child.id)
    assert res.total_returns == 4
    assert res.sample_size == 4
    assert res.on_time_returns == 4
    assert res.tier == "HIGH"


@pytest.mark.asyncio
async def test_trust_scoring_more_than_15_returned_loans():
    child = await create_test_child()
    book = await get_test_book()
    now = datetime.now(UTC)

    # Create 5 oldest returned loans that were LATE
    for i in range(5):
        due = now - timedelta(days=100 - i)
        returned = due + timedelta(days=5)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": child.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    # Create 15 newest returned loans that were ON-TIME
    for i in range(15):
        due = now - timedelta(days=30 - i)
        returned = due - timedelta(days=1)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": child.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    # Total 20 returned loans, but only latest 15 should be evaluated
    res = await calculate_trust_tier(child.id)
    assert res.total_returns == 15
    assert res.sample_size == 15
    assert res.on_time_returns == 15
    assert res.on_time_rate == 1.0
    assert res.tier == "HIGH"


@pytest.mark.asyncio
async def test_trust_scoring_active_unreturned_loans_ignored():
    child = await create_test_child()
    book = await get_test_book()
    now = datetime.now(UTC)

    # 3 returned loans (2 on-time, 1 late)
    for i in range(2):
        due = now - timedelta(days=20 - i)
        returned = due - timedelta(days=1)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": child.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    due_late = now - timedelta(days=10)
    returned_late = due_late + timedelta(days=2)
    await prisma.loan.create(
        data={
            "memberId": child.id,
            "bookId": book.id,
            "createdById": child.id,
            "dueDate": due_late,
            "returnedAt": returned_late,
            "finePaid": True,
        }
    )

    # 5 active/unreturned loans (returnedAt is None)
    for i in range(5):
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": child.id,
                "dueDate": now - timedelta(days=5 - i),
                "returnedAt": None,
                "finePaid": False,
            }
        )

    res = await calculate_trust_tier(child.id)
    # Active loans must be ignored! Only 3 returned loans considered
    assert res.total_returns == 3
    assert res.sample_size == 3
    assert res.on_time_returns == 2
    assert round(res.on_time_rate, 2) == 0.67
    assert res.tier == "LOW"


@pytest.mark.asyncio
async def test_trust_scoring_mixed_history_exact_rate():
    child = await create_test_child()
    book = await get_test_book()
    now = datetime.now(UTC)

    # 3 on-time, 1 late -> 75%
    for i in range(3):
        due = now - timedelta(days=20 - i)
        returned = due - timedelta(days=1)
        await prisma.loan.create(
            data={
                "memberId": child.id,
                "bookId": book.id,
                "createdById": child.id,
                "dueDate": due,
                "returnedAt": returned,
                "finePaid": True,
            }
        )

    due_late = now - timedelta(days=5)
    returned_late = due_late + timedelta(days=3)
    await prisma.loan.create(
        data={
            "memberId": child.id,
            "bookId": book.id,
            "createdById": child.id,
            "dueDate": due_late,
            "returnedAt": returned_late,
            "finePaid": True,
        }
    )

    res = await calculate_trust_tier(child.id)
    assert res.total_returns == 4
    assert res.on_time_returns == 3
    assert res.on_time_rate == 0.75
    assert res.tier == "BASELINE"
    assert res.multiplier == 1.0
