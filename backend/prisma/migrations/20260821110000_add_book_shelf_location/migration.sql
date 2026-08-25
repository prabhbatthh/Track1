-- Free-text physical shelf location (e.g. "Aisle 3, Shelf B") — display-only, not
-- searchable, so no index needed.
ALTER TABLE "books" ADD COLUMN "shelf_location" VARCHAR(120);
