-- CreateTable
CREATE TABLE "book_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "book_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "note" TEXT,
    "logged_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_records_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "book_records" ADD CONSTRAINT "book_records_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_records" ADD CONSTRAINT "book_records_logged_by_id_fkey" FOREIGN KEY ("logged_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
