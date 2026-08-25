-- CreateTable
CREATE TABLE "pricing_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "plan_id" VARCHAR(10) NOT NULL,
    "months" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "save_percent" INTEGER NOT NULL DEFAULT 0,
    "badge" VARCHAR(20),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pricing_plans_plan_id_key" ON "pricing_plans"("plan_id");
