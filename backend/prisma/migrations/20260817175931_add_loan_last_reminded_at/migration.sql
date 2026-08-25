-- DropIndex
DROP INDEX "audit_log_entries_actor_id_idx";

-- DropIndex
DROP INDEX "audit_log_entries_created_at_idx";

-- DropIndex
DROP INDEX "billing_requests_created_by_id_idx";

-- DropIndex
DROP INDEX "billing_requests_decided_by_id_idx";

-- DropIndex
DROP INDEX "billing_requests_member_id_idx";

-- DropIndex
DROP INDEX "billing_requests_status_idx";

-- DropIndex
DROP INDEX "book_records_book_id_idx";

-- DropIndex
DROP INDEX "book_records_logged_by_id_idx";

-- DropIndex
DROP INDEX "community_comments_author_id_idx";

-- DropIndex
DROP INDEX "community_comments_parent_id_idx";

-- DropIndex
DROP INDEX "community_comments_post_id_idx";

-- DropIndex
DROP INDEX "community_post_likes_user_id_idx";

-- DropIndex
DROP INDEX "community_post_saves_user_id_idx";

-- DropIndex
DROP INDEX "community_posts_author_id_idx";

-- DropIndex
DROP INDEX "community_posts_deleted_at_created_at_idx";

-- DropIndex
DROP INDEX "coupons_created_by_id_idx";

-- DropIndex
DROP INDEX "event_manager_assignments_manager_id_idx";

-- DropIndex
DROP INDEX "event_registrations_member_id_idx";

-- DropIndex
DROP INDEX "events_created_by_idx";

-- DropIndex
DROP INDEX "expenses_created_at_idx";

-- DropIndex
DROP INDEX "expenses_logged_by_id_idx";

-- DropIndex
DROP INDEX "guardian_links_guardian_id_idx";

-- DropIndex
DROP INDEX "loans_book_id_idx";

-- DropIndex
DROP INDEX "loans_created_by_id_idx";

-- DropIndex
DROP INDEX "loans_due_date_idx";

-- DropIndex
DROP INDEX "loans_member_id_idx";

-- DropIndex
DROP INDEX "loans_returned_at_due_date_idx";

-- DropIndex
DROP INDEX "notifications_user_id_created_at_idx";

-- DropIndex
DROP INDEX "notifications_user_id_read_idx";

-- DropIndex
DROP INDEX "permission_requests_decided_by_id_idx";

-- DropIndex
DROP INDEX "permission_requests_requested_by_id_idx";

-- DropIndex
DROP INDEX "permission_requests_status_idx";

-- DropIndex
DROP INDEX "reading_progress_book_id_idx";

-- DropIndex
DROP INDEX "reservations_book_id_status_created_at_idx";

-- DropIndex
DROP INDEX "reservations_member_id_idx";

-- DropIndex
DROP INDEX "reviews_book_id_idx";

-- DropIndex
DROP INDEX "seat_bookings_date_hour_idx";

-- DropIndex
DROP INDEX "seat_bookings_member_id_idx";

-- DropIndex
DROP INDEX "seat_notify_requests_member_id_idx";

-- DropIndex
DROP INDEX "support_tickets_raised_by_id_idx";

-- DropIndex
DROP INDEX "support_tickets_resolved_by_id_idx";

-- DropIndex
DROP INDEX "support_tickets_status_idx";

-- DropIndex
DROP INDEX "users_role_id_deleted_at_idx";
