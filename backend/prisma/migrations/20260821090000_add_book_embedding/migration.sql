-- Cached embedding vector for the "You may also like" similarity ranking
-- (books/embeddings.py). Defaults to '{}' so existing create-book callers that don't
-- pass it keep working; lazily backfilled on first read or by
-- scripts/backfill_book_embeddings.py.
ALTER TABLE "books" ADD COLUMN "embedding" DOUBLE PRECISION[] NOT NULL DEFAULT '{}';
