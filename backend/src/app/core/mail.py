import asyncio
import logging
import smtplib
from email.message import EmailMessage

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# smtplib has no default timeout — without this a silent/unreachable SMTP host hangs
# the calling thread until the OS gives up, which used to mean the whole server.
SMTP_TIMEOUT_SECONDS = 10


def send_email(to: str, subject: str, body: str) -> None:
    settings = get_settings()

    if not settings.smtp_host:
        # ponytail: no SMTP configured — log instead of failing so the reminder
        # flow still works end-to-end in dev. Set SMTP_HOST/PORT/USER/PASSWORD/FROM
        # in .env to send for real.
        # Email bodies can contain password-reset bearer tokens. Never put the body
        # in application logs; a local mail sink is the appropriate way to inspect
        # development messages.
        logger.info("email not configured, skipping send: to=%s subject=%r", to, subject)
        return

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.smtp_from or settings.smtp_user
    message["To"] = to
    message.set_content(body)

    with smtplib.SMTP(
        settings.smtp_host, settings.smtp_port, timeout=SMTP_TIMEOUT_SECONDS
    ) as server:
        if settings.smtp_use_tls:
            server.starttls()
        if settings.smtp_user:
            server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(message)


async def send_email_async(to: str, subject: str, body: str) -> None:
    """Send off the event loop.

    send_email is blocking socket work — connect, STARTTLS, login, send — and calling it
    straight from async code froze the entire server for the duration, so every unrelated
    request queued behind it (a trivial /health/live was taking seconds). Hand it to a
    worker thread instead so only that thread waits.
    """
    await asyncio.to_thread(send_email, to, subject, body)
