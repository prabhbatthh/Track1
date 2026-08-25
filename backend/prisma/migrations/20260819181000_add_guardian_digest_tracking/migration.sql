-- Tracks when a guardian last received their monthly reading-summary notification for
-- this child, so the digest sweep (same pattern as loans.last_reminded_at) sends at
-- most once per calendar month instead of re-notifying on every server restart.
ALTER TABLE "guardian_links" ADD COLUMN "last_digest_sent_at" TIMESTAMP(3);
