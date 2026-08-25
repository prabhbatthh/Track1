-- CreateTable
CREATE TABLE IF NOT EXISTS "library_visits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "member_id" UUID NOT NULL,
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_out_at" TIMESTAMP(3),
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "library_visits_member_id_idx" ON "library_visits"("member_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "library_visits_checked_out_at_idx" ON "library_visits"("checked_out_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "library_visits_member_id_checked_out_at_idx" ON "library_visits"("member_id", "checked_out_at");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'library_visits_member_id_fkey') THEN
        ALTER TABLE "library_visits" ADD CONSTRAINT "library_visits_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'library_visits_recorded_by_id_fkey') THEN
        ALTER TABLE "library_visits" ADD CONSTRAINT "library_visits_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
