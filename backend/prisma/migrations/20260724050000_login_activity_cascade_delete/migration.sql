-- AlterTable
ALTER TABLE "login_activity" DROP CONSTRAINT "login_activity_member_id_fkey";
ALTER TABLE "login_activity" ADD CONSTRAINT "login_activity_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
