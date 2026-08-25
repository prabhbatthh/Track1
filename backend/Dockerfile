FROM python:3.12-slim

WORKDIR /app

# prisma generate below shells out to a Node runtime it downloads itself (to run
# `npm install prisma`) — that Node binary needs libatomic1, which python:3.12-slim
# doesn't ship. Without it the build fails inside prisma generate with "node: error
# while loading shared libraries: libatomic.so.1: cannot open shared object file".
RUN apt-get update && apt-get install -y --no-install-recommends libatomic1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

COPY prisma ./prisma
COPY src ./src
RUN uv sync --frozen --no-dev
RUN uv run prisma generate --schema prisma/schema.prisma

# Prisma's Python client shells out to a query-engine binary it downloads into this
# venv at `uv sync` time above — it has to be owned by the user that runs it, so this
# chown has to come after both dependency installs, not before.
RUN groupadd --system app && useradd --system --gid app --no-create-home app \
    && chown -R app:app /app
USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health/live', timeout=3)" || exit 1

# --proxy-headers makes uvicorn read the client address from X-Forwarded-For instead of
# reporting the proxy's own IP. Without it every request behind a load balancer shares
# one rate-limit bucket, which turns the brute-force limit into a way to lock out all
# users at once. FORWARDED_ALLOW_IPS must list only the proxies you actually run —
# trusting "*" lets any client spoof the header and bypass rate limiting entirely.
ENV FORWARDED_ALLOW_IPS="127.0.0.1"
CMD ["sh", "-c", "uv run uvicorn app.main:app --app-dir src --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips \"$FORWARDED_ALLOW_IPS\""]
