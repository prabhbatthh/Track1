-- Seed the 4 fixed pricing plans (1m/3m/6m/12m). This is reference data the app
-- depends on at runtime (guardian renewal flow, IT-head dashboard fee calculation),
-- but until now it was only populated by the optional scripts/seed_pricing_plans.py
-- script, which nothing enforced running — any environment where it was skipped
-- (CI, a fresh production deploy) silently broke those code paths instead of failing
-- loudly. ON CONFLICT DO NOTHING keeps this idempotent for environments already
-- seeded by the script, and never overwrites admin-edited price/save_percent,
-- matching the script's own upsert semantics.
INSERT INTO "pricing_plans" ("id", "plan_id", "months", "price", "save_percent", "badge")
VALUES
    (gen_random_uuid(), '1m', 1, 999, 0, NULL),
    (gen_random_uuid(), '3m', 3, 2697, 10, 'mostPopular'),
    (gen_random_uuid(), '6m', 6, 4915, 18, NULL),
    (gen_random_uuid(), '12m', 12, 8991, 25, 'bestValue')
ON CONFLICT ("plan_id") DO NOTHING;
