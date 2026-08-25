-- Publisher, filled by either manual entry or the cover-identification feature
-- (books/service.py::identify_cover) — the one catalog field the AI-fill flow needs
-- that the schema didn't already carry (title/author/isbn/description/publishedYear/
-- language/coverImageUrl all pre-existed).
ALTER TABLE "books" ADD COLUMN "publisher" VARCHAR(150);
