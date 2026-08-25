"""
Redis-backed chat history store.

Each user gets a Redis list key:  chat:history:<member_id>
Each entry is a JSON object: {"role": "user"|"assistant", "content": "..."}

Only the last MAX_TURNS turn-pairs (user + assistant = 1 turn) are kept.
The key expires after TTL seconds of inactivity, resetting on every write.
"""

from __future__ import annotations

import json

import redis.asyncio as aioredis

from app.core.config import get_settings
from app.modules.chat.schemas import ChatMessage

_redis: aioredis.Redis | None = None


def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        s = get_settings()
        _redis = aioredis.from_url(s.redis_url, decode_responses=True)
    return _redis


def _key(member_id: str) -> str:
    return f"chat:history:{member_id}"


async def load_history(member_id: str) -> list[ChatMessage]:
    """Return the last MAX_TURNS * 2 messages (user + assistant pairs)."""
    s = get_settings()
    r = _get_redis()
    raw = await r.lrange(_key(member_id), 0, -1)
    messages = [ChatMessage(**json.loads(item)) for item in raw]
    # Keep only the last max_turns pairs (each pair = 2 messages)
    limit = s.chat_history_max_turns * 2
    return messages[-limit:] if len(messages) > limit else messages


async def append_turn(member_id: str, user_msg: str, assistant_msg: str) -> None:
    """Append a user+assistant turn and reset the TTL."""
    s = get_settings()
    r = _get_redis()
    key = _key(member_id)

    pipe = r.pipeline()
    pipe.rpush(key, json.dumps({"role": "user", "content": user_msg}))
    pipe.rpush(key, json.dumps({"role": "assistant", "content": assistant_msg}))
    # Trim to max_turns * 2 messages from the right (most recent)
    limit = s.chat_history_max_turns * 2
    pipe.ltrim(key, -limit, -1)
    pipe.expire(key, s.chat_history_ttl_seconds)
    await pipe.execute()


async def clear_history(member_id: str) -> None:
    """Delete the conversation history for a user."""
    await _get_redis().delete(_key(member_id))
