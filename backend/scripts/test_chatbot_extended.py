"""
Extended chatbot test script — additional prompts for member, it_head, and manager roles.
Saves results to chat_test_results_extended.json.

Usage:
    cd backend
    uv run python scripts/test_chatbot_extended.py
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import httpx

BASE_URL = "http://localhost:8000"
API = "/api/v1"

TESTS: list[dict] = [
    # ══════════════════════════════════════════════════════════════════════════
    # MEMBER — additional single-turn prompts
    # ══════════════════════════════════════════════════════════════════════════
    # How-to / chip prompts (missing from original suite)
    {
        "id": "member_how_to_reserve",
        "tool": "get_books",
        "role": "member",
        "prompt": "How do I reserve a book?",
    },
    {
        "id": "member_how_to_book_seat",
        "tool": "get_seat_availability",
        "role": "member",
        "prompt": "How do I book a seat?",
    },
    # Natural language variants
    {
        "id": "member_books_fiction",
        "tool": "get_books",
        "role": "member",
        "prompt": "Show me fiction books",
    },
    {
        "id": "member_books_by_category",
        "tool": "get_books",
        "role": "member",
        "prompt": "Do you have any non-fiction books?",
    },
    {
        "id": "member_events_register_question",
        "tool": "get_upcoming_events",
        "role": "member",
        "prompt": "Are there any book club events I can join?",
    },
    {
        "id": "member_seat_book_specific",
        "tool": "book_seat",
        "role": "member",
        "prompt": "Book seat A3 for tomorrow at 11am",
    },
    {
        "id": "member_notifications_check",
        "tool": "get_my_notifications",
        "role": "member",
        "prompt": "Any new notifications for me?",
    },
    {
        "id": "member_pricing_cheapest",
        "tool": "get_pricing_plans",
        "role": "member",
        "prompt": "What is the cheapest membership plan?",
    },
    {
        "id": "member_leaderboard_my_rank",
        "tool": "get_leaderboard",
        "role": "member",
        "prompt": "Where do I stand on the leaderboard?",
    },
    {
        "id": "member_streak_motivation",
        "tool": "get_my_reading_streak",
        "role": "member",
        "prompt": "How long is my reading streak?",
    },
    {
        "id": "member_support_ticket_payment",
        "tool": "raise_support_ticket",
        "role": "member",
        "prompt": "I was charged twice for my membership, please raise a ticket",
    },
    {
        "id": "member_guardrail_pii_input",
        "tool": "guardrail",
        "role": "member",
        "prompt": "My phone number is 9876543210, can you help me reset my password?",
    },
    {
        "id": "member_off_topic_weather",
        "tool": "guardrail",
        "role": "member",
        "prompt": "What is the weather like in Mumbai today?",
    },
    # ── MEMBER multi-turn ─────────────────────────────────────────────────────
    {
        "id": "member_multi_how_to_reserve_then_do_it",
        "tool": "get_books → reserve_book",
        "role": "member",
        "turns": [
            "How do I reserve a book?",
            "Reserve The Namesake for me",
        ],
    },
    {
        "id": "member_multi_how_to_seat_then_book",
        "tool": "get_seat_availability → book_seat",
        "role": "member",
        "turns": [
            "How do I book a seat?",
            "Book me any seat for tomorrow at 4pm",
        ],
    },
    {
        "id": "member_multi_events_then_ask_capacity",
        "tool": "get_upcoming_events → context",
        "role": "member",
        "turns": [
            "What events are coming up?",
            "Which one has the most spots left?",
            "Register me for that one",
        ],
    },
    {
        "id": "member_multi_notifications_then_reservations",
        "tool": "get_my_notifications → get_my_reservations",
        "role": "member",
        "turns": [
            "Do I have any notifications?",
            "Show me my current reservations",
            "Cancel the first one",
        ],
    },
    {
        "id": "member_multi_streak_then_goal_then_leaderboard",
        "tool": "get_my_reading_streak → get_my_reading_goal → get_leaderboard",
        "role": "member",
        "turns": [
            "What is my reading streak?",
            "Do I have a reading goal set?",
            "Show me the leaderboard — am I on it?",
        ],
    },
    # ══════════════════════════════════════════════════════════════════════════
    # IT HEAD — single-turn prompts
    # it_head has LOAN_MANAGER_ROLES access: active loans, fines, return loan,
    # send reminder. Does NOT have get_all_support_tickets (admin/manager/it_head only —
    # actually it_head IS in that set). Also has get_members.
    # ══════════════════════════════════════════════════════════════════════════
    {
        "id": "ithead_get_members",
        "tool": "get_members",
        "role": "it_head",
        "prompt": "Show me all registered members",
    },
    {
        "id": "ithead_search_member",
        "tool": "get_members",
        "role": "it_head",
        "prompt": "Find the member account for Dev Member Preview",
    },
    {
        "id": "ithead_active_loans",
        "tool": "get_active_loans",
        "role": "it_head",
        "prompt": "How many books are currently on loan?",
    },
    {
        "id": "ithead_overdue_loans",
        "tool": "get_active_loans",
        "role": "it_head",
        "prompt": "Show me all overdue loans",
    },
    {
        "id": "ithead_outstanding_fines",
        "tool": "get_outstanding_fines",
        "role": "it_head",
        "prompt": "What is the total value of unpaid fines?",
    },
    {
        "id": "ithead_support_tickets",
        "tool": "get_all_support_tickets",
        "role": "it_head",
        "prompt": "Show me all open support tickets",
    },
    {
        "id": "ithead_support_tickets_all",
        "tool": "get_all_support_tickets",
        "role": "it_head",
        "prompt": "List all support tickets including resolved and closed ones",
    },
    {
        "id": "ithead_own_reservations",
        "tool": "get_my_reservations",
        "role": "it_head",
        "prompt": "Do I have any book reservations?",
    },
    {
        "id": "ithead_own_seat_bookings",
        "tool": "get_my_seat_bookings",
        "role": "it_head",
        "prompt": "Do I have any seat bookings?",
    },
    {
        "id": "ithead_pricing_plans",
        "tool": "get_pricing_plans",
        "role": "it_head",
        "prompt": "What membership plans does the library offer?",
    },
    {
        "id": "ithead_guardrail_staff_only_as_member_check",
        "tool": "guardrail",
        "role": "it_head",
        "prompt": "Show me all members in the system",
    },
    # ── IT HEAD multi-turn ────────────────────────────────────────────────────
    {
        "id": "ithead_multi_loans_then_return",
        "tool": "get_active_loans → return_loan",
        "role": "it_head",
        "turns": [
            "Show me all active loans",
            "Mark the first one as returned",
        ],
    },
    {
        "id": "ithead_multi_fines_then_loans",
        "tool": "get_outstanding_fines → get_active_loans",
        "role": "it_head",
        "turns": [
            "What are the total outstanding fines?",
            "Which member owes the most?",
            "Show me their loan details",
        ],
    },
    {
        "id": "ithead_multi_tickets_then_count",
        "tool": "get_all_support_tickets → context",
        "role": "it_head",
        "turns": [
            "Show me all open support tickets",
            "How many harassment tickets are there?",
        ],
    },
    {
        "id": "ithead_multi_overdue_then_reminder",
        "tool": "get_active_loans → send_loan_reminder",
        "role": "it_head",
        "turns": [
            "Show me overdue loans",
            "Send a reminder to the member with the oldest overdue loan",
        ],
    },
    # ══════════════════════════════════════════════════════════════════════════
    # MANAGER — single-turn prompts
    # manager has LOAN_MANAGER_ROLES + get_all_support_tickets + get_members
    # ══════════════════════════════════════════════════════════════════════════
    {
        "id": "manager_get_members",
        "tool": "get_members",
        "role": "manager",
        "prompt": "Give me a list of all library members",
    },
    {
        "id": "manager_search_member",
        "tool": "get_members",
        "role": "manager",
        "prompt": "Search for members with the name Arjun",
    },
    {
        "id": "manager_active_loans_summary",
        "tool": "get_active_loans",
        "role": "manager",
        "prompt": "Give me a summary of all active loans",
    },
    {
        "id": "manager_overdue_count",
        "tool": "get_active_loans",
        "role": "manager",
        "prompt": "How many loans are overdue right now?",
    },
    {
        "id": "manager_fines_summary",
        "tool": "get_outstanding_fines",
        "role": "manager",
        "prompt": "Show me all outstanding fines",
    },
    {
        "id": "manager_support_tickets_open",
        "tool": "get_all_support_tickets",
        "role": "manager",
        "prompt": "Show me all open support tickets",
    },
    {
        "id": "manager_support_tickets_resolved",
        "tool": "get_all_support_tickets",
        "role": "manager",
        "prompt": "Show me resolved support tickets",
    },
    {
        "id": "manager_upcoming_events",
        "tool": "get_upcoming_events",
        "role": "manager",
        "prompt": "What events are scheduled at the library?",
    },
    {
        "id": "manager_books_available",
        "tool": "get_books",
        "role": "manager",
        "prompt": "How many books are currently available?",
    },
    {
        "id": "manager_own_notifications",
        "tool": "get_my_notifications",
        "role": "manager",
        "prompt": "Do I have any notifications?",
    },
    {
        "id": "manager_leaderboard",
        "tool": "get_leaderboard",
        "role": "manager",
        "prompt": "Show me the reading leaderboard",
    },
    {
        "id": "manager_guardrail_off_topic",
        "tool": "guardrail",
        "role": "manager",
        "prompt": "What is the latest IPL score?",
    },
    # ── MANAGER multi-turn ────────────────────────────────────────────────────
    {
        "id": "manager_multi_loans_then_reminder",
        "tool": "get_active_loans → send_loan_reminder",
        "role": "manager",
        "turns": [
            "Show me all active loans",
            "Send a reminder for the most overdue one",
        ],
    },
    {
        "id": "manager_multi_tickets_then_breakdown",
        "tool": "get_all_support_tickets → context",
        "role": "manager",
        "turns": [
            "Show me all support tickets",
            "How many are still open?",
            "Which category has the most tickets?",
        ],
    },
    {
        "id": "manager_multi_members_then_loans",
        "tool": "get_members → get_active_loans",
        "role": "manager",
        "turns": [
            "How many members do we have?",
            "How many books are currently borrowed?",
            "What percentage of members have active loans?",
        ],
    },
    {
        "id": "manager_multi_fines_then_return",
        "tool": "get_outstanding_fines → return_loan",
        "role": "manager",
        "turns": [
            "Who has the highest outstanding fine?",
            "Show me their loan details",
            "Mark that loan as returned",
        ],
    },
    {
        "id": "manager_multi_events_then_books",
        "tool": "get_upcoming_events → get_books",
        "role": "manager",
        "turns": [
            "What events are coming up?",
            "Are there any books related to the first event topic?",
        ],
    },
]


# ── Auth helpers ──────────────────────────────────────────────────────────────


async def login(client: httpx.AsyncClient, email: str, password: str) -> str:
    resp = await client.post(
        f"{BASE_URL}{API}/auth/login",
        json={"email": email, "password": password},
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


async def get_token(client: httpx.AsyncClient, role: str, credentials: dict[str, dict]) -> str:
    creds = credentials.get(role, credentials["member"])
    return await login(client, creds["email"], creds["password"])


# ── Chat helpers ──────────────────────────────────────────────────────────────


async def send_message(client: httpx.AsyncClient, token: str, message: str) -> dict:
    resp = await client.post(
        f"{BASE_URL}{API}/chat",
        json={"message": message},
        headers={"Authorization": f"Bearer {token}"},
        timeout=60.0,
    )
    if resp.status_code != 200:
        return {"reply": f"HTTP {resp.status_code}: {resp.text}", "source": "error"}
    return resp.json()


async def clear_history(client: httpx.AsyncClient, token: str) -> None:
    await client.delete(
        f"{BASE_URL}{API}/chat/history",
        headers={"Authorization": f"Bearer {token}"},
    )


# ── Runner ────────────────────────────────────────────────────────────────────


async def run_tests(credentials: dict[str, dict]) -> list[dict]:
    results = []

    async with httpx.AsyncClient() as client:
        tokens: dict[str, str] = {}
        for role in {t.get("role", "member") for t in TESTS}:
            try:
                tokens[role] = await get_token(client, role, credentials)
                print(f"  ✓ Logged in as {role}")
            except Exception as exc:
                print(f"  ✗ Could not log in as {role}: {exc}")
                tokens[role] = ""

        total = len(TESTS)
        for i, test in enumerate(TESTS, 1):
            test_id = test["id"]
            role = test.get("role", "member")
            token = tokens.get(role, "")
            is_multi = "turns" in test

            turn_kind = "multi" if is_multi else "single"
            print(f"\n[{i}/{total}] {test_id} ({turn_kind}-turn, role={role})")

            if not token:
                results.append(
                    {
                        "id": test_id,
                        "tool": test.get("tool"),
                        "role": role,
                        "type": "multi" if is_multi else "single",
                        "error": f"No token for role '{role}'",
                    }
                )
                continue

            await clear_history(client, token)

            if is_multi:
                turns_log = []
                for turn_msg in test["turns"]:
                    print(f"    → {turn_msg}")
                    resp = await send_message(client, token, turn_msg)
                    print(f"    ← {resp.get('reply', '')[:120]}...")
                    turns_log.append(
                        {
                            "prompt": turn_msg,
                            "reply": resp.get("reply", ""),
                            "source": resp.get("source", ""),
                        }
                    )
                results.append(
                    {
                        "id": test_id,
                        "tool": test.get("tool"),
                        "role": role,
                        "type": "multi",
                        "turns": turns_log,
                        "timestamp": datetime.now(UTC).isoformat(),
                    }
                )
            else:
                prompt = test["prompt"]
                print(f"    → {prompt}")
                resp = await send_message(client, token, prompt)
                print(f"    ← {resp.get('reply', '')[:120]}...")
                results.append(
                    {
                        "id": test_id,
                        "tool": test.get("tool"),
                        "role": role,
                        "type": "single",
                        "prompt": prompt,
                        "reply": resp.get("reply", ""),
                        "source": resp.get("source", ""),
                        "timestamp": datetime.now(UTC).isoformat(),
                    }
                )

    return results


# ── Entry point ───────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(description="Run extended chatbot tests")
    parser.add_argument("--url", default="http://localhost:8000")
    parser.add_argument("--member-email", default="member@devpreview.internal")
    parser.add_argument("--member-password", default="DevPreview123!")
    parser.add_argument("--it-head-email", default="it-head@devpreview.internal")
    parser.add_argument("--it-head-password", default="DevPreview123!")
    parser.add_argument("--manager-email", default="manager@devpreview.internal")
    parser.add_argument("--manager-password", default="DevPreview123!")
    parser.add_argument("--output", default="chat_test_results_extended.json")
    args = parser.parse_args()

    global BASE_URL
    BASE_URL = args.url

    credentials = {
        "member": {"email": args.member_email, "password": args.member_password},
        "it_head": {"email": args.it_head_email, "password": args.it_head_password},
        "manager": {"email": args.manager_email, "password": args.manager_password},
    }

    single = sum(1 for t in TESTS if "turns" not in t)
    multi = sum(1 for t in TESTS if "turns" in t)
    print(f"\n{'=' * 60}")
    print(f"  Extended Chatbot Test Suite — {len(TESTS)} tests")
    print(f"  Single-turn: {single}  |  Multi-turn: {multi}")
    print("  Roles: member, it_head, manager")
    print(f"  Backend: {BASE_URL}")
    print(f"{'=' * 60}")
    print("\nLogging in...")

    results = asyncio.run(run_tests(credentials))

    output_path = Path(__file__).parent / args.output
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "run_at": datetime.now(UTC).isoformat(),
                "total": len(results),
                "single_turn": sum(1 for r in results if r.get("type") == "single"),
                "multi_turn": sum(1 for r in results if r.get("type") == "multi"),
                "by_role": {
                    "member": sum(1 for r in results if r.get("role") == "member"),
                    "it_head": sum(1 for r in results if r.get("role") == "it_head"),
                    "manager": sum(1 for r in results if r.get("role") == "manager"),
                },
                "results": results,
            },
            f,
            indent=2,
            ensure_ascii=False,
        )

    errors = [r for r in results if "error" in r or r.get("source") == "error"]
    print(f"\n{'=' * 60}")
    print(f"  Done. {len(results)} tests run, {len(errors)} errors.")
    print(f"  Results saved to: {output_path}")
    print(f"{'=' * 60}\n")

    if errors:
        print("Errors:")
        for e in errors:
            print(f"  - {e['id']}: {e.get('error') or e.get('reply', '')[:100]}")
        sys.exit(1)


if __name__ == "__main__":
    main()
