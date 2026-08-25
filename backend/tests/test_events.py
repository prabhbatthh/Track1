import asyncio
import os
import uuid
from datetime import UTC, datetime, timedelta

os.environ["APP_ENV"] = "test"

import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_user, get_optional_user
from app.core.config import get_settings
from app.core.constants import Role
from app.db.prisma import prisma
from app.main import create_app
from app.modules.members import repository as member_repository

os.environ.setdefault("DATABASE_URL", get_settings().database_url)

TEST_EMAIL_DOMAIN = "@events-test.example.com"


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
    domain_filter = {"email": {"endswith": TEST_EMAIL_DOMAIN}}
    await prisma.eventmanagerassignment.delete_many(where={"manager": domain_filter})
    await prisma.eventregistration.delete_many(where={"member": domain_filter})
    await prisma.event.delete_many(where={"creator": domain_filter})
    await prisma.user.delete_many(where=domain_filter)
    await prisma.disconnect()


@pytest_asyncio.fixture
async def manager_user():
    return await _make_user(Role.MANAGER)


@pytest_asyncio.fixture
async def other_manager_user():
    return await _make_user(Role.MANAGER)


@pytest_asyncio.fixture
async def member_user():
    return await _make_user(Role.MEMBER)


@pytest_asyncio.fixture
async def it_head_user():
    return await _make_user(Role.IT_HEAD)


@pytest_asyncio.fixture
async def admin_user():
    return await _make_user(Role.ADMIN)


def _client_as(user) -> AsyncClient:
    app = create_app()
    app.dependency_overrides[get_current_user] = lambda: user
    # list/get endpoints resolve the viewer through get_optional_user, not
    # get_current_user, so it needs its own override for "registered" to reflect them.
    app.dependency_overrides[get_optional_user] = lambda: user
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _anon_client() -> AsyncClient:
    app = create_app()
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _future_date() -> str:
    return (datetime.now(UTC) + timedelta(days=7)).isoformat()


def _past_date() -> str:
    return (datetime.now(UTC) - timedelta(days=7)).isoformat()


async def _age_event_into_the_past(event_id: str) -> None:
    """Move an already-created event's date into the past.

    Events can only be *created* with a future date now, so anything needing a finished
    event has to get there the way real ones do — by being scheduled and then elapsing.
    """
    await prisma.event.update(
        where={"id": event_id}, data={"date": datetime.now(UTC) - timedelta(days=7)}
    )


async def _create_event(manager_user, **overrides) -> dict:
    payload = {
        "title": "Test Event",
        "description": "A test event",
        "location": "Main Hall",
        "date": _future_date(),
        "capacity": 10,
    }
    payload.update(overrides)
    async with _client_as(manager_user) as client:
        response = await client.post("/api/v1/events", json=payload)
    return response.json()


async def test_member_cannot_create_an_event(member_user):
    async with _client_as(member_user) as client:
        response = await client.post(
            "/api/v1/events",
            json={"title": "x", "location": "y", "date": _future_date(), "capacity": 5},
        )
    assert response.status_code == 403


async def test_create_event_with_no_managers_has_empty_assignments(manager_user):
    body = await _create_event(manager_user)

    assert body["assigned_managers"] == []


async def test_create_event_assigns_valid_managers_including_self(manager_user, other_manager_user):
    body = await _create_event(manager_user, manager_ids=[manager_user.id, other_manager_user.id])

    assigned_ids = {m["id"] for m in body["assigned_managers"]}
    assert assigned_ids == {manager_user.id, other_manager_user.id}


async def test_create_event_rejects_member_assignment(manager_user, member_user):
    async with _client_as(manager_user) as client:
        response = await client.post(
            "/api/v1/events",
            json={
                "title": "Invalid assignment",
                "location": "Main Hall",
                "date": _future_date(),
                "capacity": 10,
                "manager_ids": [manager_user.id, member_user.id],
            },
        )

    assert response.status_code == 422


async def test_create_event_rejects_a_nonexistent_manager_id(manager_user):
    async with _client_as(manager_user) as client:
        response = await client.post(
            "/api/v1/events",
            json={
                "title": "Unknown assignment",
                "location": "Main Hall",
                "date": _future_date(),
                "capacity": 10,
                "manager_ids": [manager_user.id, str(uuid.uuid4())],
            },
        )

    assert response.status_code == 422


async def test_update_event_replaces_manager_assignments(manager_user, other_manager_user):
    created = await _create_event(manager_user, manager_ids=[manager_user.id])

    async with _client_as(manager_user) as client:
        response = await client.put(
            f"/api/v1/events/{created['id']}", json={"manager_ids": [other_manager_user.id]}
        )

    assert response.status_code == 200
    assigned_ids = {m["id"] for m in response.json()["assigned_managers"]}
    assert assigned_ids == {other_manager_user.id}


async def test_update_event_with_empty_manager_ids_clears_assignments(manager_user):
    created = await _create_event(manager_user, manager_ids=[manager_user.id])

    async with _client_as(manager_user) as client:
        response = await client.put(f"/api/v1/events/{created['id']}", json={"manager_ids": []})

    assert response.status_code == 200
    assert response.json()["assigned_managers"] == []


async def test_update_event_omitting_manager_ids_leaves_assignments_unchanged(manager_user):
    created = await _create_event(manager_user, manager_ids=[manager_user.id])

    async with _client_as(manager_user) as client:
        response = await client.put(
            f"/api/v1/events/{created['id']}", json={"title": "Renamed Event"}
        )

    assert response.status_code == 200
    assert response.json()["title"] == "Renamed Event"
    assigned_ids = {m["id"] for m in response.json()["assigned_managers"]}
    assert assigned_ids == {manager_user.id}


async def test_member_cannot_update_an_event(manager_user, member_user):
    created = await _create_event(manager_user)

    async with _client_as(member_user) as client:
        response = await client.put(f"/api/v1/events/{created['id']}", json={"title": "Hacked"})

    assert response.status_code == 403


async def test_get_event_includes_assigned_managers(manager_user):
    created = await _create_event(manager_user, manager_ids=[manager_user.id])

    async with _client_as(manager_user) as client:
        response = await client.get(f"/api/v1/events/{created['id']}")

    assert response.status_code == 200
    assigned_ids = {m["id"] for m in response.json()["assigned_managers"]}
    assert assigned_ids == {manager_user.id}


async def test_it_head_can_remove_a_registrant(manager_user, member_user, it_head_user):
    created = await _create_event(manager_user)

    async with _client_as(member_user) as client:
        await client.post(f"/api/v1/events/{created['id']}/register")

    async with _client_as(it_head_user) as client:
        response = await client.delete(
            f"/api/v1/events/{created['id']}/registrants/{member_user.id}"
        )

    assert response.status_code == 200
    registrant_ids = {r["id"] for r in response.json()["registrants"]}
    assert member_user.id not in registrant_ids

    # Persists — a plain re-fetch (not just the mutation response) confirms this
    # wasn't an optimistic-only update that reverts on reload.
    async with _client_as(manager_user) as client:
        refetched = await client.get(f"/api/v1/events/{created['id']}")
    refetched_ids = {r["id"] for r in refetched.json()["registrants"]}
    assert member_user.id not in refetched_ids


async def test_manager_cannot_remove_a_registrant(manager_user, member_user):
    created = await _create_event(manager_user)

    async with _client_as(member_user) as client:
        await client.post(f"/api/v1/events/{created['id']}/register")

    async with _client_as(manager_user) as client:
        response = await client.delete(
            f"/api/v1/events/{created['id']}/registrants/{member_user.id}"
        )

    assert response.status_code == 403


async def test_removing_a_non_registrant_is_404(member_user, it_head_user):
    created = await _create_event(await _make_user(Role.MANAGER))

    async with _client_as(it_head_user) as client:
        response = await client.delete(
            f"/api/v1/events/{created['id']}/registrants/{member_user.id}"
        )

    assert response.status_code == 404


async def test_admin_can_create_an_event(admin_user):
    body = await _create_event(admin_user)

    assert body["title"] == "Test Event"


async def test_admin_can_remove_a_registrant(manager_user, member_user, admin_user):
    created = await _create_event(manager_user)

    async with _client_as(member_user) as client:
        await client.post(f"/api/v1/events/{created['id']}/register")

    async with _client_as(admin_user) as client:
        response = await client.delete(
            f"/api/v1/events/{created['id']}/registrants/{member_user.id}"
        )

    assert response.status_code == 200
    registrant_ids = {r["id"] for r in response.json()["registrants"]}
    assert member_user.id not in registrant_ids


async def test_list_events_is_public(manager_user):
    await _create_event(manager_user)

    async with _anon_client() as client:
        response = await client.get("/api/v1/events")

    assert response.status_code == 200
    body = response.json()
    assert "items" in body and "total" in body
    assert body["total"] >= 1
    assert all(item["registered"] is False for item in body["items"])


async def test_list_events_paginates(manager_user):
    for _ in range(3):
        await _create_event(manager_user)

    async with _client_as(manager_user) as client:
        response = await client.get("/api/v1/events", params={"page": 1, "page_size": 2})

    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == 2
    assert body["total"] >= 3


async def test_get_event_reflects_viewer_registration(manager_user, member_user):
    created = await _create_event(manager_user)

    async with _client_as(member_user) as client:
        await client.post(f"/api/v1/events/{created['id']}/register")
        response = await client.get(f"/api/v1/events/{created['id']}")

    assert response.status_code == 200
    assert response.json()["registered"] is True


async def test_get_event_not_found():
    async with _anon_client() as client:
        response = await client.get(f"/api/v1/events/{uuid.uuid4()}")

    assert response.status_code == 404


async def test_get_event_rejects_malformed_id(manager_user):
    async with _client_as(manager_user) as client:
        response = await client.get("/api/v1/events/not-a-uuid")

    assert response.status_code == 422


async def test_manager_can_delete_an_event(manager_user):
    created = await _create_event(manager_user)

    async with _client_as(manager_user) as client:
        response = await client.delete(f"/api/v1/events/{created['id']}")

    assert response.status_code == 204

    async with _client_as(manager_user) as client:
        refetched = await client.get(f"/api/v1/events/{created['id']}")
    assert refetched.status_code == 404


async def test_member_cannot_delete_an_event(manager_user, member_user):
    created = await _create_event(manager_user)

    async with _client_as(member_user) as client:
        response = await client.delete(f"/api/v1/events/{created['id']}")

    assert response.status_code == 403


async def test_deleting_a_nonexistent_event_is_404(manager_user):
    async with _client_as(manager_user) as client:
        response = await client.delete(f"/api/v1/events/{uuid.uuid4()}")

    assert response.status_code == 404


async def test_deleting_an_already_deleted_event_is_404(manager_user):
    created = await _create_event(manager_user)

    async with _client_as(manager_user) as client:
        await client.delete(f"/api/v1/events/{created['id']}")
        response = await client.delete(f"/api/v1/events/{created['id']}")

    assert response.status_code == 404


async def test_member_can_register_for_an_event(manager_user, member_user):
    created = await _create_event(manager_user)

    async with _client_as(member_user) as client:
        response = await client.post(f"/api/v1/events/{created['id']}/register")

    assert response.status_code == 200
    body = response.json()
    assert body["registered"] is True
    assert body["attendees"] == 1
    assert {r["id"] for r in body["registrants"]} == {member_user.id}


async def test_registering_twice_is_a_conflict(manager_user, member_user):
    created = await _create_event(manager_user)

    async with _client_as(member_user) as client:
        await client.post(f"/api/v1/events/{created['id']}/register")
        response = await client.post(f"/api/v1/events/{created['id']}/register")

    assert response.status_code == 409


async def test_registering_at_capacity_is_a_conflict(manager_user, member_user):
    other_member = await _make_user(Role.MEMBER)
    created = await _create_event(manager_user, capacity=1)

    async with _client_as(member_user) as client:
        await client.post(f"/api/v1/events/{created['id']}/register")

    async with _client_as(other_member) as client:
        response = await client.post(f"/api/v1/events/{created['id']}/register")

    assert response.status_code == 409


async def test_capacity_cannot_shrink_below_registered_count(manager_user, member_user):
    other_member = await _make_user(Role.MEMBER)
    created = await _create_event(manager_user, capacity=3)
    async with _client_as(member_user) as client:
        await client.post(f"/api/v1/events/{created['id']}/register")
    async with _client_as(other_member) as client:
        await client.post(f"/api/v1/events/{created['id']}/register")
    async with _client_as(manager_user) as client:
        response = await client.put(f"/api/v1/events/{created['id']}", json={"capacity": 1})

    assert response.status_code == 409
    saved = await prisma.event.find_unique(where={"id": created["id"]})
    assert saved is not None
    assert saved.capacity == 3


async def test_concurrent_registrations_cannot_overbook(manager_user, member_user):
    other_member = await _make_user(Role.MEMBER)
    created = await _create_event(manager_user, capacity=1)

    async def register(user):
        async with _client_as(user) as client:
            return await client.post(f"/api/v1/events/{created['id']}/register")

    responses = await asyncio.gather(register(member_user), register(other_member))
    assert sorted(response.status_code for response in responses) == [200, 409]

    saved = await prisma.eventregistration.count(where={"eventId": created["id"]})
    assert saved == 1


async def test_registering_for_a_nonexistent_event_is_404(member_user):
    async with _client_as(member_user) as client:
        response = await client.post(f"/api/v1/events/{uuid.uuid4()}/register")

    assert response.status_code == 404


async def test_registering_for_a_deleted_event_is_404(manager_user, member_user):
    created = await _create_event(manager_user)

    async with _client_as(manager_user) as client:
        await client.delete(f"/api/v1/events/{created['id']}")

    async with _client_as(member_user) as client:
        response = await client.post(f"/api/v1/events/{created['id']}/register")

    assert response.status_code == 404


async def test_member_can_unregister_from_an_event(manager_user, member_user):
    created = await _create_event(manager_user)

    async with _client_as(member_user) as client:
        await client.post(f"/api/v1/events/{created['id']}/register")
        response = await client.delete(f"/api/v1/events/{created['id']}/register")

    assert response.status_code == 200
    body = response.json()
    assert body["registered"] is False
    assert body["attendees"] == 0


async def test_unregistering_when_not_registered_is_404(manager_user, member_user):
    created = await _create_event(manager_user)

    async with _client_as(member_user) as client:
        response = await client.delete(f"/api/v1/events/{created['id']}/register")

    assert response.status_code == 404


async def test_unregistering_from_a_nonexistent_event_is_404(member_user):
    async with _client_as(member_user) as client:
        response = await client.delete(f"/api/v1/events/{uuid.uuid4()}/register")

    assert response.status_code == 404


async def test_attendance_summary_reflects_new_registrations(manager_user, member_user):
    async with _client_as(manager_user) as client:
        baseline = await client.get("/api/v1/events/summary")

    created = await _create_event(manager_user)
    async with _client_as(member_user) as client:
        await client.post(f"/api/v1/events/{created['id']}/register")
        response = await client.get("/api/v1/events/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["total_attendees"] == baseline.json()["total_attendees"] + 1
    assert body["total_events_this_month"] >= baseline.json()["total_events_this_month"]
    assert body["average_attendance_rate"] >= 0.0


async def test_manager_cannot_view_event_analytics(manager_user):
    created = await _create_event(manager_user)

    async with _client_as(manager_user) as client:
        response = await client.get(f"/api/v1/events/{created['id']}/analytics")

    assert response.status_code == 403


async def test_analytics_for_an_upcoming_event_is_400(manager_user, admin_user):
    created = await _create_event(manager_user)

    async with _client_as(admin_user) as client:
        response = await client.get(f"/api/v1/events/{created['id']}/analytics")

    assert response.status_code == 400


async def test_analytics_for_a_nonexistent_event_is_404(admin_user):
    async with _client_as(admin_user) as client:
        response = await client.get(f"/api/v1/events/{uuid.uuid4()}/analytics")

    assert response.status_code == 404


async def test_admin_can_view_analytics_for_a_past_event(manager_user, member_user, admin_user):
    created = await _create_event(manager_user)

    async with _client_as(member_user) as client:
        await client.post(f"/api/v1/events/{created['id']}/register")

    await _age_event_into_the_past(created["id"])

    async with _client_as(admin_user) as client:
        response = await client.get(f"/api/v1/events/{created['id']}/analytics")

    assert response.status_code == 200
    body = response.json()
    assert body["total_registered"] == 1
    assert body["fill_rate"] == 0.1
    assert body["registrants"][0]["id"] == member_user.id
    assert body["registrants"][0]["role"] == "member"
    role_counts = {r["role"]: r["count"] for r in body["registrants_by_role"]}
    assert role_counts == {"member": 1}


async def test_event_cannot_be_created_with_a_past_date(manager_user):
    """A past date is always a typo, and it also pins the record to the top of the list."""
    async with _client_as(manager_user) as client:
        response = await client.post(
            "/api/v1/events",
            json={"title": "Backdated", "location": "Hall", "date": _past_date(), "capacity": 5},
        )

    assert response.status_code == 422


async def test_a_finished_event_can_still_be_edited(manager_user):
    """Creation rejects past dates; updates must not.

    Events become past ones by elapsing, and the edit form resends every field
    including `date` — enforcing the future-date rule on update would make a
    finished event impossible to correct, and would break the dashboard contract
    that checks an event drops off once its date passes.
    """
    created = await _create_event(manager_user)
    await _age_event_into_the_past(created["id"])

    async with _client_as(manager_user) as client:
        response = await client.put(
            f"/api/v1/events/{created['id']}",
            json={"title": "Corrected title", "date": _past_date()},
        )

    assert response.status_code == 200
    assert response.json()["title"] == "Corrected title"


async def test_upcoming_timeframe_excludes_events_that_have_already_happened(
    manager_user, member_user
):
    """The list is ordered by date ascending across every event, so without a
    server-side filter the first page is the *oldest* events and 'upcoming' was empty."""
    finished = await _create_event(manager_user, title="Finished Event")
    upcoming = await _create_event(manager_user, title="Upcoming Event")
    await _age_event_into_the_past(finished["id"])

    async with _client_as(member_user) as client:
        response = await client.get("/api/v1/events?timeframe=upcoming&page_size=100")

    assert response.status_code == 200
    ids = [item["id"] for item in response.json()["items"]]
    assert upcoming["id"] in ids
    assert finished["id"] not in ids


async def test_past_timeframe_returns_only_finished_events(manager_user, member_user):
    finished = await _create_event(manager_user, title="Finished Event")
    upcoming = await _create_event(manager_user, title="Upcoming Event")
    await _age_event_into_the_past(finished["id"])

    async with _client_as(member_user) as client:
        response = await client.get("/api/v1/events?timeframe=past&page_size=100")

    ids = [item["id"] for item in response.json()["items"]]
    assert finished["id"] in ids
    assert upcoming["id"] not in ids


async def test_default_timeframe_still_returns_everything(manager_user, member_user):
    finished = await _create_event(manager_user, title="Finished Event")
    upcoming = await _create_event(manager_user, title="Upcoming Event")
    await _age_event_into_the_past(finished["id"])

    async with _client_as(member_user) as client:
        response = await client.get("/api/v1/events?page_size=100")

    ids = [item["id"] for item in response.json()["items"]]
    assert finished["id"] in ids
    assert upcoming["id"] in ids
