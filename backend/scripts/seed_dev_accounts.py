"""Seeds one real, loggable-in account per role for the Login page's dev-only
"Continue as <role>" preview buttons (see Login.tsx). Those buttons used to fake
local auth state with no real token, so every backend-backed feature (Community,
Reservations, ...) silently showed empty data under a previewed role. This gives
each role a real account so preview mode gets a real, working session instead.

Run from backend/: `uv run python scripts/seed_dev_accounts.py`
Safe to re-run — upserts by email, so it just resets the password each time.

This creates a loggable-in account for EVERY role, admin included, so it must never
touch a real environment: the guard below refuses to run unless APP_ENV is one of the
throwaway environments, and the password can be overridden with DEV_SEED_PASSWORD.
"""

import asyncio
import os
import sys

from app.core.config import get_settings
from app.core.constants import Role
from app.core.security import hash_password
from app.db.prisma import prisma

# The E2E suite (playwright.config.ts, frontend/tests/e2e/helpers.ts) logs in with this
# exact value, so it stays the default rather than becoming a required variable.
DEV_PASSWORD = os.environ.get("DEV_SEED_PASSWORD", "DevPreview123!")
DEV_EMAIL_DOMAIN = "devpreview.internal"
SEEDABLE_ENVIRONMENTS = {"development", "test", "e2e"}

ROLES = tuple(role.value for role in Role)


def _email(role: str) -> str:
    return f"{role}@{DEV_EMAIL_DOMAIN}"


DEV_AVATARS = {
    "admin": "admin_1.jpg",
    "manager": "staff_1.jpg",
    "member": "member_female9.jpg",
    "guardian": "member_male_7.jpg",
    "it-head": "it-head_1.jpg",
    "librarian": "staff_2.jpg",
}


async def main() -> None:
    settings = get_settings()
    if settings.app_env not in SEEDABLE_ENVIRONMENTS:
        sys.exit(
            f"refusing to seed known-password accounts with APP_ENV={settings.app_env!r} — "
            f"allowed only in {sorted(SEEDABLE_ENVIRONMENTS)}"
        )
    os.environ.setdefault("DATABASE_URL", settings.database_url)
    await prisma.connect()

    try:
        password_hash = hash_password(DEV_PASSWORD)
        for role_name in ROLES:
            role = await prisma.role.upsert(
                where={"name": role_name},
                data={"create": {"name": role_name}, "update": {}},
            )
            email = _email(role_name)
            avatar_url = DEV_AVATARS.get(role_name)
            await prisma.user.upsert(
                where={"email": email},
                data={
                    "create": {
                        "email": email,
                        "passwordHash": password_hash,
                        "fullName": f"Dev {role_name.title()} Preview",
                        "avatarUrl": avatar_url,
                        "roleId": role.id,
                    },
                    # E2E exercises account deactivation and token invalidation. Reset every
                    # mutable authentication guard so rerunning the seed always produces the
                    # same usable preview accounts instead of inheriting state from a prior run.
                    "update": {
                        "passwordHash": password_hash,
                        "avatarUrl": avatar_url,
                        "roleId": role.id,
                        "isActive": True,
                        "deletedAt": None,
                        "tokenVersion": 0,
                    },
                },
            )
            print(f"Seeded {email} ({role_name})")
    finally:
        await prisma.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
