-- AlterTable
ALTER TABLE "guardian_autopay_policies" ADD COLUMN "current_trust_tier" VARCHAR(30) NOT NULL DEFAULT 'BASELINE',
ADD COLUMN "effective_transaction_cap" INTEGER NOT NULL DEFAULT 200,
ADD COLUMN "last_trust_score_updated_at" TIMESTAMP(3);
