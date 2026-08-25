"""Chat per-request context isolation.

Regression guard for the identity leak: the orchestrator used to hold member_id/role
in a module-level dict, so a request suspended at `await agent.ainvoke(...)` would
resume reading whichever caller wrote to it last. That leaked one member's loans and
notifications into another's chat, and let a member's request pass the STAFF_ROLES
gate whenever a staff request was in flight concurrently.

These tests drive the context helpers directly rather than through the LLM — the leak
is in how context is stored, not in what the model does with it, and the tools must
stay reachable without a live LLM backend.
"""

import asyncio

from app.core.constants import Role
from app.modules.chat import orchestrator


async def _set_context_then_read(
    member_id: str, role: str, user_name: str, *, stall: float
) -> tuple[str, str, str]:
    """Mimic run_chat: set context, yield the event loop, then read it back from a tool."""
    orchestrator._ctx.set({"member_id": member_id, "role": role, "user_name": user_name})
    await asyncio.sleep(stall)  # stands in for `await agent.ainvoke(...)`
    return orchestrator._member_id(), orchestrator._role(), orchestrator._user_name()


async def test_concurrent_requests_do_not_share_identity():
    # The interleaving that broke it: the slower request is the one that gets clobbered.
    member, staff = await asyncio.gather(
        _set_context_then_read("alice-id", Role.MEMBER.value, "Alice", stall=0.02),
        _set_context_then_read("bob-id", Role.ADMIN.value, "Bob", stall=0.0),
    )

    assert member == ("alice-id", Role.MEMBER.value, "Alice")
    assert staff == ("bob-id", Role.ADMIN.value, "Bob")


async def test_member_does_not_inherit_staff_role_from_a_concurrent_request():
    """The privilege-escalation half: STAFF_ROLES gates read _role()."""

    async def member_request() -> bool:
        orchestrator._ctx.set({"member_id": "alice-id", "role": Role.MEMBER.value})
        await asyncio.sleep(0.02)
        return orchestrator._role() in orchestrator.STAFF_ROLES

    async def staff_request() -> None:
        orchestrator._ctx.set({"member_id": "bob-id", "role": Role.ADMIN.value})
        await asyncio.sleep(0.0)

    member_sees_staff_tools, _ = await asyncio.gather(member_request(), staff_request())

    assert member_sees_staff_tools is False


async def test_many_concurrent_requests_each_keep_their_own_identity():
    results = await asyncio.gather(
        *(
            _set_context_then_read(
                f"member-{i}",
                Role.MEMBER.value,
                f"Member {i}",
                # Staggered stalls interleave every request against every other.
                stall=(20 - i) * 0.001,
            )
            for i in range(20)
        )
    )

    assert results == [(f"member-{i}", Role.MEMBER.value, f"Member {i}") for i in range(20)]


async def test_context_defaults_are_safe_when_never_set():
    """A tool reached outside run_chat must not inherit anything, least of all a role."""

    async def isolated() -> tuple[str, str]:
        return orchestrator._member_id(), orchestrator._role()

    member_id, role = await asyncio.create_task(isolated())

    assert member_id == ""
    assert role == Role.MEMBER.value
    assert role not in orchestrator.STAFF_ROLES
