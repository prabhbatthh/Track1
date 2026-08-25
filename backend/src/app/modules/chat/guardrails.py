"""
Guardrails for the chat pipeline.

Input guardrails  — checked BEFORE sending to the LLM:
  - Off-topic detection  : blocks questions unrelated to the library platform.
  - Harmful content      : blocks violence, hate, self-harm, illegal activity.
  - Prompt injection     : blocks attempts to override the system prompt.
  - PII submission       : warns and strips obvious PII from the user message.

Output guardrails — checked AFTER the LLM responds:
  - PII leakage          : redacts phone numbers, emails, Aadhaar, card numbers.
  - Harmful content      : replaces unsafe responses with a safe fallback.
"""

from __future__ import annotations

import re

# ── Compiled patterns ─────────────────────────────────────────────────────────

# Harmful / unsafe topics
_HARMFUL = re.compile(
    r"\b("
    r"kill|murder|suicide|self.harm|bomb|weapon|explosive|poison|drug|hack|"
    r"crack|exploit|malware|ransomware|phish|ddos|doxx|stalk|rape|abuse|"
    r"terrorist|jihad|extremis|genocide|traffick|launder|counterfeit|fraud"
    r")\b",
    re.IGNORECASE,
)

# Prompt injection attempts
_INJECTION = re.compile(
    r"(ignore (previous|above|all) instructions?|"
    r"you are now|forget (your|the) (instructions?|rules?|prompt)|"
    r"act as (a |an )?(different|new|unrestricted|evil|jailbreak)|"
    r"disregard (your|the) (system |previous )?prompt|"
    r"pretend (you are|to be)|"
    r"new persona|override (system|instructions?)|"
    r"do anything now|dan mode|developer mode)",
    re.IGNORECASE,
)

# Off-topic: clearly nothing to do with a library / reading platform
_OFF_TOPIC = re.compile(
    r"\b("
    r"stock market|crypto|bitcoin|forex|trading|invest|nse|bse|sensex|nifty|"
    r"cricket score|ipl|football|soccer|nba|nfl|sports bet|casino|gambling|"
    r"recipe|cook|restaurant|food deliver|zomato|swiggy|uber eats|"
    r"weather forecast|horoscope|astrology|zodiac|"
    r"dating|tinder|bumble|matrimon|"
    r"movie ticket|concert ticket|flight|hotel book|travel package|"
    r"coding interview|leetcode|competitive programming|"
    r"write (my |an? )?(essay|assignment|homework|thesis|dissertation)|"
    r"do my homework|complete my assignment"
    r")\b",
    re.IGNORECASE,
)

# PII patterns for detection and redaction
_PII_PATTERNS: list[tuple[re.Pattern, str]] = [
    # Indian mobile numbers (10 digits starting 6-9) — not preceded by digits (avoids dates/amounts)
    (re.compile(r"(?<!\d)[6-9]\d{9}(?!\d)"), "<phone>"),
    # International phone with explicit + prefix (avoids matching dates/amounts)
    (re.compile(r"\+\d[\d\s\-().]{8,}\d"), "<phone>"),
    # Email addresses
    (re.compile(r"\b[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}\b"), "<email>"),
    # Aadhaar (12 digits, optionally spaced in groups of 4) — not ISO dates
    (re.compile(r"(?<![-\d])\d{4}[\s]\d{4}[\s]\d{4}(?![-\d])"), "<aadhaar>"),
    # Credit/debit card (16 digits, optionally space/dash separated) — strict groups
    (re.compile(r"\b\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}\b"), "<card-number>"),
    # PAN card (India)
    (re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"), "<pan>"),
    # Passwords typed literally
    (re.compile(r"\b(password|passwd|pwd)\s*[:=]\s*\S+", re.IGNORECASE), "<redacted-credential>"),
]


# ── Input guardrail ───────────────────────────────────────────────────────────


class GuardrailBlock(Exception):
    """Raised when a message should be blocked entirely."""

    def __init__(self, reply: str) -> None:
        self.reply = reply


def contains_harmful_content(text: str) -> bool:
    """Public wrapper around the same pattern chat input is already screened against —
    reused by community moderation to auto-flag a new post/comment for the moderator
    queue instead of blocking it outright (unlike a chat message, a member's own post
    can't just be silently refused, so it gets a human review instead of a hard stop).
    """
    return bool(_HARMFUL.search(text))


def check_input(message: str) -> str:
    """
    Validate and sanitise the user message.

    Returns the (possibly PII-stripped) message to forward to the LLM.
    Raises GuardrailBlock with a user-facing reply if the message must be blocked.
    """
    if _INJECTION.search(message):
        raise GuardrailBlock(
            "I'm Shelfie, your library assistant. I can't follow instructions that ask me "
            "to change my behaviour or ignore my guidelines."
        )

    if _HARMFUL.search(message):
        raise GuardrailBlock(
            "I'm only able to help with library-related topics such as books, events, "
            "seat bookings, loans, and your reading progress. "
            "I can't assist with that request."
        )

    if _OFF_TOPIC.search(message):
        raise GuardrailBlock(
            "That's outside what I can help with! I'm Shelfie, your Community Reading Club "
            "assistant. Ask me about books, events, reservations, seat bookings, fines, "
            "your reading progress, or anything else related to the library."
        )

    # Strip PII before forwarding — don't block, just redact
    sanitised = message
    for pattern, placeholder in _PII_PATTERNS:
        sanitised = pattern.sub(placeholder, sanitised)

    return sanitised


# ── Output guardrail ──────────────────────────────────────────────────────────

_SAFE_FALLBACK = (
    "I'm sorry, I wasn't able to generate a safe response for that. "
    "Please try rephrasing your question about the library."
)


# Narrower harmful pattern for output — avoids false positives on library data
# (e.g. "crack" in book titles, "fraud" in support ticket descriptions)
_HARMFUL_OUTPUT = re.compile(
    r"\b("
    r"suicide|self.harm|bomb|weapon|explosive|malware|ransomware|phish|ddos|"
    r"doxx|stalk|rape|terrorist|jihad|extremis|genocide|traffick|launder|counterfeit"
    r")\b",
    re.IGNORECASE,
)


def check_output(response: str) -> str:
    """
    Sanitise the LLM response before returning it to the user.

    - Redacts any PII that slipped through.
    - Replaces the whole response if harmful content is detected.
    """
    if _HARMFUL_OUTPUT.search(response):
        return _SAFE_FALLBACK

    sanitised = response
    for pattern, placeholder in _PII_PATTERNS:
        sanitised = pattern.sub(placeholder, sanitised)

    return sanitised
