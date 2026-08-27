import re

# RAG knowledge base — static FAQ content the LLM can cite without hitting the DB.
# Each entry has keywords for fast intent matching and a text answer.

RAG_KNOWLEDGE: list[dict] = [
    {
        "keywords": [
            "what is ai guardian auto-pay",
            "what is ai guardian auto pay",
            "what is auto-pay",
            "what is autopay",
            "what is auto pay",
            "in my side bar",
            "in my sidebar",
            "ai guardian auto pay",
            "ai guardian auto-pay",
            "guardian auto pay",
            "guardian autopay",
        ],
        "answer": (
            "AI Guardian Auto-Pay lets you allow AI to settle eligible library fines for your linked child "
            "automatically, while keeping strict spending limits under your control.\n\n"
            "You set a maximum amount AI can pay per fine and a monthly limit. Fines within those limits can "
            "be settled automatically. If a fine exceeds the limit, AI blocks the automatic payment and alerts "
            "you so you can review and approve it yourself.\n\n"
            "You can manage these controls from the AI Guardian Auto-Pay page in your sidebar."
        ),
    },
    {
        "keywords": [
            "how does auto-pay work",
            "how does autopay work",
            "how does auto pay work",
            "how auto pay works",
            "how autopay works",
            "how auto-pay works",
        ],
        "answer": (
            "AI Guardian Auto-Pay evaluates each eligible child fine against your set policy limits (per-fine limit and monthly limit) and child safety status.\n\n"
            "- Within limit (e.g. ₹150 fine with ₹200 limit): AI checks policy and settles the fine automatically without requiring manual approval.\n"
            "- Exceeds limit (e.g. ₹250 fine with ₹200 limit): AI blocks the automatic payment, notifies you, and requires your manual review and approval."
        ),
    },
    {
        "keywords": [
            "exceeds auto-pay limit",
            "exceeds autopay limit",
            "exceeds auto pay limit",
            "exceeds limit",
            "exceeds the limit",
            "exceeds the auto-pay limit",
            "above limit",
            "over limit",
        ],
        "answer": (
            "If your child's fine exceeds your AI Auto-Pay limit (or monthly limit), AI will NOT pay it automatically.\n\n"
            "The automatic payment is blocked, and an alert is sent to you. You remain in control and can manually review and approve the payment by visiting AI Guardian Auto-Pay in your sidebar and selecting 'Review & Pay Fines'."
        ),
    },
    {
        "keywords": ["become member", "join", "register", "sign up", "membership"],
        "answer": (
            "To become a member:\n"
            "1. Open the Register page.\n"
            "2. Fill in your name, email, phone, and choose a membership plan.\n"
            "3. Submit the form — you'll be redirected to payment.\n"
            "4. Once payment is confirmed your account is active."
        ),
    },
    {
        "keywords": ["renew membership", "extend membership", "membership expir"],
        "answer": (
            "To renew your membership:\n"
            "1. Open your Profile.\n"
            "2. Go to the Membership section.\n"
            "3. Click Renew and complete payment."
        ),
    },
    {
        "keywords": ["borrow book", "issue book", "take book", "checkout"],
        "answer": (
            "To borrow a book:\n"
            "1. Visit the Books page and find an available title.\n"
            "2. Click Borrow.\n"
            "3. Confirm the borrowing details at the counter or via QR scan."
        ),
    },
    {
        "keywords": ["reserve book", "hold book", "unavailable book", "waitlist"],
        "answer": (
            "To reserve an unavailable book:\n"
            "1. Find the book on the Books page.\n"
            "2. Click Reserve to join the queue.\n"
            "3. You'll be notified when it's available for pickup."
        ),
    },
    {
        "keywords": ["return book", "return", "due date", "overdue"],
        "answer": (
            "Return books by the due date shown in your Reservations page. "
            "Overdue books accrue a daily fine. You can see the exact amount in your account."
        ),
    },
    {
        "keywords": ["lost book", "lose book", "missing book"],
        "answer": (
            "If you lose a book:\n"
            "1. Report it at the library desk or through your account.\n"
            "2. A replacement fee will be charged.\n"
            "Contact: pricing@readingclub.org | +1 (555) 010-2001"
        ),
    },
    {
        "keywords": ["fine", "penalty", "overdue fee", "pay fine", "pay my fine", "how do i pay a fine", "how to pay fine", "waive fine"],
        "answer": (
            "Fines accrue per day overdue based on book type.\n\n"
            "How to pay a fine:\n"
            "1. Eligible AI Auto-Pay: If Auto-Pay is enabled and the fine is within your allowed policy limits, AI may settle it automatically.\n"
            "2. Manual Payment: For fines requiring guardian review or exceeding policy limits, navigate to AI Guardian Auto-Pay in your sidebar → Review & Pay Fines → Review the payment → Approve & Pay."
        ),
    },
    {
        "keywords": ["seat", "book seat", "reserve seat", "study space", "seat booking"],
        "answer": (
            "To book a seat:\n"
            "1. Go to Seat Booking.\n"
            "2. Pick a date, time slot, and available seat.\n"
            "3. Confirm — you'll get a notification.\n"
            "Members can book up to 5 seats per week."
        ),
    },
    {
        "keywords": ["cancel seat", "cancel reservation", "cancel booking"],
        "answer": (
            "To cancel a seat reservation:\n"
            "1. Open My Reservations.\n"
            "2. Find the booking and click Cancel.\n"
            "3. Confirm the cancellation."
        ),
    },
    {
        "keywords": ["reading club", "book club", "join club", "create club"],
        "answer": (
            "To join a reading club: go to the Community section, browse clubs, and click Join. "
            "To create a club, contact: clubs@readingclub.org"
        ),
    },
    {
        "keywords": ["event", "register event", "upcoming event", "workshop"],
        "answer": (
            "To register for an event:\n"
            "1. Open the Events page.\n"
            "2. Select an event and click Register.\n"
            "3. Confirm your registration."
        ),
    },
    {
        "keywords": ["donate book", "donation", "donate fund"],
        "answer": (
            "To donate books: bring gently used books to the library desk or use the "
            "Donations section. "
            "For fund donations, open the Donations page and follow the steps. "
            "Contact: donations@readingclub.org"
        ),
    },
    {
        "keywords": ["password", "reset password", "forgot password", "change password"],
        "answer": (
            "To reset your password:\n"
            "1. Go to the Login page.\n"
            "2. Click Forgot password.\n"
            "3. Enter your email and follow the reset link."
        ),
    },
    {
        "keywords": ["profile", "update profile", "edit profile", "change name", "change phone"],
        "answer": (
            "To update your profile:\n"
            "1. Open your Profile page.\n"
            "2. Click Edit Profile.\n"
            "3. Update your details and save."
        ),
    },
]
# Patterns that indicate the user wants to DO something (action intent),
# not ask HOW to do it. RAG is skipped for these so the LLM handles them.
_ACTION_INTENT = re.compile(
    r"^(reserve|borrow|book|cancel|return|register for|unregister from|raise)\s+.{3,}",
    re.IGNORECASE,
)


def find_rag_answer(query: str, history: list | None = None) -> str | None:
    """Return the best matching RAG answer, or None if no match is confident enough."""
    # Skip RAG for action commands — let the LLM+tools handle them.
    if _ACTION_INTENT.match(query.strip()):
        return None
    q = query.lower().strip()

    # Check if conversation history is in Auto-Pay context
    in_autopay_context = False
    if history:
        recent_text = " ".join([
            (h.get("content", "") if isinstance(h, dict) else getattr(h, "content", str(h))).lower()
            for h in history[-3:]
        ])
        if any(kw in recent_text for kw in ["auto pay", "autopay", "auto-pay", "guardian"]):
            in_autopay_context = True

    # 0. CONTEXTUAL FOLLOW-UP: If in Auto-Pay context and user asks a follow-up about usage/functionality
    has_explicit_membership_topic = any(kw in q for kw in [
        "1 month", "3 month", "6 month", "12 month", "1m", "3m", "6m", "12m",
        "membership plan", "subscription plan", "pricing plan", "which plan", "pricing", "discount"
    ])

    if in_autopay_context and not has_explicit_membership_topic:
        is_followup_usage = any(kw in q for kw in [
            "what do i do with it", "how do i use it", "what can i do with it",
            "how does it help me", "can i use it", "what is it for", "how to use it",
            "what to do with it", "what do i do with this", "how do i use this",
            "how do i use auto", "what do i do with auto", "how to use auto"
        ]) or (
            any(p in q for p in ["it", "this", "that"]) and any(u in q for u in ["do", "use", "help", "work", "for", "can i"])
        )
        if is_followup_usage:
            return (
                "AI Guardian Auto-Pay allows you to seamlessly manage and automate library fine payments for your linked child.\n\n"
                "With Auto-Pay, you can:\n"
                "• Enable or pause automatic fine payments anytime.\n"
                "• Set a per-fine limit and a monthly spending limit to stay in control.\n"
                "• Allow AI to automatically settle eligible child fines within your safety limits.\n"
                "• Manually review and approve any payments that exceed limits or are blocked by safety checks.\n\n"
                "You can view and adjust all of these settings on the AI Guardian Auto-Pay page in your sidebar."
            )

    # 1. INTENT 8: Is Auto-Pay a subscription? (Static conceptual answer)
    if "subscription" in q and ("auto" in q or "pay" in q or "guardian" in q or in_autopay_context):
        return (
            "No. AI Guardian Auto-Pay is not a membership subscription or recurring 1/3/6/12-month payment plan.\n\n"
            "It is a bounded AI payment system for eligible library fines. You control the per-fine and monthly "
            "spending limits, and AI can only automatically settle payments that pass those safety rules."
        )

    # 2. INTENT 9: Turn Auto-Pay ON/OFF or pause (Static conceptual answer)
    if any(p in q for p in [
        "turn auto", "turn off auto", "turn on auto", "enable auto", "disable auto",
        "pause auto", "turn off", "turn on", "pause autopay", "toggle auto"
    ]) and ("pay" in q or "autopay" in q or "auto-pay" in q or in_autopay_context):
        return (
            "You can turn AI Guardian Auto-Pay on or pause it from the AI Guardian Auto-Pay page in your sidebar.\n\n"
            "Use the Auto-Pay toggle at the top of the page. When paused, AI will not automatically settle eligible fines."
        )

    # 3. PERSONALIZED POLICY QUERIES -> Bypass static RAG so LLM ReAct agent executes get_guardian_autopay_policy tool!
    # Examples: "how do i pay 400 fine then", "why didn't AI pay my fine", "how do i increase my fine limit", "change monthly limit", "my limit"
    amount_match = re.search(r"(?:pay|settle|for|of)?\s*(?:₹|rs\.?|inr)?\s*(\d+)\s*(?:fine|rupees|inr)?", q)
    has_amount = amount_match and int(amount_match.group(1)) > 0
    is_personalized_policy_query = (
        has_amount
        or any(k in q for k in [
            "increase", "change limit", "fine limit", "per-fine", "monthly limit", "my limit",
            "why didn't", "why was", "why did not", "blocked fine", "auto pay blocked", "than limit"
        ])
        or (in_autopay_context and ("then" in q or "how do i pay" in q or "limit" in q))
    )
    if is_personalized_policy_query:
        return None

    # 4. INTENT 1: What is AI Guardian Auto-Pay? (Static conceptual answer)
    if any(k in q for k in [
        "what is ai guardian auto-pay", "what is ai guardian auto pay", "what is auto-pay",
        "what is autopay", "what is auto pay", "in my side bar", "in my sidebar",
        "ai guardian auto pay", "ai guardian auto-pay", "guardian auto pay", "guardian autopay"
    ]) and ("how" not in q or "what is" in q):
        return (
            "AI Guardian Auto-Pay lets you allow AI to settle eligible library fines for your linked child "
            "automatically, while keeping strict spending limits under your control.\n\n"
            "You set a maximum amount AI can pay per fine and a monthly limit. Fines within those limits can "
            "be settled automatically. If a fine exceeds the limit, AI blocks the automatic payment and alerts "
            "you so you can review and approve it yourself.\n\n"
            "You can manage these controls from the AI Guardian Auto-Pay page in your sidebar."
        )

    # 5. INTENT 2: How does Auto-Pay work? (Static conceptual answer)
    if any(k in q for k in [
        "how does auto-pay work", "how does autopay work", "how does auto pay work",
        "how auto pay works", "how autopay works", "how auto-pay works"
    ]):
        return (
            "AI Guardian Auto-Pay evaluates each eligible child fine against your set policy limits (per-fine limit and monthly limit) and child safety status.\n\n"
            "• Within limit (e.g. ₹150 fine with ₹200 limit): AI checks policy and settles the fine automatically without requiring manual approval.\n"
            "• Exceeds limit (e.g. ₹250 fine with ₹200 limit): AI blocks the automatic payment, notifies you, and requires your manual review and approval."
        )

    # 6. RAG_KNOWLEDGE list fallback matching (e.g. generic fine question)
    for entry in RAG_KNOWLEDGE:
        if any(kw in q for kw in entry["keywords"]):
            return entry["answer"]

    return None
