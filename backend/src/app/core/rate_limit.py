from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import get_settings

_settings = get_settings()

# Counters live in Redis, not process memory. With in-memory storage every replica kept
# its own counter, so "5/minute" was really 5-per-minute *per instance* and reset on
# every deploy — the brute-force limit scaled with the fleet instead of holding.
#
# in_memory_fallback_enabled keeps a developer without Redis running (the limiter
# degrades to per-process counters) rather than failing every limited request. In
# production that fallback should never engage; alert on it if Redis goes away.
#
# Note this only works if the app sees the real client IP — uvicorn must run with
# --proxy-headers and a trusted --forwarded-allow-ips behind any proxy, or every
# request arrives from the proxy's address and shares one bucket (see the Dockerfile).
#
# Disabled only in isolated test/E2E environments. E2E still uses the real database
# lifecycle, but its browser workers share one loopback address and would otherwise
# trip the production brute-force limit while exercising unrelated pages.
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=_settings.redis_url,
    in_memory_fallback_enabled=True,
    enabled=_settings.app_env not in {"development", "test", "e2e"},
)
