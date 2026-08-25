-- CreateTable
CREATE TABLE "community_post_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_post_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_comment_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "comment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_comment_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "community_post_reports_user_id_idx" ON "community_post_reports"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "community_post_reports_post_id_user_id_key" ON "community_post_reports"("post_id", "user_id");

-- CreateIndex
CREATE INDEX "community_comment_reports_user_id_idx" ON "community_comment_reports"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "community_comment_reports_comment_id_user_id_key" ON "community_comment_reports"("comment_id", "user_id");

-- AddForeignKey
ALTER TABLE "community_post_reports" ADD CONSTRAINT "community_post_reports_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_post_reports" ADD CONSTRAINT "community_post_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_comment_reports" ADD CONSTRAINT "community_comment_reports_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "community_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_comment_reports" ADD CONSTRAINT "community_comment_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
