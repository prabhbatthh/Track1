-- AI book insights cache (books/insights.py) and AI reading profile cache
-- (members/reading_profile.py). Both nullable, lazily populated on first request.
ALTER TABLE "books" ADD COLUMN "ai_insights" JSONB;
ALTER TABLE "users" ADD COLUMN "reading_profile" JSONB;
ALTER TABLE "users" ADD COLUMN "reading_profile_activity_count" INTEGER;
