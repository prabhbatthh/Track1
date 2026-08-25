from enum import StrEnum


class AuditAction(StrEnum):
    # The stored value is "expenseApproved" even though logging an expense is not an
    # approval — renaming it would split the audit log in two, because existing rows
    # keep the old value and the admin log UI, its filter tabs and the profile stats
    # all match on this exact string. Not worth a data migration for a label; if it
    # ever is, migrate the rows and update those consumers in the same change.
    EXPENSE_LOGGED = "expenseApproved"
    REFUND_ISSUED = "refundIssued"
    REFUND_REJECTED = "refundRejected"
    FEE_WAIVED = "feeWaived"
    FEE_WAIVER_REJECTED = "feeWaiverRejected"
    PRICING_PLAN_UPDATED = "pricingPlanUpdated"
    ANNOUNCEMENT_SENT = "announcementSent"
    COUPON_GENERATED = "couponGenerated"

    # Privileged non-financial actions. Everything above is about money; without these
    # the log could not answer "who made this account an admin" or "who cleared this
    # fine", which are the questions an audit trail exists for.
    MEMBER_ROLE_CHANGED = "memberRoleChanged"
    MEMBER_ACTIVATION_CHANGED = "memberActivationChanged"
    PERMISSION_REQUEST_GRANTED = "permissionRequestGranted"
    PERMISSION_REQUEST_DENIED = "permissionRequestDenied"
    FINE_MARKED_PAID = "fineMarkedPaid"
    COMMUNITY_USER_BANNED = "communityUserBanned"
    COMMUNITY_USER_UNBANNED = "communityUserUnbanned"
    LIBRARY_REVIEW_APPROVED = "libraryReviewApproved"
    LIBRARY_REVIEW_REJECTED = "libraryReviewRejected"
