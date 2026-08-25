-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "loan_id" UUID,
ALTER COLUMN "status" SET DEFAULT 'pending';

-- CreateIndex
CREATE UNIQUE INDEX "reservations_loan_id_key" ON "reservations"("loan_id");

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Pre-existing rows used "active" to mean "member currently holds this reservation" —
-- the closest equivalent under the new pending/approved/rejected/cancelled lifecycle.
UPDATE "reservations" SET "status" = 'approved' WHERE "status" = 'active';
