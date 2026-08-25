#!/bin/sh
# Shared by post-merge and post-checkout. Regenerates the local Prisma client
# (`prisma.models.*`) whenever backend/prisma/schema.prisma changed between the two
# commits given as $1 (before) and $2 (after) — e.g. a teammate's PR adding a model
# lands via `git pull`, and the client goes stale until this runs.
#
# This is deliberately scoped to the client only, not migrations: applying pending
# migrations already happens automatically on every backend startup (see
# backend/src/app/main.py's AUTO_MIGRATE / lifespan), regardless of how the server is
# launched. Client codegen has no equivalent automatic hook inside the app itself — it
# has to happen before Python ever imports `prisma.models`, which is before the app's
# own startup code runs at all.
set -eu

before="$1"
after="$2"

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if ! git diff --quiet "$before" "$after" -- backend/prisma/schema.prisma 2>/dev/null; then
    echo ""
    echo "backend/prisma/schema.prisma changed -- regenerating the Prisma client..."
    if command -v make >/dev/null 2>&1; then
        make db-generate
    else
        (cd backend && uv run prisma generate --schema prisma/schema.prisma)
    fi
    echo "Prisma client regenerated."
fi
