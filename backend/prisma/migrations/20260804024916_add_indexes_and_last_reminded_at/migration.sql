-- AlterTable
ALTER TABLE "loans" ADD COLUMN     "last_reminded_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "audit_log_entries_actor_id_idx" ON "audit_log_entries"("actor_id");

-- CreateIndex
CREATE INDEX "audit_log_entries_created_at_idx" ON "audit_log_entries"("created_at");

-- CreateIndex
CREATE INDEX "billing_requests_member_id_idx" ON "billing_requests"("member_id");

-- CreateIndex
CREATE INDEX "billing_requests_created_by_id_idx" ON "billing_requests"("created_by_id");

-- CreateIndex
CREATE INDEX "billing_requests_decided_by_id_idx" ON "billing_requests"("decided_by_id");

-- CreateIndex
CREATE INDEX "billing_requests_status_idx" ON "billing_requests"("status");

-- CreateIndex
CREATE INDEX "book_records_book_id_idx" ON "book_records"("book_id");

-- CreateIndex
CREATE INDEX "book_records_logged_by_id_idx" ON "book_records"("logged_by_id");

-- CreateIndex
CREATE INDEX "community_comments_post_id_idx" ON "community_comments"("post_id");

-- CreateIndex
CREATE INDEX "community_comments_author_id_idx" ON "community_comments"("author_id");

-- CreateIndex
CREATE INDEX "community_comments_parent_id_idx" ON "community_comments"("parent_id");

-- CreateIndex
CREATE INDEX "community_post_likes_user_id_idx" ON "community_post_likes"("user_id");

-- CreateIndex
CREATE INDEX "community_post_saves_user_id_idx" ON "community_post_saves"("user_id");

-- CreateIndex
CREATE INDEX "community_posts_author_id_idx" ON "community_posts"("author_id");

-- CreateIndex
CREATE INDEX "community_posts_deleted_at_created_at_idx" ON "community_posts"("deleted_at", "created_at");

-- CreateIndex
CREATE INDEX "coupons_created_by_id_idx" ON "coupons"("created_by_id");

-- CreateIndex
CREATE INDEX "event_manager_assignments_manager_id_idx" ON "event_manager_assignments"("manager_id");

-- CreateIndex
CREATE INDEX "event_registrations_member_id_idx" ON "event_registrations"("member_id");

-- CreateIndex
CREATE INDEX "events_created_by_idx" ON "events"("created_by");

-- CreateIndex
CREATE INDEX "expenses_logged_by_id_idx" ON "expenses"("logged_by_id");

-- CreateIndex
CREATE INDEX "expenses_created_at_idx" ON "expenses"("created_at");

-- CreateIndex
CREATE INDEX "guardian_links_guardian_id_idx" ON "guardian_links"("guardian_id");

-- CreateIndex
CREATE INDEX "loans_member_id_idx" ON "loans"("member_id");

-- CreateIndex
CREATE INDEX "loans_book_id_idx" ON "loans"("book_id");

-- CreateIndex
CREATE INDEX "loans_created_by_id_idx" ON "loans"("created_by_id");

-- CreateIndex
CREATE INDEX "loans_returned_at_due_date_idx" ON "loans"("returned_at", "due_date");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_idx" ON "notifications"("user_id", "read");

-- CreateIndex
CREATE INDEX "payments_user_id_created_at_idx" ON "payments"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "permission_requests_requested_by_id_idx" ON "permission_requests"("requested_by_id");

-- CreateIndex
CREATE INDEX "permission_requests_decided_by_id_idx" ON "permission_requests"("decided_by_id");

-- CreateIndex
CREATE INDEX "permission_requests_status_idx" ON "permission_requests"("status");

-- CreateIndex
CREATE INDEX "reading_progress_book_id_idx" ON "reading_progress"("book_id");

-- CreateIndex
CREATE INDEX "reservations_member_id_idx" ON "reservations"("member_id");

-- CreateIndex
CREATE INDEX "reservations_book_id_status_created_at_idx" ON "reservations"("book_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "reviews_book_id_idx" ON "reviews"("book_id");

-- CreateIndex
CREATE INDEX "seat_bookings_member_id_idx" ON "seat_bookings"("member_id");

-- CreateIndex
CREATE INDEX "seat_bookings_date_hour_idx" ON "seat_bookings"("date", "hour");

-- CreateIndex
CREATE INDEX "seat_notify_requests_member_id_idx" ON "seat_notify_requests"("member_id");

-- CreateIndex
CREATE INDEX "support_tickets_raised_by_id_idx" ON "support_tickets"("raised_by_id");

-- CreateIndex
CREATE INDEX "support_tickets_resolved_by_id_idx" ON "support_tickets"("resolved_by_id");

-- CreateIndex
CREATE INDEX "support_tickets_status_idx" ON "support_tickets"("status");

-- CreateIndex
CREATE INDEX "users_role_id_deleted_at_idx" ON "users"("role_id", "deleted_at");
