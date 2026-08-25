-- CreateTable
CREATE TABLE "reading_goals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "member_id" UUID NOT NULL,
    "yearly_goal" INTEGER NOT NULL,
    "monthly_goal" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reading_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reading_goals_member_id_key" ON "reading_goals"("member_id");

-- AddForeignKey
ALTER TABLE "reading_goals" ADD CONSTRAINT "reading_goals_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
