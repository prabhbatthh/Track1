-- Only set for gateway-verified payments (POST /payments/razorpay/verify), never for
-- the direct POST /payments or pay-at-library paths. The unique constraint on
-- razorpay_payment_id makes a retried verify call (same still-valid signature, same
-- gateway payment ID) fail with a constraint violation instead of silently recording
-- the same money twice. Nullable + unique is safe here because Postgres treats
-- multiple NULLs as distinct, so the other two payment paths are unaffected.
ALTER TABLE "payments" ADD COLUMN "razorpay_payment_id" VARCHAR(64);
ALTER TABLE "payments" ADD COLUMN "razorpay_order_id" VARCHAR(64);

CREATE UNIQUE INDEX "payments_razorpay_payment_id_key" ON "payments"("razorpay_payment_id");
