"""One-off matcher: applies locally-downloaded cover images to matching books by
title, and copies matched files into frontend/public/covers/ so Vite serves them as
plain static assets (referenced by a short /covers/<file> path, not embedded base64 —
cover_image_url is capped at 2048 chars, too short for a data URL).

Source images live in assets/book covers/ and are named either "TITLE — AUTHOR
(YEAR).ext" (em dash, space-separated) or, for a handful of files, just "TITLE.ext" —
both are matched on title, with the author used to disambiguate only when the fuller
form provides one. Colons can't live in a Windows filename, so titles containing one
had theirs stripped when saved to disk — matching strips ":" from the DB title the
same way before comparing, so this isn't a real mismatch.

Only top-level files are considered; the "best/" and "New folder/" subfolders use
plain numeric filenames with no title info and can't be matched by name.

Safe to re-run — always overwrites with the current file for whatever matches; books
with no matching file are simply left with whatever cover_image_url they already had
(None, if this is the first run).

Run from backend/: `uv run python scripts/backfill_book_covers.py`
"""

import asyncio
import os
import re
import shutil
from pathlib import Path

from app.core.config import get_settings
from app.db.prisma import prisma

REPO_ROOT = Path(__file__).resolve().parents[2]
COVERS_SRC_DIR = REPO_ROOT / "assets" / "book covers"
COVERS_DEST_DIR = REPO_ROOT / "frontend" / "public" / "covers"
COVER_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

_FILENAME_RE = re.compile(r"^(?P<title>.+) — (?P<author>.+) \((?P<year>\d{4})\)$")
_ILLEGAL_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*]')
_WHITESPACE = re.compile(r"\s+")


def _normalize(text: str) -> str:
    """Same key for both sides of the match: strip characters Windows filenames
    can't hold (the reason the source titles were altered in the first place),
    normalize curly quotes to straight ones, collapse whitespace, casefold.
    """
    cleaned = _ILLEGAL_FILENAME_CHARS.sub("", text).replace("’", "'").replace("‘", "'")
    return _WHITESPACE.sub(" ", cleaned).strip().casefold()


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.casefold()).strip("-")
    return slug or "cover"


def _parse_filename(stem: str) -> tuple[str, str | None]:
    """ "TITLE — AUTHOR (YEAR)" gives an author to disambiguate a shared title with;
    a bare "TITLE" (no separator) doesn't, and is matched on title alone.
    """
    parsed = _FILENAME_RE.match(stem)
    if parsed:
        return parsed["title"], parsed["author"]
    return stem, None


async def main() -> None:
    settings = get_settings()
    os.environ.setdefault("DATABASE_URL", settings.database_url)
    await prisma.connect()

    try:
        cover_files = sorted(
            f
            for f in COVERS_SRC_DIR.iterdir()
            if f.is_file() and f.suffix.lower() in COVER_EXTENSIONS
        )
        books = await prisma.book.find_many(where={"deletedAt": None})

        by_normalized_title: dict[str, list] = {}
        for book in books:
            by_normalized_title.setdefault(_normalize(book.title), []).append(book)

        COVERS_DEST_DIR.mkdir(parents=True, exist_ok=True)

        matched = 0
        unmatched_files: list[str] = []
        ambiguous_files: list[str] = []

        for cover_file in cover_files:
            title, author = _parse_filename(cover_file.stem)

            candidates = by_normalized_title.get(_normalize(title), [])
            if len(candidates) > 1 and author is not None:
                # Same title, more than one book — disambiguate by author before
                # giving up, rather than guessing which one the cover belongs to.
                candidates = [b for b in candidates if _normalize(b.author) == _normalize(author)]

            if len(candidates) != 1:
                (ambiguous_files if candidates else unmatched_files).append(cover_file.name)
                continue

            book = candidates[0]
            dest_name = f"{_slugify(book.isbn or book.id)}{cover_file.suffix.lower()}"
            shutil.copyfile(cover_file, COVERS_DEST_DIR / dest_name)
            await prisma.book.update(
                where={"id": book.id}, data={"coverImageUrl": f"/covers/{dest_name}"}
            )
            matched += 1

        no_cover = await prisma.book.count(where={"deletedAt": None, "coverImageUrl": None})

        print(f"Matched and added covers for {matched}/{len(cover_files)} cover files.")
        if ambiguous_files:
            print(
                f"{len(ambiguous_files)} file(s) matched a title shared by multiple books "
                f"but not a unique author, skipped: {ambiguous_files}"
            )
        if unmatched_files:
            print(f"{len(unmatched_files)} file(s) had no matching book: {unmatched_files}")
        print(f"{no_cover}/{len(books)} books in the library still have no cover.")
    finally:
        await prisma.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
