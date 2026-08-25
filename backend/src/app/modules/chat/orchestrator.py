# ruff: noqa: E501
"""
Chat orchestrator — LangGraph ReAct agent with multi-LLM backend support.

LLM_MODE (set in .env):
  openai  -> ChatOpenAI (gpt-4o-mini or OPENAI_MODEL)
  bedrock -> ChatBedrockConverse (amazon.nova-lite-v1:0 or BEDROCK_MODEL_ID)
  ollama  -> ChatOllama (llama3.2:3b or OLLAMA_MODEL)

Flow:
  1. RAG  — fast keyword match against FAQ knowledge base (no LLM cost).
  2. TAG  — async LangChain tools wrapping existing service functions.
  3. LLM  — role-aware system prompt orchestrates tool calls via ReAct agent.
"""

from __future__ import annotations

import json
import logging
from contextvars import ContextVar
from typing import Any

from fastapi import HTTPException
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.prebuilt import create_react_agent

from app.core.constants import Role
from app.core.llm import build_chat_llm
from app.modules.books import service as books_service
from app.modules.books.schemas import BookSort
from app.modules.chat.guardrails import GuardrailBlock, check_input, check_output
from app.modules.chat.schemas import ChatMessage, ChatResponse
from app.modules.events import service as events_service
from app.modules.leaderboard import service as leaderboard_service
from app.modules.loans import service as loans_service
from app.modules.members import service as members_service
from app.modules.notifications import service as notifications_service
from app.modules.pricing_plans import service as pricing_plans_service
from app.modules.reservations import service as reservations_service
from app.modules.reservations.schemas import ReservationCreate
from app.modules.seat_booking import service as seat_booking_service
from app.modules.seat_booking.schemas import SeatBookingCreate
from app.modules.support_tickets import service as support_tickets_service
from app.modules.support_tickets.constants import TicketCategory
from app.modules.support_tickets.schemas import SupportTicketCreate

logger = logging.getLogger(__name__)

# ── Per-request context injected before each agent call ──────────────────────
# A ContextVar, not a plain dict. Tools read this while the agent is suspended at an
# await, so with module-level state any concurrent request would overwrite it and the
# suspended request's tools would resume reading the *other* caller's member_id and
# role — a cross-user data leak, and a privilege escalation through the STAFF_ROLES
# checks below. ContextVar values are per-task, so each request sees only its own.
# Always replace the whole dict via .set(); never mutate the value in place. The
# default is None rather than {} so there is exactly one shared empty state that
# nothing can accidentally write into.
_ctx: ContextVar[dict[str, Any] | None] = ContextVar("chat_ctx", default=None)

STAFF_ROLES = {
    Role.ADMIN.value,
    Role.LIBRARIAN.value,
    Role.MANAGER.value,
    Role.IT_HEAD.value,
}
LOAN_MANAGER_ROLES = STAFF_ROLES


# ── Context helpers ───────────────────────────────────────────────────────────
def _current() -> dict[str, Any]:
    return _ctx.get() or {}


def _role() -> str:
    return _current().get("role", Role.MEMBER.value)


def _member_id() -> str:
    return _current().get("member_id", "")


def _user_name() -> str:
    return _current().get("user_name", "")


def _tool_error(action: str, exc: Exception) -> str:
    """Surface expected, user-actionable failures; hide everything else.

    Services raise HTTPException with text already written for users ("No copies are
    currently available"), so that is safe to pass through. Anything else — Prisma
    errors, constraint names, provider internals — must not reach the model, which
    relays tool output to the user more or less verbatim.
    """
    if isinstance(exc, HTTPException):
        return f"{action}: {exc.detail}"
    logger.exception("chat tool failed: %s", action)
    return f"{action}: something went wrong on our side. Please try again."


# ═══════════════════════════════════════════════════════════════════════════════
# READ TOOLS — all authenticated users
# ═══════════════════════════════════════════════════════════════════════════════


@tool
async def get_upcoming_events(query: str = "") -> str:
    """Fetch upcoming library events. Always call with query=""."""
    result = await events_service.list_events(
        page=1, page_size=10, member_id=_member_id(), timeframe="upcoming"
    )
    if not result.items:
        return "No upcoming events found."
    return json.dumps(
        [
            {
                "id": e.id,
                "title": e.title,
                "date": e.date.strftime("%d %b %Y, %I:%M %p"),
                "location": e.location,
                "capacity": e.capacity,
                "attendees": e.attendees,
                "registered": e.registered,
            }
            for e in result.items
        ]
    )


@tool
async def get_books(query: str = "", sort: str = "newest") -> str:
    """List/search books. query="" for a sample of books. sort='recommended' for personalised picks, 'rating' for top rated, 'newest' for latest. ALWAYS call this for any book recommendation request. The query is matched against title, author, and description — pass the most meaningful single keyword (e.g. 'comic' not 'cnic', 'funny' not 'fummy'). If the user's phrasing is misspelled or informal, correct it to the closest real English word before passing. NOTE: this tool returns up to 10 books as a sample — it does NOT return the full catalog. Always present results as 'here are some books' or 'here are a few books', never 'here are all the books'."""
    sort_value: BookSort = sort if sort in {"newest", "rating", "recommended"} else "newest"  # type: ignore[assignment]

    seen: dict[str, Any] = {}
    # Try the full query first, then fall back to individual keywords so that
    # multi-word or misspelled queries still surface partial matches.
    terms = [query] if query else []
    if query and " " in query:
        terms += [w for w in query.split() if len(w) > 2]

    for term in terms:
        result = await books_service.list_books(
            search=term or None,
            category=None,
            sort=sort_value,
            page=1,
            page_size=10,
        )
        for b in result.items:
            if b.id not in seen:
                seen[b.id] = b
        if seen:
            break  # full-query hit — no need to try individual keywords

    if not seen:
        # Last resort: return all books so the LLM can reason over them
        result = await books_service.list_books(
            search=None, category=None, sort=sort_value, page=1, page_size=10
        )
        for b in result.items:
            seen[b.id] = b

    books = list(seen.values())[:10]
    return json.dumps(
        [
            {
                "id": b.id,
                "title": b.title,
                "author": b.author,
                "category": b.category,
                "available": b.available,
                "copies": b.total_copies,
                "average_rating": b.average_rating,
                "review_count": b.review_count,
            }
            for b in books
        ]
    )


@tool
async def get_highest_rated_books(query: str = "") -> str:
    """Get books sorted by highest average rating. Only returns books that actually have reviews. Call with query=""."""
    result = await books_service.list_books(
        search=None, category=None, sort="rating", page=1, page_size=10
    )
    if not result.items:
        return "No books found."
    rated = [b for b in result.items if b.review_count > 0]
    if not rated:
        return "No books have been reviewed yet. Ratings are not available."
    return json.dumps(
        [
            {
                "title": b.title,
                "author": b.author,
                "average_rating": b.average_rating,
                "review_count": b.review_count,
            }
            for b in rated
        ]
    )


@tool
async def get_my_loans(query: str = "") -> str:
    """Get current user's borrowed books, due dates, overdue status, and fines. Call with query=""."""
    items = await loans_service.list_my_loans(_member_id())
    if not items:
        return "empty_loans"
    return json.dumps(
        [
            {
                "id": loan.id,
                "book": loan.book_title,
                "due_date": loan.due_date.strftime("%d %b %Y"),
                "status": loan.status,
                "days_late": loan.days_late,
                "fine_amount": loan.fine_amount,
                "fine_paid": loan.fine_paid,
            }
            for loan in items
        ]
    )


@tool
async def get_my_reservations(query: str = "") -> str:
    """Get current user's book reservations and queue position. Call with query=""."""
    items = await reservations_service.list_my_reservations(_member_id())
    if not items:
        return "empty_reservations"
    return json.dumps(
        [
            {
                "id": r.id,
                "book": r.book_title,
                "status": r.status,
                "queue_position": r.queue_position,
                "eta_days": r.eta_days,
            }
            for r in items
        ]
    )


@tool
async def get_my_seat_bookings(query: str = "") -> str:
    """Get current user's upcoming seat bookings. Call with query=""."""

    class _FakeUser:
        id = _member_id()

    items = await seat_booking_service.list_my_bookings(_FakeUser())
    if not items:
        return "empty_seat_bookings"
    return json.dumps(
        [
            {"booking_id": b.id, "seat": b.seat_label, "date": b.date.isoformat(), "hour": b.hour}
            for b in items
        ]
    )


@tool
async def get_seat_availability(query: str = "") -> str:
    """Get current seat availability with available seat labels and today's date/time. Call before booking a seat."""
    from datetime import UTC, datetime

    now = datetime.now(UTC)
    summary = await seat_booking_service.get_availability_summary()
    booked = await seat_booking_service.get_schedule(
        type("U", (), {"id": _member_id()})(),
        now.date(),
        now.hour,
    )
    available_seats = [s.seat_label for s in booked.seats if s.status == "available"]
    return json.dumps(
        {
            "today": now.date().isoformat(),
            "current_hour": now.hour,
            "available_now": summary.available,
            "total": summary.total,
            "available_seat_labels": available_seats[:8],
        }
    )


@tool
async def get_my_notifications(query: str = "") -> str:
    """Get current user's unread notifications. Call with query=""."""

    class _FakeUser:
        id = _member_id()

    items = await notifications_service.list_my_notifications(_FakeUser())
    unread = [n for n in items if not n.read]
    if not unread:
        return "No unread notifications for this user."
    return json.dumps([{"type": n.type, "message": n.message} for n in unread])


@tool
async def get_my_support_tickets(query: str = "") -> str:
    """Get current user's support tickets and their status. Call with query=""."""

    class _FakeUser:
        id = _member_id()
        role = type("R", (), {"name": _role()})()
        fullName = _user_name()

    items = await support_tickets_service.list_my_tickets(_FakeUser())
    if not items:
        return "No support tickets raised by this user."
    return json.dumps(
        [
            {"id": t.id, "category": t.category, "status": t.status, "description": t.description}
            for t in items
        ]
    )


@tool
async def get_leaderboard(query: str = "") -> str:
    """Get reading leaderboard — top members by books completed. Call with query=""."""
    items = await leaderboard_service.get_leaderboard(_member_id())
    if not items:
        return "The leaderboard is empty."
    return json.dumps(
        [
            {
                "rank": e.rank,
                "name": e.full_name,
                "books_completed": e.books_completed,
                "is_you": e.is_current_user,
            }
            for e in items[:10]
        ]
    )


@tool
async def get_my_reading_progress(query: str = "") -> str:
    """Get current user's reading progress — books reading or completed. Call with query=""."""
    items = await members_service.list_reading_progress(_member_id())
    if not items:
        return "empty_reading_progress"
    return json.dumps(
        [{"book": p.book_title, "status": p.status, "percent": p.percent_complete} for p in items]
    )


@tool
async def get_my_reading_goal(query: str = "") -> str:
    """Get current user's reading goal and books completed this year/month. Call with query=""."""
    goal = await members_service.get_reading_goal(_member_id())
    if goal is None:
        return "You haven't set a reading goal yet."
    return json.dumps(
        {
            "yearly_goal": goal.yearly_goal,
            "monthly_goal": goal.monthly_goal,
            "completed_this_year": goal.books_completed_this_year,
            "completed_this_month": goal.books_completed_this_month,
        }
    )


@tool
async def get_my_reading_streak(query: str = "") -> str:
    """Get current user's login/reading streak in days. Call with query=""."""
    streak = await members_service.get_reading_streak(_member_id())
    return json.dumps(
        {
            "current_streak_days": streak.current_streak_days,
            "longest_streak_days": streak.longest_streak_days,
        }
    )


@tool
async def get_pricing_plans(query: str = "") -> str:
    """Get library membership pricing plans. Call with query=""."""
    plans = await pricing_plans_service.list_plans()
    if not plans:
        return "No pricing plans found."
    return json.dumps(
        [
            {
                "plan": p.plan_id,
                "months": p.months,
                "price_inr": p.price,
                "save_percent": p.save_percent,
                "badge": p.badge,
            }
            for p in plans
        ]
    )


# ═══════════════════════════════════════════════════════════════════════════════
# ACTION TOOLS — write operations any authenticated user can do on themselves
# ═══════════════════════════════════════════════════════════════════════════════


@tool
async def reserve_book(book_id: str) -> str:
    """Reserve a book. book_id can be the actual ID or a book title — if a title is passed the tool will look it up automatically."""
    try:
        # If it doesn't look like a UUID, treat it as a title search
        import re

        if not re.match(r"^[0-9a-f-]{36}$", book_id, re.IGNORECASE):
            result = await books_service.list_books(
                search=book_id, category=None, page=1, page_size=1
            )
            if not result.items:
                return f"Could not find a book matching '{book_id}'. Please check the title."
            book_id = result.items[0].id

        reservation = await reservations_service.create_reservation(
            _member_id(), ReservationCreate(book_id=book_id)
        )
        return f"Reserved '{reservation.book_title}'. Status: {reservation.status}." + (
            f" Queue position: {reservation.queue_position}." if reservation.queue_position else ""
        )
    except Exception as exc:
        return _tool_error("Could not reserve book", exc)


@tool
async def cancel_reservation(reservation_id: str) -> str:
    """Cancel a pending reservation. reservation_id can be the actual ID or a book title — the tool will look it up."""
    try:
        import re

        if not re.match(r"^[0-9a-f-]{36}$", reservation_id, re.IGNORECASE):
            items = await reservations_service.list_my_reservations(_member_id())
            match = next((r for r in items if reservation_id.lower() in r.book_title.lower()), None)
            if not match:
                return f"Could not find a reservation matching '{reservation_id}'."
            reservation_id = match.id
        await reservations_service.cancel_reservation(_member_id(), reservation_id)
        return "Reservation cancelled successfully."
    except Exception as exc:
        return _tool_error("Could not cancel reservation", exc)


@tool
async def book_seat(seat_label: str, date: str, hour: int) -> str:
    """Book a library seat. If seat_label is unknown, pass 'any' and the tool will pick the first available one. date: 'YYYY-MM-DD' or 'today' or 'tomorrow'. hour: 0-23 integer (e.g. 21 for 9pm)."""
    from datetime import UTC, datetime, timedelta
    from datetime import date as date_type

    class _FakeUser:
        id = _member_id()

    try:
        today = datetime.now(UTC).date()
        if date.lower() == "today":
            parsed_date = today
        elif date.lower() == "tomorrow":
            parsed_date = today + timedelta(days=1)
        else:
            parsed_date = date_type.fromisoformat(date)

        # Auto-pick first available seat if not specified
        if seat_label.lower() == "any" or not seat_label:
            schedule = await seat_booking_service.get_schedule(_FakeUser(), parsed_date, hour)
            available = [s.seat_label for s in schedule.seats if s.status == "available"]
            if not available:
                return f"No seats available on {parsed_date} at {hour:02d}:00."
            seat_label = available[0]

        result = await seat_booking_service.book_seat(
            _FakeUser(), SeatBookingCreate(seat_label=seat_label, date=parsed_date, hour=hour)
        )
        return f"Seat {result.seat_label} booked for {result.date} at {result.hour:02d}:00."
    except Exception as exc:
        return _tool_error("Could not book seat", exc)


@tool
async def cancel_seat_booking(booking_id: str) -> str:
    """Cancel a seat booking. booking_id must come from get_my_seat_bookings tool output."""

    class _FakeUser:
        id = _member_id()

    try:
        await seat_booking_service.cancel_booking(_FakeUser(), booking_id)
        return "Seat booking cancelled successfully."
    except Exception as exc:
        return _tool_error("Could not cancel booking", exc)


@tool
async def register_for_event(event_id: str) -> str:
    """Register current user for an event. event_id can be the actual ID or an event name — the tool will look it up automatically."""
    import re

    try:
        if not re.match(r"^[0-9a-f-]{36}$", event_id, re.IGNORECASE):
            events = await events_service.list_events(
                page=1, page_size=20, member_id=_member_id(), timeframe="upcoming"
            )
            match = next((e for e in events.items if event_id.lower() in e.title.lower()), None)
            if not match:
                return f"Could not find an event matching '{event_id}'."
            event_id = match.id
        registered_event = await events_service.register(event_id, _member_id())
        return f"Registered for '{registered_event.title}' successfully."
    except Exception as exc:
        return _tool_error("Could not register for event", exc)


@tool
async def unregister_from_event(event_id: str) -> str:
    """Unregister current user from an event. event_id must come from get_upcoming_events tool output."""
    try:
        result = await events_service.unregister(event_id, _member_id())
        return f"Unregistered from '{result.title}' successfully."
    except Exception as exc:
        return _tool_error("Could not unregister", exc)


@tool
async def raise_support_ticket(category: str, description: str) -> str:
    """Raise a support ticket. category: one of book_reservation/payment/seat_booking/harassment/offline_library/attendance/other. description: min 10 chars."""

    class _FakeUser:
        id = _member_id()
        role = type("R", (), {"name": _role()})()
        fullName = _user_name()

    try:
        result = await support_tickets_service.create_ticket(
            _FakeUser(),
            SupportTicketCreate(category=TicketCategory(category), description=description),
        )
        return f"Support ticket raised (ID: {result.id}). Status: {result.status}."
    except Exception as exc:
        return _tool_error("Could not raise ticket", exc)


# ═══════════════════════════════════════════════════════════════════════════════
# STAFF TOOLS
# ═══════════════════════════════════════════════════════════════════════════════


@tool
async def get_members(query: str = "") -> str:
    """STAFF ONLY. Search members by name/email (query="" for all). Role must be admin/librarian/manager/it_head. NOTE: returns a sample of up to 10 members plus the real total count. Never say the total is 10 — always report the actual total_count field."""
    if _role() not in STAFF_ROLES:
        return "You don't have permission to view member data."
    result = await members_service.list_members(search=query or None, page=1, page_size=10)
    if not result.items:
        return "No members found."
    return json.dumps(
        {
            "total_count": result.total,
            "members": [
                {
                    "name": m.full_name,
                    "email": m.email,
                    "role": m.role.name,
                    "active": m.is_active,
                    "last_login": m.last_login_at.strftime("%d %b %Y") if m.last_login_at else "Never",
                }
                for m in result.items
            ],
        }
    )


@tool
async def get_active_loans(query: str = "") -> str:
    """STAFF ONLY. Get all active/overdue loans across all members. Call with query=""."""
    if _role() not in LOAN_MANAGER_ROLES:
        return "You don't have permission to view loan data."
    items = await loans_service.list_active_loans()
    if not items:
        return "No active loans."
    overdue = [loan for loan in items if loan.status == "overdue"]
    return json.dumps(
        {
            "total_active": len(items),
            "overdue_count": len(overdue),
            "loans": [
                {
                    "id": loan.id,
                    "book": loan.book_title,
                    "member": loan.member_name,
                    "due_date": loan.due_date.strftime("%d %b %Y"),
                    "status": loan.status,
                    "fine": loan.fine_amount,
                }
                for loan in items[:20]
            ],
        }
    )


@tool
async def get_outstanding_fines(query: str = "") -> str:
    """STAFF ONLY. Get all unpaid fines across all members. Call with query=""."""
    if _role() not in LOAN_MANAGER_ROLES:
        return "You don't have permission to view fine data."
    items = await loans_service.list_fines()
    unpaid = [loan for loan in items if not loan.fine_paid]
    if not unpaid:
        return "No outstanding fines."
    total = sum(loan.fine_amount for loan in unpaid)
    return json.dumps(
        {
            "total_outstanding": total,
            "count": len(unpaid),
            "fines": [
                {
                    "loan_id": loan.id,
                    "book": loan.book_title,
                    "member": loan.member_name,
                    "amount": loan.fine_amount,
                }
                for loan in unpaid[:20]
            ],
        }
    )


@tool
async def get_all_support_tickets(status_filter: str = "") -> str:
    """STAFF ONLY. Get all support tickets. status_filter: 'open'/'resolved'/'closed'/'' for all."""
    if _role() not in STAFF_ROLES:
        return "You don't have permission to view all support tickets."
    items = await support_tickets_service.list_all_tickets(status_filter or None)
    if not items:
        return "No support tickets found."
    return json.dumps(
        [
            {"id": t.id, "category": t.category, "status": t.status, "raised_by": t.raised_by_name}
            for t in items[:20]
        ]
    )


@tool
async def return_loan(loan_id: str) -> str:
    """STAFF ONLY. Mark a loan as returned. loan_id must come from get_active_loans tool output."""
    if _role() not in LOAN_MANAGER_ROLES:
        return "You don't have permission to return loans."
    import re
    if not re.match(r"^[0-9a-f-]{36}$", loan_id, re.IGNORECASE):
        items = await loans_service.list_active_loans()
        overdue = [loan for loan in items if loan.status == "overdue"]
        target = overdue[0] if overdue else (items[0] if items else None)
        if not target:
            return "No active loans found to return."
        loan_id = target.id
    try:
        result = await loans_service.return_loan(loan_id)
        return f"Loan for '{result.book_title}' marked as returned."
    except Exception as exc:
        return _tool_error("Could not return loan", exc)


@tool
async def send_loan_reminder(loan_id: str) -> str:
    """STAFF ONLY. Send overdue reminder to a member. loan_id must come from get_active_loans tool output."""
    if _role() not in LOAN_MANAGER_ROLES:
        return "You don't have permission to send reminders."
    import re
    if not re.match(r"^[0-9a-f-]{36}$", loan_id, re.IGNORECASE):
        items = await loans_service.list_active_loans()
        overdue = [loan for loan in items if loan.status == "overdue"]
        if not overdue:
            return "No overdue loans found to send a reminder for."
        loan_id = overdue[0].id
    try:
        await loans_service.send_reminder(loan_id)
        return "Reminder sent successfully."
    except Exception as exc:
        return _tool_error("Could not send reminder", exc)


# ── Tools list ────────────────────────────────────────────────────────────────
TOOLS = [
    get_upcoming_events,
    get_books,
    get_highest_rated_books,
    get_my_loans,
    get_my_reservations,
    get_my_seat_bookings,
    get_seat_availability,
    get_my_notifications,
    get_my_support_tickets,
    get_leaderboard,
    get_my_reading_progress,
    get_my_reading_goal,
    get_my_reading_streak,
    get_pricing_plans,
    reserve_book,
    cancel_reservation,
    book_seat,
    cancel_seat_booking,
    register_for_event,
    unregister_from_event,
    raise_support_ticket,
    get_members,
    get_active_loans,
    get_outstanding_fines,
    get_all_support_tickets,
    return_loan,
    send_loan_reminder,
]


# ── System prompt ─────────────────────────────────────────────────────────────
def _system_prompt(user_name: str, role: str, member_id: str) -> str:
    return f"""You are Shelfie, a helpful assistant for the Community Reading Club library platform.

Current user: {user_name} | Role: {role} | ID: {member_id}

Your job:
- Use the available tools to answer questions about books, loans, reservations, seat bookings, events, reading progress, notifications, support tickets, and membership plans.
- For staff roles (admin, librarian, manager, it_head): also use member search, loan management, and fine tools. Do NOT suggest or offer actions like registering for events, reserving books, or booking seats to staff users — those are member-only actions. Never ask a staff user "Would you like to register" for an event.
- ALWAYS call a tool to get live data. Never answer data questions from memory.
- The get_books tool returns a sample of up to 10 books — the library has hundreds. Never say 'here are all the books'. Always say 'here are some books' or 'here are a few books from our collection'.
- When a tool response includes a total_count field, always report that number as the actual total — never count the items in the sample and report that as the total.
- Resolve pronouns ("which one", "those", "it") from prior conversation turns before calling a tool.
- Only answer library-related questions. For anything else say: "I can only help with library-related topics."
- When the user asks to book a seat, ALWAYS call get_seat_availability first to get available seat labels and today's date, then call book_seat with a real seat label from that response.
- When the user asks to reserve a book by title, ALWAYS call get_books first to get the book_id, then call reserve_book with that id.
- When the user asks to register for an event by name, ALWAYS call get_upcoming_events first to get the event_id, then call register_for_event.
- When a tool returns one of these sentinel values, respond naturally without any bullet points:
  - empty_loans → "You haven't borrowed any books yet! Would you like to browse what's available or reserve a book?"
  - empty_reservations → "You don't have any active reservations. Would you like to reserve a book?"
  - empty_seat_bookings → "You don't have any seat bookings. Would you like to book a seat?"
  - empty_reading_progress → "No reading progress recorded yet. Start reading and track your progress here!"
- Be warm and conversational. When data is empty (no loans, no reservations, etc.), acknowledge it naturally and offer ONE relevant next step only (e.g. if no loans → suggest reserving a book; if no reservations → suggest browsing books; if no seat bookings → suggest booking a seat).
- Never suggest actions that contradict the data (e.g. do NOT suggest returning a loan if the user has no loans).
- Never render an empty bullet point. If there is no list data, just write a sentence.
- When showing seat bookings, NEVER display the booking_id to the user — use it internally only when calling cancel_seat_booking.
- When showing seat bookings, do NOT proactively offer to cancel them. Only attempt cancellation if the user explicitly asks.
- Use markdown lists (each item on its own line starting with `- `) for any list of results. Each list item must be on its own line — never put multiple items on the same line separated by bullets or commas.
- Always put a blank line between an intro sentence and a list.
- Use **bold** for titles and key values. Keep responses concise.
- Never mix list styles — use only `- ` prefixed items, never `•` or `*` or numbered inline."""


# ── Orchestrator ──────────────────────────────────────────────────────────────
async def run_chat(
    *,
    message: str,
    history: list[ChatMessage],
    member_id: str,
    user_name: str,
    role: str,
) -> ChatResponse:
    # All authenticated requests go straight to guardrails → LLM + tools.
    # RAG/FAQ is frontend-only (unauthenticated tree navigation).

    # 1. Input guardrails
    try:
        safe_message = check_input(message)
    except GuardrailBlock as block:
        return ChatResponse(reply=block.reply, source="rag")

    # 2. TAG + LLM via LangGraph ReAct agent
    _ctx.set({"member_id": member_id, "role": role, "user_name": user_name})

    try:
        llm = build_chat_llm()
    except Exception:
        logger.exception("LLM backend could not be initialised")
        return ChatResponse(
            reply="The assistant is unavailable right now. Please try again shortly.",
            source="error",
        )

    agent = create_react_agent(llm, TOOLS)

    msgs: list = [SystemMessage(content=_system_prompt(user_name, role, member_id))]
    for h in history[-10:]:
        if h.role == "user":
            msgs.append(HumanMessage(content=h.content))
        else:
            msgs.append(AIMessage(content=h.content))
    msgs.append(HumanMessage(content=safe_message))

    try:
        result = await agent.ainvoke({"messages": msgs})
        final: str = result["messages"][-1].content
        # Output guardrail — redact PII, block harmful responses
        final = check_output(final)

        # Anti-hallucination: if the LLM answered a book/event/data question
        # without calling any tool, force it to use the tool instead.
        tool_was_called = any(hasattr(m, "type") and m.type == "tool" for m in result["messages"])
        data_question = any(
            kw in message.lower()
            for kw in [
                "recommend",
                "suggest",
                "what should i read",
                "best book",
                "top book",
                "highest rated",
                "popular book",
                "what to read",
            ]
        )
        if data_question and not tool_was_called:
            # Re-invoke with an explicit instruction to use the tool
            msgs.append(AIMessage(content=final))
            msgs.append(
                HumanMessage(
                    content="Use the get_books tool with sort='recommended' to answer the previous question. Do not answer from memory."
                )
            )
            result2 = await agent.ainvoke({"messages": msgs})
            final = check_output(result2["messages"][-1].content)
        # Normalise inline bullet characters to markdown list items.
        # Some smaller models (llama3.2, nova-lite) ignore the system prompt
        # formatting rules and emit "• item • item" in one paragraph.
        if "•" in final:
            parts = [p.strip() for p in final.split("•") if p.strip()]
            if len(parts) > 1:
                # First part may be an intro sentence, rest are list items
                intro = parts[0] if not parts[0].startswith(("-", "*")) else ""
                items = parts[1:] if intro else parts
                final = (intro + "\n\n" if intro else "") + "\n".join(f"- {i}" for i in items)
        # Normalise numbered lists without newlines: "1. foo 2. bar" → proper markdown
        import re as _re
        if _re.search(r"\d+\.\s.+\d+\.\s", final):
            final = _re.sub(r"(?<=[^\n])(\d+\.\s)", r"\n\1", final).strip()
        tag_keywords = [
            "event",
            "book",
            "member",
            "progress",
            "reading",
            "show",
            "list",
            "loan",
            "reservation",
            "seat",
            "fine",
            "ticket",
            "leaderboard",
            "streak",
            "goal",
            "notification",
            "plan",
            "reserve",
            "register",
            "cancel",
            "return",
            "remind",
        ]
        is_tag = any(kw in message.lower() for kw in tag_keywords)
        return ChatResponse(reply=final, source="tag" if is_tag else "llm")
    except Exception:
        logger.exception("chat agent invocation failed")
        return ChatResponse(
            reply="Something went wrong handling that. Please try again.", source="error"
        )
