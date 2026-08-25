import re

# RAG knowledge base — static FAQ content the LLM can cite without hitting the DB.
# Each entry has keywords for fast intent matching and a text answer.

RAG_KNOWLEDGE: list[dict] = [
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
        "keywords": ["fine", "penalty", "overdue fee", "pay fine", "waive fine"],
        "answer": (
            "Fines are calculated per day overdue based on book type. "
            "To pay: open My Account → Fines & Payments → Pay Now. "
            "For waiver requests contact: pricing@readingclub.org"
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


def find_rag_answer(query: str) -> str | None:
    """Return the best matching RAG answer, or None if no match is confident enough."""
    # Skip RAG for action commands — let the LLM+tools handle them.
    if _ACTION_INTENT.match(query.strip()):
        return None
    q = query.lower()
    for entry in RAG_KNOWLEDGE:
        if any(kw in q for kw in entry["keywords"]):
            return entry["answer"]
    return None
