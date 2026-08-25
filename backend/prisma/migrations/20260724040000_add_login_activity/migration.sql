-- CreateTable
CREATE TABLE "login_activity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "member_id" UUID NOT NULL,
    "date" DATE NOT NULL,

    CONSTRAINT "login_activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "login_activity_member_id_date_key" ON "login_activity"("member_id", "date");

-- AddForeignKey
ALTER TABLE "login_activity" ADD CONSTRAINT "login_activity_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
