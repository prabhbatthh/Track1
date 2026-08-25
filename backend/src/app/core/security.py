from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.core.config import get_settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def _encode(payload: dict) -> str:
    settings = get_settings()
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: str) -> str:
    settings = get_settings()
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    return _encode({"sub": user_id, "type": "access", "exp": expires_at})


def create_refresh_token(user_id: str, token_version: int) -> str:
    settings = get_settings()
    expires_at = datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)
    return _encode({"sub": user_id, "type": "refresh", "ver": token_version, "exp": expires_at})


def create_reset_token(user_id: str, token_version: int) -> str:
    settings = get_settings()
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.reset_token_expire_minutes)
    return _encode({"sub": user_id, "type": "reset", "ver": token_version, "exp": expires_at})


def decode_token(token: str) -> dict:
    """Decode and verify a JWT's signature/expiry. Callers must still check
    payload["type"] themselves — this does not distinguish access vs refresh."""
    settings = get_settings()
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
