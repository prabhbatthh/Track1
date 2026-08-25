-- Caches the AI-generated "what readers are saying" summary per book so it's computed
-- once per review-count change, not on every book-detail page load.
-- review_digest_review_count records how many reviews existed when the digest was last
-- generated — a mismatch with the book's current review count means it's stale.
ALTER TABLE "books" ADD COLUMN "review_digest" TEXT;
ALTER TABLE "books" ADD COLUMN "review_digest_review_count" INTEGER;
