/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';

import type { Book } from '@/features/books/types';
import * as reviewsApi from '@/features/reviews/api';
import type { BookReviews, RatingBreakdownEntry, Review, ReviewPayload } from '@/features/reviews/types';
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  registerRefreshHandler,
  type TokenResponse,
} from '@/lib/api';
import { useLocalStorageState } from '@/lib/useLocalStorageState';

// Re-exported so existing `import { BookReviews } from '@/providers/AuthProvider'` call sites
// keep working — the types now live in features/reviews/types.ts.
export type { BookReviews, RatingBreakdownEntry, Review, ReviewPayload };

// The "simple list" views (payments, community feed, loan history, audit log) want every
// row, not a UI page at a time — but the backend only ever returns one page. This walks
// pages until they're exhausted instead of requesting a single large page and silently
// dropping anything past it.
async function fetchAllPages<T>(path: string, token: string, pageSize = 200): Promise<T[]> {
  const items: T[] = [];
  const separator = path.includes('?') ? '&' : '?';
  for (let page = 1; ; page += 1) {
    const res = await apiGet<{ items: T[]; total: number }>(
      `${path}${separator}page=${page}&page_size=${pageSize}`,
      token,
    );
    items.push(...res.items);
    if (items.length >= res.total || res.items.length < pageSize) break;
  }
  return items;
}

export type Role = 'admin' | 'member' | 'manager' | 'it-head' | 'guardian' | 'librarian';

export interface RegisterPayload {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  role?: Role;
  avatar_url?: string;
}

export interface CompleteProfilePayload {
  full_name: string;
  phone: string;
  password: string;
}

export interface UpdateProfilePayload {
  full_name?: string;
  phone?: string;
  password?: string;
  // Required by the backend when `password` is set on an account that already has
  // one. Omitted only by CompleteProfileModal, where the Google account has none yet.
  current_password?: string;
  avatar_url?: string;
}

export interface PaymentPayload {
  amount: number;
  label: string;
  plan_months?: number;
  coupon_code?: string;
}

export interface PaymentRecord {
  id: string;
  amount: number;
  label: string;
  status: string;
  created_at: string;
}

export interface RazorpayOrder {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  label: string;
}

export interface RazorpayVerifyPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface Membership {
  plan_label: string;
  purchased_at: string;
  expires_at: string;
  is_active: boolean;
}

export interface ReadingProgressEntry {
  id: string;
  book_id: string;
  book_title: string;
  status: 'reading' | 'completed';
  percent_complete: number;
  updated_at: string;
}

export interface GuardianChild {
  id: string;
  full_name: string;
  email: string;
  currently_reading: ReadingProgressEntry[];
  completed: ReadingProgressEntry[];
  outstanding_fine: number;
  fine_book_title: string | null;
  fine_due_date: string | null;
  subscription_expires_on: string | null;
}

export interface ReadingGoalPayload {
  yearly_goal: number;
  monthly_goal: number;
}

export interface ReadingGoal {
  yearly_goal: number;
  monthly_goal: number;
  books_completed_this_year: number;
  books_completed_this_month: number;
  updated_at: string;
}

export interface ReadingStreak {
  current_streak_days: number;
  longest_streak_days: number;
}

export interface LeaderboardEntry {
  rank: number;
  member_id: string;
  full_name: string;
  avatar_url?: string | null;
  score: number;
  books_completed: number;
  reviews_count: number;
  reading_streak: number;
  badges: string[];
  is_current_user: boolean;
}

export interface Reservation {
  id: string;
  book_id: string;
  book_title: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  due_date: string | null;
  created_at: string;
  queue_position: number | null;
  eta_days: number | null;
}

export interface PostComment {
  id: string;
  author_id: string;
  author_name: string;
  author_avatar_url: string | null;
  content: string;
  created_at: string;
  reported: boolean;
  reported_by_me?: boolean;
  replies: PostComment[];
}

export interface CommunityPost {
  id: string;
  author_id: string;
  author_name: string;
  author_avatar_url: string | null;
  book_title: string | null;
  content: string;
  images: string[];
  created_at: string;
  like_count: number;
  is_liked: boolean;
  is_saved: boolean;
  is_own: boolean;
  reported: boolean;
  reported_by_me?: boolean;
  comments: PostComment[];
}

export interface CommunityPostPayload {
  book_title?: string | null;
  content: string;
  images: string[];
}

export interface AddCommentPayload {
  content: string;
  parent_id?: string | null;
}

export interface BannedAuthor {
  user_id: string;
  full_name: string;
}

export type SeatSlotStatus = 'available' | 'reserved' | 'booked_by_me' | 'booked_for_child';

export interface SeatSlot {
  seat_label: string;
  status: SeatSlotStatus;
  booking_id: string | null;
  // Populated when status === 'reserved', 'booked_by_me', or 'booked_for_child' — the avatar of whoever
  // holds that seat (someone else, you, or your child), shown in place of a plain color swatch.
  booked_by_avatar_url: string | null;
  booked_for_child_id?: string | null;
  booked_for_child_name?: string | null;
  booked_by_guardian_id?: string | null;
  booked_by_guardian_name?: string | null;
}

export interface SeatSchedule {
  date: string;
  hour: number;
  seats: SeatSlot[];
}

export interface SeatSlotPayload {
  seat_label: string;
  date: string;
  hour: number;
}

export interface SeatBookingRecord {
  id: string;
  seat_label: string;
  date: string;
  hour: number;
  created_at: string;
}

export interface AppNotificationRecord {
  id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
}

export interface LibraryVisitRecord {
  id: string;
  member_id: string;
  member_name: string;
  member_email: string;
  checked_in_at: string;
  checked_out_at: string | null;
  recorded_by_id: string;
  recorded_by_name: string | null;
  is_currently_inside: boolean;
}

export interface MemberVisitStatus {
  member_id: string;
  is_in_library: boolean;
  checked_in_at: string | null;
  last_checked_out_at: string | null;
  latest_visit_id: string | null;
}

export interface ChildVisitStatus {
  child_id: string;
  child_name: string;
  child_email: string;
  is_in_library: boolean;
  checked_in_at: string | null;
  last_checked_out_at: string | null;
}

export type ExpenseCategory = 'staffSalaries' | 'bookProcurement' | 'utilities' | 'marketing';

export interface AdminTrend {
  direction: 'up' | 'down';
  percent: number;
}

export interface AdminStats {
  revenue_mtd: number;
  revenue_trend: AdminTrend;
  expenses_mtd: number;
  expenses_trend: AdminTrend;
  net_profit_mtd: number;
  net_profit_trend: AdminTrend;
  total_members: number;
  total_members_trend: AdminTrend;
}

export interface RevenueSource {
  source: 'membershipFees' | 'eventTickets' | 'finesCollected' | 'donationsValue';
  amount: number;
}

export interface BudgetCategory {
  category: ExpenseCategory;
  budgeted: number;
  spent: number;
}

export interface AdminSeatStatus {
  available: number;
  booked: number;
  total: number;
}

export interface AdminSeatOccupancySlot {
  hour: number;
  percent_filled: number;
}

export interface AdminDashboard {
  stats: AdminStats;
  cash_flow: RevenueSource[];
  budget: BudgetCategory[];
  seat_status: AdminSeatStatus;
  seat_occupancy: AdminSeatOccupancySlot[];
}

export interface AuditLogEntry {
  id: string;
  actor_id: string;
  actor_name: string;
  actor_role: Role;
  action: string;
  params: Record<string, string | number>;
  created_at: string;
}

export interface AdminMemberRecord {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  is_active: boolean;
  joined_at: string;
  last_payment_amount: number | null;
  last_payment_label: string | null;
  last_payment_at: string | null;
  plan_label: string | null;
  plan_expires_at: string | null;
  plan_is_active: boolean;
  books_reading: number;
  books_completed: number;
  reported: boolean;
  event_registrations: number;
}

export interface AdminMemberUpdatePayload {
  role_name?: string;
  is_active?: boolean;
}

export interface AdminMemberListResponse {
  items: AdminMemberRecord[];
  total: number;
  page: number;
  page_size: number;
}

export type AdminMemberStatusFilter = 'active' | 'inactive';
export type AdminMemberSortBy = 'name' | 'joined' | 'role';
export type SortDirection = 'asc' | 'desc';

export interface AdminMemberQuery {
  search?: string;
  page?: number;
  page_size?: number;
  role?: Role;
  status?: AdminMemberStatusFilter;
  sort_by?: AdminMemberSortBy;
  sort_dir?: SortDirection;
}

export interface AdminPaymentRecord {
  id: string;
  member_id: string;
  member_name: string;
  member_email: string;
  amount: number;
  label: string;
  status: string;
  plan_months: number | null;
  created_at: string;
}

export interface AdminPaymentListResponse {
  items: AdminPaymentRecord[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminPaymentQuery {
  search?: string;
  month?: string;
  page?: number;
  page_size?: number;
}

export type SupportTicketCategory =
  | 'book_reservation'
  | 'payment'
  | 'seat_booking'
  | 'harassment'
  | 'offline_library'
  | 'attendance'
  | 'other';

export type SupportTicketStatus = 'open' | 'resolved' | 'closed';

export interface SupportTicketRecord {
  id: string;
  category: SupportTicketCategory;
  description: string;
  status: SupportTicketStatus;
  raised_by_id: string;
  raised_by_name: string;
  raised_by_role: Role;
  resolution_note: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type BookRecordType = 'lost' | 'donated' | 'purchased';

export interface BookRecordEntry {
  id: string;
  book_id: string;
  book_title: string;
  type: BookRecordType;
  note: string | null;
  logged_by_name: string;
  created_at: string;
}

export interface BookRecordPayload {
  book_id: string;
  type: BookRecordType;
  note?: string;
}

export interface SupportTicketPayload {
  category: SupportTicketCategory;
  description: string;
}

export type RecommendationQuestionId = 'author' | 'era' | 'story_type' | 'popularity';

export interface RecommendationQuizOption {
  id: string;
  label: string;
}

export interface RecommendationQuizQuestion {
  id: RecommendationQuestionId;
  prompt: string;
  options: RecommendationQuizOption[];
}

export interface RecommendationQuiz {
  questions: RecommendationQuizQuestion[];
}

// Partial — a question the member skipped (or that wasn't offered) simply isn't a key
// here; the backend treats a missing answer the same as an explicit "no preference".
export type RecommendationAnswers = Partial<Record<RecommendationQuestionId, string | string[]>>;

export interface RecommendationItem {
  book: Book;
  score: number;
  reasons: string[];
}

export interface RecommendationResult {
  items: RecommendationItem[];
  relaxed: boolean;
  message: string;
}

export interface ResolveTicketPayload {
  resolution_note: string;
}

export interface MemberRole {
  id: string;
  name: string;
}

export interface MemberRecord {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  role: MemberRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberListResponse {
  items: MemberRecord[];
  total: number;
  page: number;
  page_size: number;
}

export interface MemberListQuery {
  search?: string;
  role?: string;
  active_only?: boolean;
  page?: number;
  page_size?: number;
}

export interface PermissionRequestPayload {
  permission: string;
  reason: string;
}

export interface PermissionRequestRecord {
  id: string;
  permission: string;
  reason: string;
  status: string;
  requested_by_id: string;
  requested_by_name: string;
  decided_by_name: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface LoanPayload {
  book_id: string;
  member_id: string;
}

export interface LoanRecord {
  id: string;
  book_id: string;
  book_title: string;
  member_id: string;
  member_name: string;
  borrowed_at: string;
  due_date: string;
  returned_at: string | null;
  days_late: number;
  fine_amount: number;
  fine_paid: boolean;
  status: 'active' | 'overdue' | 'returned';
}

export interface ITHeadStats {
  active_members: number;
  active_members_trend: AdminTrend;
  open_issues: number;
  open_issues_delta: number;
  pending_permissions: number;
  pending_permissions_delta: number;
  fees_outstanding: number;
  fees_outstanding_trend: AdminTrend;
  late_fines_outstanding: number;
  late_fines_outstanding_trend: AdminTrend;
}

export interface FeeStatusEntryRecord {
  member_id: string;
  member_name: string;
  amount_due: number;
  status: 'paid' | 'due' | 'overdue';
  due_date: string | null;
}

export interface FeeCollectionMonth {
  month: string;
  collected: number;
  pending: number;
}

export interface IssueResolutionMonth {
  month: string;
  resolved: number;
  open: number;
  other: number;
}

export interface SystemActivityDay {
  date: string;
  logins: number;
  access_changes: number;
  permissions_updated: number;
}

export interface SystemActivitySummary {
  logins_total: number;
  logins_trend: AdminTrend;
  access_changes_total: number;
  access_changes_trend: AdminTrend;
  permissions_updated_total: number;
  permissions_updated_trend: AdminTrend;
}

export interface RoleBreakdownEntry {
  role: string;
  count: number;
  percent: number;
}

export interface ITHeadAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info' | 'success';
  title: string;
  description: string;
}

export interface ITHeadDashboard {
  stats: ITHeadStats;
  fee_status: FeeStatusEntryRecord[];
  fee_collections: FeeCollectionMonth[];
  issue_resolution: IssueResolutionMonth[];
  system_activity: SystemActivityDay[];
  system_activity_summary: SystemActivitySummary;
  access_by_role: RoleBreakdownEntry[];
  alerts: ITHeadAlert[];
}

export interface ExpensePayload {
  category: ExpenseCategory;
  amount: number;
}

export interface PricingPlan {
  id: string;
  plan_id: string;
  months: number;
  price: number;
  save_percent: number;
  badge: 'mostPopular' | 'bestValue' | null;
  updated_at: string;
}

export interface PricingPlanUpdatePayload {
  price: number;
  save_percent: number;
}

export interface Coupon {
  id: string;
  code: string;
  discount_percent: number;
  max_uses: number;
  uses_count: number;
  created_at: string;
}

export interface CouponPayload {
  discount_percent: number;
  max_uses: number;
}

export interface CouponValidation {
  code: string;
  discount_percent: number;
}

export interface CreateMemberPayload {
  full_name: string;
  email: string;
  phone?: string;
  password: string;
}

export interface CreatedMember {
  id: string;
  full_name: string;
  email: string;
}

export interface AnnouncementPayload {
  message: string;
}

export interface AnnouncementResult {
  recipient_count: number;
}

export interface RevenueByPlanItem {
  label: string;
  amount: number;
  count: number;
}

export interface RevenueByPlanReport {
  items: RevenueByPlanItem[];
  total: number;
}

export interface MonthlyFigure {
  month: string;
  revenue: number;
  expenses: number;
  net_profit: number;
}

export interface ProfitAndLossReport {
  months: MonthlyFigure[];
  total_revenue: number;
  total_expenses: number;
  total_net_profit: number;
}

export interface ExpenseBreakdownItem {
  category: ExpenseCategory;
  amount: number;
  percent: number;
}

export interface ExpenseBreakdownReport {
  items: ExpenseBreakdownItem[];
  total: number;
}

export interface MembershipGrowthMonth {
  month: string;
  new_members: number;
  total_members: number;
}

export interface MembershipGrowthReport {
  months: MembershipGrowthMonth[];
}

export type BillingRequestType = 'refund' | 'fee_waiver';

export interface BillingRequestPayload {
  member_id: string;
  type: BillingRequestType;
  amount: number;
  reason: string;
}

export interface WaiveFinePayload {
  member_id: string;
  amount: number;
  reason: string;
}

export interface BillingRequestRecord {
  id: string;
  type: BillingRequestType;
  amount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  member_id: string;
  member_name: string;
  created_by_name: string;
  created_at: string;
  decided_at: string | null;
}

export interface LibraryReviewPayload {
  rating: number;
  comment: string;
}

export interface LibraryReviewRecord {
  id: string;
  rating: number;
  comment: string;
  status: 'pending' | 'approved' | 'rejected';
  member_id: string;
  member_name: string;
  member_role: string;
  created_at: string;
}

export interface MemberSummary {
  id: string;
  full_name: string;
  email: string;
}

export interface MemberSearchOptions {
  /** Exact role name match, e.g. 'member' or 'guardian'. */
  role?: string;
  /** Only return active accounts. */
  activeOnly?: boolean;
}

export interface DailyLibraryActivity {
  date: string;
  issued: number;
  returned: number;
}

export interface MostBorrowedBook {
  book_id: string;
  title: string;
  count: number;
}

export interface MostBorrowedBooksByPeriod {
  this_month: MostBorrowedBook[];
  last_3_months: MostBorrowedBook[];
  last_6_months: MostBorrowedBook[];
}

export interface MemberActivityMonth {
  month: string;
  new_members: number;
  active_members: number;
}

export interface SeatUtilizationHour {
  hour: number;
  percent: number;
}

export type FootfallRange = '7d' | '30d' | '3m';

export interface DailyFootfall {
  date: string;
  visits: number;
}

export interface HourlyFootfall {
  hour: number;
  visits: number;
}

export interface DayOfWeekFootfall {
  /** Monday=0 .. Sunday=6 */
  day_of_week: number;
  visits: number;
}

export interface FootfallAnalytics {
  range: FootfallRange;
  daily: DailyFootfall[];
  peak_hours: HourlyFootfall[];
  average_visit_minutes: number | null;
  busiest_day: DayOfWeekFootfall | null;
  quietest_day: DayOfWeekFootfall | null;
}

export interface OverdueFinesMonth {
  month: string;
  overdue_books: number;
  fines_generated: number;
  fines_collected: number;
}

export interface RevenueMonth {
  month: string;
  total: number;
}

export interface ManagerDashboardStats {
  seats_booked_today: number;
  books_issued_today: number;
  new_registrations_today: number;
  pending_tasks: number;
  /** Last 7 calendar days including today, oldest first. */
  library_activity: DailyLibraryActivity[];
  most_borrowed_books: MostBorrowedBooksByPeriod;
  /** Last 6 months, oldest first. */
  member_activity: MemberActivityMonth[];
  /** Today, one entry per open hour. */
  seat_utilization: SeatUtilizationHour[];
  /** Last 3 months, oldest first. */
  overdue_fines: OverdueFinesMonth[];
  /** Last 6 months, oldest first. */
  revenue: RevenueMonth[];
}

export interface ReadingProfile {
  interests: string[];
  difficulty: string;
  preference: string;
  insight: string;
}

export interface DemandForecastItem {
  book_id: string;
  title: string;
  author: string;
  category: string;
  total_copies: number;
  recent_activity: number;
  prior_activity: number;
  change_pct: number | null;
  pending_reservations: number;
  demand_level: 'high' | 'medium';
  reason: string;
}

export interface LateReturnRiskItem {
  loan_id: string;
  book_title: string;
  member_id: string;
  member_name: string;
  due_date: string;
  is_overdue: boolean;
  days_overdue: number;
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high';
  reason: string;
}

export interface ManagerSeatBookingPayload {
  member_id: string;
  seat_label: string;
  date: string;
  hour: number;
}

export type LoanDurationDays = 3 | 5 | 7 | 10;

export interface ManagerLoanPayload {
  member_id: string;
  book_id: string;
  duration_days: LoanDurationDays;
}

export interface ManagerGuardianLinkPayload {
  student_email: string;
  guardian_email: string;
}

/** The guardian a member is linked to. A member has at most one. */
export interface GuardianContact {
  id: string;
  full_name: string;
  email: string;
  linked_at: string;
}

export interface PendingReservationRequest {
  id: string;
  book_id: string;
  book_title: string;
  member_id: string;
  member_name: string;
  member_email: string;
  requested_at: string;
}

export interface ManagerBookAvailability {
  id: string;
  title: string;
  author: string;
  category: string;
  total_copies: number;
  available_copies: number;
  is_available: boolean;
  /** Earliest due date among this book's active loans; set only when unavailable. */
  expected_available_at: string | null;
}

export interface ManagerBookListResponse {
  items: ManagerBookAvailability[];
  total: number;
  page: number;
  page_size: number;
}

export interface ManagerBookQuery {
  search?: string;
  /** Exact category match, or 'all' / omitted for no filter. */
  category?: string;
  /** 'available' | 'unavailable' | 'all' (default: no filter). */
  status?: string;
  /** 'title_asc' | 'title_desc' | 'copies_asc' | 'copies_desc'. */
  sort?: string;
  page?: number;
  page_size?: number;
}

export interface BookDraftPayload {
  title: string;
  author: string;
  category: string;
  description?: string;
  isbn?: string;
  publisher?: string;
  published_year?: number;
  language?: string;
  cover_image_url?: string;
  total_copies?: number;
}

export interface SuggestBookDescriptionPayload {
  title: string;
  author: string;
  category?: string;
}

export interface IdentifiedBookFields {
  title: string | null;
  author: string | null;
  isbn: string | null;
  category: string | null;
  description: string | null;
  publisher: string | null;
  published_year: number | null;
  language: string | null;
  verified: boolean;
}

interface AuthState {
  isAuthenticated: boolean;
  role: Role | null;
  token: string | null;
  refreshToken: string | null;
  userId: string | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  /** True right after a first-time Google sign-in, until completeProfile() runs. */
  needsProfileCompletion: boolean;
  /**
   * Set right after registerAccount() so PublicRoute's auth-state redirect (see Login.tsx's
   * comment on that race) sends the new user to Payment instead of its usual role home.
   */
  postAuthRedirect: string | null;
}

interface AuthContextValue extends AuthState {
  /** ponytail: dev-only role preview — logs into a seeded per-role dev account (see seed_dev_accounts.py), drop the buttons using this before production. */
  login: (role: Role) => Promise<void>;
  loginWithCredentials: (email: string, password: string) => Promise<void>;
  loginWithGoogleToken: (idToken: string) => Promise<void>;
  registerAccount: (payload: RegisterPayload, postAuthRedirect: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (payload: { token: string; password: string }) => Promise<void>;
  completeProfile: (payload: CompleteProfilePayload) => Promise<void>;
  updateProfile: (payload: UpdateProfilePayload) => Promise<void>;
  createPayment: (payload: PaymentPayload) => Promise<void>;
  createRazorpayOrder: (payload: PaymentPayload) => Promise<RazorpayOrder>;
  verifyRazorpayPayment: (payload: RazorpayVerifyPayload) => Promise<PaymentRecord>;
  payAtLibrary: (payload: PaymentPayload) => Promise<void>;
  deleteAccount: () => Promise<void>;
  getMembership: () => Promise<Membership | null>;
  getMyPayments: () => Promise<PaymentRecord[]>;
  getGuardianChildren: () => Promise<GuardianChild[]>;
  getChildPayments: (childId: string) => Promise<PaymentRecord[]>;
  payChildFines: (childId: string) => Promise<void>;
  renewChildSubscription: (childId: string) => Promise<void>;
  bookSeatForChild: (childId: string, payload: SeatSlotPayload) => Promise<SeatBookingRecord>;
  requestSeatNotifyForChild: (childId: string, payload: SeatSlotPayload) => Promise<void>;
  getMyReadingProgress: () => Promise<ReadingProgressEntry[]>;
  getReadingGoal: () => Promise<ReadingGoal | null>;
  setReadingGoal: (payload: ReadingGoalPayload) => Promise<ReadingGoal>;
  getReadingStreak: () => Promise<ReadingStreak>;
  getReadingProfile: () => Promise<ReadingProfile | null>;
  getLeaderboard: () => Promise<LeaderboardEntry[]>;
  getMyReservations: () => Promise<Reservation[]>;
  reserveBook: (bookId: string) => Promise<Reservation>;
  cancelReservation: (reservationId: string) => Promise<void>;
  getCommunityPosts: () => Promise<CommunityPost[]>;
  createCommunityPost: (payload: CommunityPostPayload) => Promise<CommunityPost>;
  updateCommunityPost: (postId: string, payload: CommunityPostPayload) => Promise<CommunityPost>;
  deleteCommunityPost: (postId: string) => Promise<void>;
  toggleCommunityLike: (postId: string) => Promise<CommunityPost>;
  toggleCommunitySave: (postId: string) => Promise<CommunityPost>;
  reportCommunityPost: (postId: string) => Promise<CommunityPost>;
  addCommunityComment: (postId: string, payload: AddCommentPayload) => Promise<CommunityPost>;
  deleteCommunityComment: (commentId: string) => Promise<void>;
  reportCommunityComment: (commentId: string) => Promise<void>;
  getBannedAuthors: () => Promise<BannedAuthor[]>;
  banCommunityAuthor: (userId: string) => Promise<void>;
  unbanCommunityAuthor: (userId: string) => Promise<void>;
  getSeatSchedule: (date: string, hour: number) => Promise<SeatSchedule>;
  bookSeat: (payload: SeatSlotPayload) => Promise<SeatBookingRecord>;
  getMySeatBookings: () => Promise<SeatBookingRecord[]>;
  cancelSeatBooking: (bookingId: string) => Promise<void>;
  requestSeatNotify: (payload: SeatSlotPayload) => Promise<void>;
  getWishlist: () => Promise<string[]>;
  addToWishlist: (bookId: string) => Promise<void>;
  removeFromWishlist: (bookId: string) => Promise<void>;
  getMyNotifications: () => Promise<AppNotificationRecord[]>;
  markNotificationRead: (notificationId: string) => Promise<AppNotificationRecord>;
  markAllNotificationsRead: () => Promise<AppNotificationRecord[]>;
  getBookReviews: (bookId: string) => Promise<BookReviews>;
  createReview: (bookId: string, payload: ReviewPayload) => Promise<Review>;
  updateReview: (reviewId: string, payload: ReviewPayload) => Promise<Review>;
  deleteReview: (reviewId: string) => Promise<void>;
  getAllReviews: () => Promise<Review[]>;
  getMyReviews: () => Promise<Review[]>;
  getAdminDashboard: () => Promise<AdminDashboard>;
  logExpense: (payload: ExpensePayload) => Promise<void>;
  getAuditLog: () => Promise<AuditLogEntry[]>;
  getRevenueByPlanReport: () => Promise<RevenueByPlanReport>;
  getProfitAndLossReport: () => Promise<ProfitAndLossReport>;
  getExpenseBreakdownReport: () => Promise<ExpenseBreakdownReport>;
  getMembershipGrowthReport: () => Promise<MembershipGrowthReport>;
  getAdminMembers: (query?: AdminMemberQuery) => Promise<AdminMemberListResponse>;
  updateAdminMember: (memberId: string, payload: AdminMemberUpdatePayload) => Promise<void>;
  getAdminPayments: (query?: AdminPaymentQuery) => Promise<AdminPaymentListResponse>;
  getRecommendationQuiz: () => Promise<RecommendationQuiz>;
  submitRecommendationQuiz: (answers: RecommendationAnswers) => Promise<RecommendationResult>;
  describeRecommendation: (description: string) => Promise<RecommendationResult>;
  createSupportTicket: (payload: SupportTicketPayload) => Promise<SupportTicketRecord>;
  getMySupportTickets: () => Promise<SupportTicketRecord[]>;
  getStaffSupportTickets: (status?: SupportTicketStatus) => Promise<SupportTicketRecord[]>;
  resolveSupportTicket: (
    ticketId: string,
    payload: ResolveTicketPayload,
  ) => Promise<SupportTicketRecord>;
  confirmSupportTicket: (ticketId: string) => Promise<SupportTicketRecord>;
  reopenSupportTicket: (ticketId: string) => Promise<SupportTicketRecord>;
  searchMembers: (query: string, options?: MemberSearchOptions) => Promise<MemberSummary[]>;
  getManagerDashboard: () => Promise<ManagerDashboardStats>;
  getDemandForecast: () => Promise<DemandForecastItem[]>;
  getLateReturnRisk: () => Promise<LateReturnRiskItem[]>;
  getFootfallAnalytics: (range: FootfallRange) => Promise<FootfallAnalytics>;
  bookSeatForMember: (payload: ManagerSeatBookingPayload) => Promise<SeatBookingRecord>;
  issueLoanForMember: (payload: ManagerLoanPayload) => Promise<LoanRecord>;
  linkGuardian: (payload: ManagerGuardianLinkPayload) => Promise<void>;
  setGuardian: (payload: ManagerGuardianLinkPayload) => Promise<void>;
  unlinkGuardian: (studentId: string) => Promise<void>;
  getStudentGuardian: (studentId: string) => Promise<GuardianContact | null>;
  getMyGuardian: () => Promise<GuardianContact | null>;
  linkMyGuardian: (guardianEmail: string) => Promise<GuardianContact>;
  unlinkMyGuardian: () => Promise<void>;
  getManagerBooks: (query?: ManagerBookQuery) => Promise<ManagerBookListResponse>;
  createBook: (payload: BookDraftPayload) => Promise<void>;
  suggestBookDescription: (payload: SuggestBookDescriptionPayload) => Promise<string>;
  identifyBookFromCover: (image: string) => Promise<IdentifiedBookFields>;
  getPendingReservations: () => Promise<PendingReservationRequest[]>;
  checkInMember: (memberId: string) => Promise<LibraryVisitRecord>;
  checkOutMember: (memberId: string) => Promise<LibraryVisitRecord>;
  getCurrentlyInLibrary: () => Promise<LibraryVisitRecord[]>;
  getMyVisitStatus: () => Promise<MemberVisitStatus>;
  getChildrenVisitStatus: () => Promise<ChildVisitStatus[]>;
  approveReservation: (id: string, durationDays: LoanDurationDays) => Promise<Reservation>;
  rejectReservation: (id: string) => Promise<Reservation>;
  getActiveLoans: () => Promise<LoanRecord[]>;
  getLoanHistory: () => Promise<LoanRecord[]>;
  getMyLoans: () => Promise<LoanRecord[]>;
  getBillingRequests: () => Promise<BillingRequestRecord[]>;
  createBillingRequest: (payload: BillingRequestPayload) => Promise<BillingRequestRecord>;
  approveBillingRequest: (requestId: string) => Promise<BillingRequestRecord>;
  rejectBillingRequest: (requestId: string) => Promise<BillingRequestRecord>;
  waiveFine: (payload: WaiveFinePayload) => Promise<BillingRequestRecord>;
  getApprovedLibraryReviews: () => Promise<LibraryReviewRecord[]>;
  getMyLibraryReview: () => Promise<LibraryReviewRecord | null>;
  submitLibraryReview: (payload: LibraryReviewPayload) => Promise<LibraryReviewRecord>;
  getPendingLibraryReviews: () => Promise<LibraryReviewRecord[]>;
  approveLibraryReview: (reviewId: string) => Promise<LibraryReviewRecord>;
  rejectLibraryReview: (reviewId: string) => Promise<LibraryReviewRecord>;
  getPricingPlans: () => Promise<PricingPlan[]>;
  updatePricingPlan: (id: string, payload: PricingPlanUpdatePayload) => Promise<PricingPlan>;
  createMember: (payload: CreateMemberPayload) => Promise<CreatedMember>;
  sendAnnouncement: (payload: AnnouncementPayload) => Promise<AnnouncementResult>;
  getCoupons: () => Promise<Coupon[]>;
  generateCoupon: (payload: CouponPayload) => Promise<Coupon>;
  validateCoupon: (code: string) => Promise<CouponValidation>;
  getMembers: (query?: MemberListQuery) => Promise<MemberListResponse>;
  getPermissionRequests: () => Promise<PermissionRequestRecord[]>;
  createPermissionRequest: (payload: PermissionRequestPayload) => Promise<PermissionRequestRecord>;
  grantPermissionRequest: (id: string) => Promise<PermissionRequestRecord>;
  denyPermissionRequest: (id: string) => Promise<PermissionRequestRecord>;
  createLoan: (payload: LoanPayload) => Promise<LoanRecord>;
  getLoanFines: () => Promise<LoanRecord[]>;
  returnLoan: (id: string) => Promise<LoanRecord>;
  markFinePaid: (id: string) => Promise<LoanRecord>;
  sendFineReminder: (id: string) => Promise<void>;
  getITHeadDashboard: () => Promise<ITHeadDashboard>;
  getBookRecords: () => Promise<BookRecordEntry[]>;
  createBookRecord: (payload: BookRecordPayload) => Promise<BookRecordEntry>;
  clearPostAuthRedirect: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SIGNED_OUT: AuthState = {
  isAuthenticated: false,
  role: null,
  token: null,
  refreshToken: null,
  userId: null,
  fullName: null,
  email: null,
  phone: null,
  avatarUrl: null,
  needsProfileCompletion: false,
  postAuthRedirect: null,
};

// Matches backend/scripts/seed_dev_accounts.py — one real, loggable-in account per
// role so the Login page's "Continue as <role>" preview buttons get a real token
// (and therefore real data) instead of faking local auth state.
const DEV_PREVIEW_EMAIL_DOMAIN = 'devpreview.internal';
const DEV_PREVIEW_PASSWORD = 'DevPreview123!';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useLocalStorageState<AuthState>('mock-auth', SIGNED_OUT);

  // Lets the ~110 action functions below read the current token without being in their
  // closure — so those functions can be created once (via useMemo, see the bottom of this
  // component) and never recreated, instead of getting new identities on every render.
  const stateRef = useRef(state);
  stateRef.current = state;

  // A real session always sets isAuthenticated and token together (see applySession) — the
  // only way to see one without the other is a session cached by the old role-preview login,
  // which faked isAuthenticated/role locally with no real token. Clear it so ProtectedRoute
  // sends the tab back to Login instead of silently showing empty data everywhere.
  useEffect(() => {
    if (state.isAuthenticated && !state.token) setState(SIGNED_OUT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(role: Role): Promise<void> {
    applySession(
      await apiPost<TokenResponse>('/auth/login', {
        email: `${role}@${DEV_PREVIEW_EMAIL_DOMAIN}`,
        password: DEV_PREVIEW_PASSWORD,
      }),
    );
  }

  function applySession(
    data: TokenResponse,
    needsProfileCompletion = false,
    postAuthRedirect: string | null = null,
  ) {
    setState({
      isAuthenticated: true,
      role: data.user.role.name as Role,
      token: data.access_token,
      refreshToken: data.refresh_token,
      userId: data.user.id,
      fullName: data.user.full_name,
      email: data.user.email,
      phone: data.user.phone,
      avatarUrl: data.user.avatar_url,
      needsProfileCompletion,
      postAuthRedirect,
    });
  }

  function clearPostAuthRedirect() {
    setState({ ...stateRef.current, postAuthRedirect: null });
  }

  async function loginWithCredentials(email: string, password: string) {
    applySession(await apiPost<TokenResponse>('/auth/login', { email, password }));
  }

  async function loginWithGoogleToken(idToken: string) {
    const data = await apiPost<TokenResponse>('/auth/google', { id_token: idToken });
    applySession(data, data.is_new_user);
  }

  async function registerAccount(payload: RegisterPayload, postAuthRedirect: string) {
    applySession(await apiPost<TokenResponse>('/auth/register', payload), false, postAuthRedirect);
  }

  async function forgotPassword(email: string) {
    await apiPost<undefined>('/auth/forgot-password', { email });
  }

  async function resetPassword(payload: { token: string; password: string }) {
    await apiPost<undefined>('/auth/reset-password', payload);
  }

  async function completeProfile(payload: CompleteProfilePayload) {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    applySession(await apiPatch<TokenResponse>('/auth/me', payload, stateRef.current.token));
  }

  async function updateProfile(payload: UpdateProfilePayload) {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    applySession(
      await apiPatch<TokenResponse>('/auth/me', payload, stateRef.current.token),
      stateRef.current.needsProfileCompletion,
    );
  }

  async function createPayment(payload: PaymentPayload) {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    await apiPost('/payments', payload, stateRef.current.token);
  }

  async function createRazorpayOrder(payload: PaymentPayload): Promise<RazorpayOrder> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<RazorpayOrder>('/payments/razorpay/order', payload, stateRef.current.token);
  }

  async function verifyRazorpayPayment(payload: RazorpayVerifyPayload): Promise<PaymentRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<PaymentRecord>('/payments/razorpay/verify', payload, stateRef.current.token);
  }

  async function payAtLibrary(payload: PaymentPayload) {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    await apiPost('/payments/pay-at-library', payload, stateRef.current.token);
  }

  async function deleteAccount() {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    await apiDelete('/auth/me', stateRef.current.token);
    setState(SIGNED_OUT);
  }

  async function getMembership(): Promise<Membership | null> {
    if (!stateRef.current.token) return null;
    return apiGet<Membership | null>('/payments/me/membership', stateRef.current.token);
  }

  async function getMyPayments(): Promise<PaymentRecord[]> {
    if (!stateRef.current.token) return [];
    return fetchAllPages<PaymentRecord>('/payments/me', stateRef.current.token);
  }

  async function getGuardianChildren(): Promise<GuardianChild[]> {
    if (!stateRef.current.token) return [];
    return apiGet<GuardianChild[]>('/guardian/children', stateRef.current.token);
  }

  async function getChildPayments(childId: string): Promise<PaymentRecord[]> {
    if (!stateRef.current.token) return [];
    return apiGet<PaymentRecord[]>(`/guardian/children/${childId}/payments`, stateRef.current.token);
  }

  async function payChildFines(childId: string): Promise<void> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    await apiPost(`/guardian/children/${childId}/pay-fines`, undefined, stateRef.current.token);
  }

  async function renewChildSubscription(childId: string): Promise<void> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    await apiPost(`/guardian/children/${childId}/renew`, undefined, stateRef.current.token);
  }

  async function bookSeatForChild(
    childId: string,
    payload: SeatSlotPayload,
  ): Promise<SeatBookingRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<SeatBookingRecord>(
      `/guardian/children/${childId}/seat-bookings`,
      payload,
      stateRef.current.token,
    );
  }

  async function requestSeatNotifyForChild(
    childId: string,
    payload: SeatSlotPayload,
  ): Promise<void> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    await apiPost(`/guardian/children/${childId}/seat-notify`, payload, stateRef.current.token);
  }

  async function getMyReadingProgress(): Promise<ReadingProgressEntry[]> {
    if (!stateRef.current.token) return [];
    return apiGet<ReadingProgressEntry[]>('/members/me/reading-progress', stateRef.current.token);
  }

  async function getReadingGoal(): Promise<ReadingGoal | null> {
    if (!stateRef.current.token) return null;
    return apiGet<ReadingGoal | null>('/members/me/reading-goal', stateRef.current.token);
  }

  async function setReadingGoal(payload: ReadingGoalPayload): Promise<ReadingGoal> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPut<ReadingGoal>('/members/me/reading-goal', payload, stateRef.current.token);
  }

  async function getReadingStreak(): Promise<ReadingStreak> {
    if (!stateRef.current.token) return { current_streak_days: 0, longest_streak_days: 0 };
    return apiGet<ReadingStreak>('/members/me/reading-streak', stateRef.current.token);
  }

  async function getReadingProfile(): Promise<ReadingProfile | null> {
    if (!stateRef.current.token) return null;
    return apiGet<ReadingProfile | null>('/members/me/reading-profile', stateRef.current.token);
  }

  async function getLeaderboard(): Promise<LeaderboardEntry[]> {
    if (!stateRef.current.token) return [];
    return apiGet<LeaderboardEntry[]>('/leaderboard', stateRef.current.token);
  }

  async function getMyReservations(): Promise<Reservation[]> {
    if (!stateRef.current.token) return [];
    return apiGet<Reservation[]>('/reservations/me', stateRef.current.token);
  }

  async function reserveBook(bookId: string): Promise<Reservation> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<Reservation>('/reservations', { book_id: bookId }, stateRef.current.token);
  }

  async function cancelReservation(reservationId: string): Promise<void> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    await apiDelete(`/reservations/${reservationId}`, stateRef.current.token);
  }

  async function getCommunityPosts(): Promise<CommunityPost[]> {
    if (!stateRef.current.token) return [];
    return fetchAllPages<CommunityPost>('/community/posts', stateRef.current.token);
  }

  async function createCommunityPost(payload: CommunityPostPayload): Promise<CommunityPost> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<CommunityPost>('/community/posts', payload, stateRef.current.token);
  }

  async function updateCommunityPost(
    postId: string,
    payload: CommunityPostPayload,
  ): Promise<CommunityPost> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPut<CommunityPost>(`/community/posts/${postId}`, payload, stateRef.current.token);
  }

  async function deleteCommunityPost(postId: string): Promise<void> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    await apiDelete(`/community/posts/${postId}`, stateRef.current.token);
  }

  async function toggleCommunityLike(postId: string): Promise<CommunityPost> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<CommunityPost>(`/community/posts/${postId}/like`, undefined, stateRef.current.token);
  }

  async function toggleCommunitySave(postId: string): Promise<CommunityPost> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<CommunityPost>(`/community/posts/${postId}/save`, undefined, stateRef.current.token);
  }

  async function reportCommunityPost(postId: string): Promise<CommunityPost> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<CommunityPost>(`/community/posts/${postId}/report`, undefined, stateRef.current.token);
  }

  async function addCommunityComment(
    postId: string,
    payload: AddCommentPayload,
  ): Promise<CommunityPost> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<CommunityPost>(`/community/posts/${postId}/comments`, payload, stateRef.current.token);
  }

  async function deleteCommunityComment(commentId: string): Promise<void> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    await apiDelete(`/community/comments/${commentId}`, stateRef.current.token);
  }

  async function reportCommunityComment(commentId: string): Promise<void> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    await apiPost(`/community/comments/${commentId}/report`, undefined, stateRef.current.token);
  }

  async function getBannedAuthors(): Promise<BannedAuthor[]> {
    if (!stateRef.current.token) return [];
    return apiGet<BannedAuthor[]>('/community/banned-authors', stateRef.current.token);
  }

  async function banCommunityAuthor(userId: string): Promise<void> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    await apiPost(`/community/banned-authors/${userId}`, undefined, stateRef.current.token);
  }

  async function unbanCommunityAuthor(userId: string): Promise<void> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    await apiDelete(`/community/banned-authors/${userId}`, stateRef.current.token);
  }

  async function getSeatSchedule(date: string, hour: number): Promise<SeatSchedule> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiGet<SeatSchedule>(
      `/seat-booking/schedule?date=${date}&hour=${hour}`,
      stateRef.current.token,
    );
  }

  async function bookSeat(payload: SeatSlotPayload): Promise<SeatBookingRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<SeatBookingRecord>('/seat-booking', payload, stateRef.current.token);
  }

  async function getMySeatBookings(): Promise<SeatBookingRecord[]> {
    if (!stateRef.current.token) return [];
    return apiGet<SeatBookingRecord[]>('/seat-booking/me', stateRef.current.token);
  }

  async function cancelSeatBooking(bookingId: string): Promise<void> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    await apiDelete(`/seat-booking/${bookingId}`, stateRef.current.token);
  }

  async function getWishlist(): Promise<string[]> {
    if (!stateRef.current.token) return [];
    return apiGet<string[]>('/wishlist', stateRef.current.token);
  }

  async function addToWishlist(bookId: string): Promise<void> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    await apiPost(`/wishlist/${bookId}`, undefined, stateRef.current.token);
  }

  async function removeFromWishlist(bookId: string): Promise<void> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    await apiDelete(`/wishlist/${bookId}`, stateRef.current.token);
  }

  async function requestSeatNotify(payload: SeatSlotPayload): Promise<void> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    await apiPost('/seat-booking/notify', payload, stateRef.current.token);
  }

  async function getMyNotifications(): Promise<AppNotificationRecord[]> {
    if (!stateRef.current.token) return [];
    return apiGet<AppNotificationRecord[]>('/notifications/me', stateRef.current.token);
  }

  async function markNotificationRead(notificationId: string): Promise<AppNotificationRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<AppNotificationRecord>(`/notifications/${notificationId}/read`, undefined, stateRef.current.token);
  }

  async function markAllNotificationsRead(): Promise<AppNotificationRecord[]> {
    if (!stateRef.current.token) return [];
    return apiPost<AppNotificationRecord[]>('/notifications/read-all', undefined, stateRef.current.token);
  }

  async function getBookReviews(bookId: string): Promise<BookReviews> {
    return reviewsApi.getBookReviews(bookId, stateRef.current.token);
  }

  async function createReview(bookId: string, payload: ReviewPayload): Promise<Review> {
    return reviewsApi.createReview(bookId, payload, stateRef.current.token);
  }

  async function updateReview(reviewId: string, payload: ReviewPayload): Promise<Review> {
    return reviewsApi.updateReview(reviewId, payload, stateRef.current.token);
  }

  async function deleteReview(reviewId: string): Promise<void> {
    return reviewsApi.deleteReview(reviewId, stateRef.current.token);
  }

  async function getAllReviews(): Promise<Review[]> {
    return reviewsApi.getAllReviews(stateRef.current.token);
  }

  async function getMyReviews(): Promise<Review[]> {
    return reviewsApi.getMyReviews(stateRef.current.token);
  }

  async function getAdminDashboard(): Promise<AdminDashboard> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiGet<AdminDashboard>('/admin/dashboard', stateRef.current.token);
  }

  async function logExpense(payload: ExpensePayload): Promise<void> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    await apiPost('/admin/expenses', payload, stateRef.current.token);
  }

  async function getAuditLog(): Promise<AuditLogEntry[]> {
    if (!stateRef.current.token) return [];
    return fetchAllPages<AuditLogEntry>('/admin/audit-log', stateRef.current.token);
  }

  async function getRevenueByPlanReport(): Promise<RevenueByPlanReport> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiGet<RevenueByPlanReport>('/admin/reports/revenue-by-plan', stateRef.current.token);
  }

  async function getProfitAndLossReport(): Promise<ProfitAndLossReport> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiGet<ProfitAndLossReport>('/admin/reports/profit-and-loss', stateRef.current.token);
  }

  async function getExpenseBreakdownReport(): Promise<ExpenseBreakdownReport> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiGet<ExpenseBreakdownReport>('/admin/reports/expense-breakdown', stateRef.current.token);
  }

  async function getMembershipGrowthReport(): Promise<MembershipGrowthReport> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiGet<MembershipGrowthReport>('/admin/reports/membership-growth', stateRef.current.token);
  }

  async function getAdminMembers(query: AdminMemberQuery = {}): Promise<AdminMemberListResponse> {
    if (!stateRef.current.token) return { items: [], total: 0, page: 1, page_size: 20 };
    const params = new URLSearchParams({
      page: String(query.page ?? 1),
      page_size: String(query.page_size ?? 20),
      sort_by: query.sort_by ?? 'joined',
      sort_dir: query.sort_dir ?? 'desc',
    });
    if (query.search?.trim()) params.set('search', query.search.trim());
    if (query.role) params.set('role', query.role);
    if (query.status) params.set('status', query.status);
    return apiGet<AdminMemberListResponse>(`/admin/members?${params}`, stateRef.current.token);
  }

  async function getAdminPayments(query: AdminPaymentQuery = {}): Promise<AdminPaymentListResponse> {
    if (!stateRef.current.token) return { items: [], total: 0, page: 1, page_size: 20 };
    const params = new URLSearchParams({
      page: String(query.page ?? 1),
      page_size: String(query.page_size ?? 20),
    });
    if (query.search?.trim()) params.set('search', query.search.trim());
    if (query.month) params.set('month', query.month);
    return apiGet<AdminPaymentListResponse>(`/admin/payments?${params}`, stateRef.current.token);
  }

  async function updateAdminMember(
    memberId: string,
    payload: AdminMemberUpdatePayload,
  ): Promise<void> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    await apiPut(`/members/${memberId}`, payload, stateRef.current.token);
  }

  async function getRecommendationQuiz(): Promise<RecommendationQuiz> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiGet<RecommendationQuiz>('/recommendations/quiz', stateRef.current.token);
  }

  async function submitRecommendationQuiz(
    answers: RecommendationAnswers,
  ): Promise<RecommendationResult> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<RecommendationResult>(
      '/recommendations/quiz',
      answers,
      stateRef.current.token,
    );
  }

  async function describeRecommendation(description: string): Promise<RecommendationResult> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<RecommendationResult>(
      '/recommendations/describe',
      { description },
      stateRef.current.token,
    );
  }

  async function createSupportTicket(payload: SupportTicketPayload): Promise<SupportTicketRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<SupportTicketRecord>('/support-tickets', payload, stateRef.current.token);
  }

  async function getMySupportTickets(): Promise<SupportTicketRecord[]> {
    if (!stateRef.current.token) return [];
    return apiGet<SupportTicketRecord[]>('/support-tickets/me', stateRef.current.token);
  }

  async function getStaffSupportTickets(
    ticketStatus?: SupportTicketStatus,
  ): Promise<SupportTicketRecord[]> {
    if (!stateRef.current.token) return [];
    const query = ticketStatus ? `?status=${ticketStatus}` : '';
    return apiGet<SupportTicketRecord[]>(`/support-tickets${query}`, stateRef.current.token);
  }

  async function resolveSupportTicket(
    ticketId: string,
    payload: ResolveTicketPayload,
  ): Promise<SupportTicketRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<SupportTicketRecord>(`/support-tickets/${ticketId}/resolve`, payload, stateRef.current.token);
  }

  async function confirmSupportTicket(ticketId: string): Promise<SupportTicketRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<SupportTicketRecord>(
      `/support-tickets/${ticketId}/confirm`,
      undefined,
      stateRef.current.token,
    );
  }

  async function reopenSupportTicket(ticketId: string): Promise<SupportTicketRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<SupportTicketRecord>(
      `/support-tickets/${ticketId}/reopen`,
      undefined,
      stateRef.current.token,
    );
  }

  async function searchMembers(
    query: string,
    options?: MemberSearchOptions,
  ): Promise<MemberSummary[]> {
    if (!stateRef.current.token || query.trim().length === 0) return [];
    const params = new URLSearchParams({ search: query.trim(), page_size: '6' });
    if (options?.role) params.set('role', options.role);
    if (options?.activeOnly) params.set('active_only', 'true');
    const data = await apiGet<{ items: MemberSummary[] }>(`/members?${params}`, stateRef.current.token);
    return data.items;
  }

  async function getManagerDashboard(): Promise<ManagerDashboardStats> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiGet<ManagerDashboardStats>('/manager/dashboard', stateRef.current.token);
  }

  async function getDemandForecast(): Promise<DemandForecastItem[]> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiGet<DemandForecastItem[]>('/manager/demand-forecast', stateRef.current.token);
  }

  async function getLateReturnRisk(): Promise<LateReturnRiskItem[]> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiGet<LateReturnRiskItem[]>('/manager/late-return-risk', stateRef.current.token);
  }

  async function getFootfallAnalytics(range: FootfallRange): Promise<FootfallAnalytics> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiGet<FootfallAnalytics>(
      `/manager/footfall?range=${range}`,
      stateRef.current.token,
    );
  }

  async function bookSeatForMember(payload: ManagerSeatBookingPayload): Promise<SeatBookingRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<SeatBookingRecord>('/manager/seat-bookings', payload, stateRef.current.token);
  }

  async function issueLoanForMember(payload: ManagerLoanPayload): Promise<LoanRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<LoanRecord>('/manager/loans', payload, stateRef.current.token);
  }

  async function linkGuardian(payload: ManagerGuardianLinkPayload): Promise<void> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    await apiPost<undefined>('/manager/guardian-links', payload, stateRef.current.token);
  }

  // PUT, not POST — repoints an existing link instead of 409ing on one.
  async function setGuardian(payload: ManagerGuardianLinkPayload): Promise<void> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    await apiPut<undefined>('/manager/guardian-links', payload, stateRef.current.token);
  }

  async function unlinkGuardian(studentId: string): Promise<void> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    await apiDelete(`/manager/guardian-links/${studentId}`, stateRef.current.token);
  }

  async function getStudentGuardian(studentId: string): Promise<GuardianContact | null> {
    if (!stateRef.current.token) return null;
    return apiGet<GuardianContact | null>(
      `/manager/guardian-links/${studentId}`,
      stateRef.current.token,
    );
  }

  /** The signed-in member's own guardian, for their settings page. */
  async function getMyGuardian(): Promise<GuardianContact | null> {
    if (!stateRef.current.token) return null;
    return apiGet<GuardianContact | null>('/guardian/my-guardian', stateRef.current.token);
  }

  async function linkMyGuardian(guardianEmail: string): Promise<GuardianContact> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<GuardianContact>(
      '/guardian/my-guardian',
      { guardian_email: guardianEmail },
      stateRef.current.token,
    );
  }

  async function unlinkMyGuardian(): Promise<void> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiDelete('/guardian/my-guardian', stateRef.current.token);
  }

  async function getPendingReservations(): Promise<PendingReservationRequest[]> {
    if (!stateRef.current.token) return [];
    return apiGet<PendingReservationRequest[]>('/manager/reservations/pending', stateRef.current.token);
  }

  async function approveReservation(
    id: string,
    durationDays: LoanDurationDays,
  ): Promise<Reservation> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<Reservation>(
      `/manager/reservations/${id}/approve`,
      { duration_days: durationDays },
      stateRef.current.token,
    );
  }

  async function rejectReservation(id: string): Promise<Reservation> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<Reservation>(`/manager/reservations/${id}/reject`, undefined, stateRef.current.token);
  }

  async function getActiveLoans(): Promise<LoanRecord[]> {
    if (!stateRef.current.token) return [];
    return apiGet<LoanRecord[]>('/loans', stateRef.current.token);
  }

  async function getLoanHistory(): Promise<LoanRecord[]> {
    if (!stateRef.current.token) return [];
    return fetchAllPages<LoanRecord>('/loans/history', stateRef.current.token);
  }

  async function getMyLoans(): Promise<LoanRecord[]> {
    if (!stateRef.current.token) return [];
    return apiGet<LoanRecord[]>('/loans/me', stateRef.current.token);
  }

  async function getManagerBooks(query: ManagerBookQuery = {}): Promise<ManagerBookListResponse> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    const params = new URLSearchParams();
    if (query.search) params.set('search', query.search);
    if (query.category) params.set('category', query.category);
    if (query.status) params.set('status', query.status);
    if (query.sort) params.set('sort', query.sort);
    if (query.page) params.set('page', String(query.page));
    if (query.page_size) params.set('page_size', String(query.page_size));
    return apiGet<ManagerBookListResponse>(`/manager/books?${params}`, stateRef.current.token);
  }

  async function getBillingRequests(): Promise<BillingRequestRecord[]> {
    if (!stateRef.current.token) return [];
    return apiGet<BillingRequestRecord[]>('/billing-requests', stateRef.current.token);
  }

  async function createBillingRequest(
    payload: BillingRequestPayload,
  ): Promise<BillingRequestRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<BillingRequestRecord>('/billing-requests', payload, stateRef.current.token);
  }

  async function approveBillingRequest(requestId: string): Promise<BillingRequestRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<BillingRequestRecord>(
      `/billing-requests/${requestId}/approve`,
      undefined,
      stateRef.current.token,
    );
  }

  async function rejectBillingRequest(requestId: string): Promise<BillingRequestRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<BillingRequestRecord>(
      `/billing-requests/${requestId}/reject`,
      undefined,
      stateRef.current.token,
    );
  }

  async function waiveFine(payload: WaiveFinePayload): Promise<BillingRequestRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<BillingRequestRecord>('/billing-requests/waive-fine', payload, stateRef.current.token);
  }

  // Public — the homepage's "What Our Members Say" reads this without needing a session.
  async function getApprovedLibraryReviews(): Promise<LibraryReviewRecord[]> {
    return apiGet<LibraryReviewRecord[]>(
      '/library-reviews/approved',
      stateRef.current.token ?? undefined,
    );
  }

  async function getMyLibraryReview(): Promise<LibraryReviewRecord | null> {
    if (!stateRef.current.token) return null;
    return apiGet<LibraryReviewRecord | null>('/library-reviews/me', stateRef.current.token);
  }

  async function submitLibraryReview(payload: LibraryReviewPayload): Promise<LibraryReviewRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<LibraryReviewRecord>('/library-reviews', payload, stateRef.current.token);
  }

  async function getPendingLibraryReviews(): Promise<LibraryReviewRecord[]> {
    if (!stateRef.current.token) return [];
    return apiGet<LibraryReviewRecord[]>('/library-reviews', stateRef.current.token);
  }

  async function approveLibraryReview(reviewId: string): Promise<LibraryReviewRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<LibraryReviewRecord>(
      `/library-reviews/${reviewId}/approve`,
      undefined,
      stateRef.current.token,
    );
  }

  async function rejectLibraryReview(reviewId: string): Promise<LibraryReviewRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<LibraryReviewRecord>(
      `/library-reviews/${reviewId}/reject`,
      undefined,
      stateRef.current.token,
    );
  }

  // Public — the Pricing page and Payment page read prices here without needing a session.
  async function getPricingPlans(): Promise<PricingPlan[]> {
    return apiGet<PricingPlan[]>('/pricing-plans', stateRef.current.token ?? undefined);
  }

  async function updatePricingPlan(
    id: string,
    payload: PricingPlanUpdatePayload,
  ): Promise<PricingPlan> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPatch<PricingPlan>(`/pricing-plans/${id}`, payload, stateRef.current.token);
  }

  async function createMember(payload: CreateMemberPayload): Promise<CreatedMember> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<CreatedMember>('/members', payload, stateRef.current.token);
  }

  async function sendAnnouncement(payload: AnnouncementPayload): Promise<AnnouncementResult> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<AnnouncementResult>('/admin/announcements', payload, stateRef.current.token);
  }

  async function getCoupons(): Promise<Coupon[]> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiGet<Coupon[]>('/coupons', stateRef.current.token);
  }

  async function generateCoupon(payload: CouponPayload): Promise<Coupon> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<Coupon>('/coupons', payload, stateRef.current.token);
  }

  async function validateCoupon(code: string): Promise<CouponValidation> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiGet<CouponValidation>(`/coupons/${encodeURIComponent(code)}/validate`, stateRef.current.token);
  }

  async function getMembers(query: MemberListQuery = {}): Promise<MemberListResponse> {
    if (!stateRef.current.token) return { items: [], total: 0, page: 1, page_size: 20 };
    const params = new URLSearchParams({
      page: String(query.page ?? 1),
      page_size: String(query.page_size ?? 20),
    });
    if (query.search?.trim()) params.set('search', query.search.trim());
    if (query.role) params.set('role', query.role);
    if (query.active_only) params.set('active_only', 'true');
    return apiGet<MemberListResponse>(`/members?${params}`, stateRef.current.token);
  }

  async function getPermissionRequests(): Promise<PermissionRequestRecord[]> {
    if (!stateRef.current.token) return [];
    return apiGet<PermissionRequestRecord[]>('/permission-requests', stateRef.current.token);
  }

  async function createPermissionRequest(
    payload: PermissionRequestPayload,
  ): Promise<PermissionRequestRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<PermissionRequestRecord>('/permission-requests', payload, stateRef.current.token);
  }

  async function grantPermissionRequest(id: string): Promise<PermissionRequestRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<PermissionRequestRecord>(`/permission-requests/${id}/approve`, undefined, stateRef.current.token);
  }

  async function denyPermissionRequest(id: string): Promise<PermissionRequestRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<PermissionRequestRecord>(`/permission-requests/${id}/reject`, undefined, stateRef.current.token);
  }

  async function createLoan(payload: LoanPayload): Promise<LoanRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<LoanRecord>('/loans', payload, stateRef.current.token);
  }

  async function getLoanFines(): Promise<LoanRecord[]> {
    if (!stateRef.current.token) return [];
    return apiGet<LoanRecord[]>('/loans/fines', stateRef.current.token);
  }

  async function returnLoan(id: string): Promise<LoanRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<LoanRecord>(`/loans/${id}/return`, undefined, stateRef.current.token);
  }

  async function markFinePaid(id: string): Promise<LoanRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<LoanRecord>(`/loans/${id}/mark-fine-paid`, undefined, stateRef.current.token);
  }

  async function sendFineReminder(id: string): Promise<void> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    await apiPost(`/loans/${id}/remind`, undefined, stateRef.current.token);
  }

  async function getBookRecords(): Promise<BookRecordEntry[]> {
    if (!stateRef.current.token) return [];
    return apiGet<BookRecordEntry[]>('/book-records', stateRef.current.token);
  }

  async function createBookRecord(payload: BookRecordPayload): Promise<BookRecordEntry> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<BookRecordEntry>('/book-records', payload, stateRef.current.token);
  }

  async function createBook(payload: BookDraftPayload): Promise<void> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    await apiPost('/books', payload, stateRef.current.token);
  }

  async function suggestBookDescription(payload: SuggestBookDescriptionPayload): Promise<string> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    const data = await apiPost<{ description: string }>(
      '/books/suggest-description',
      payload,
      stateRef.current.token,
    );
    return data.description;
  }

  async function identifyBookFromCover(image: string): Promise<IdentifiedBookFields> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<IdentifiedBookFields>(
      '/books/identify-cover',
      { image },
      stateRef.current.token,
    );
  }

  async function getITHeadDashboard(): Promise<ITHeadDashboard> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiGet<ITHeadDashboard>('/it-head/dashboard', stateRef.current.token);
  }

  async function refreshAccessToken(): Promise<string | null> {
    if (!stateRef.current.refreshToken) return null;
    try {
      const data = await apiPost<TokenResponse>('/auth/refresh', {
        refresh_token: stateRef.current.refreshToken,
      });
      applySession(data, stateRef.current.needsProfileCompletion, stateRef.current.postAuthRedirect);
      return data.access_token;
    } catch {
      setState(SIGNED_OUT);
      return null;
    }
  }

  async function checkInMember(memberId: string): Promise<LibraryVisitRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<LibraryVisitRecord>('/visits/check-in', { member_id: memberId }, stateRef.current.token);
  }

  async function checkOutMember(memberId: string): Promise<LibraryVisitRecord> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiPost<LibraryVisitRecord>('/visits/check-out', { member_id: memberId }, stateRef.current.token);
  }

  async function getCurrentlyInLibrary(): Promise<LibraryVisitRecord[]> {
    if (!stateRef.current.token) return [];
    return apiGet<LibraryVisitRecord[]>('/visits/active', stateRef.current.token);
  }

  async function getMyVisitStatus(): Promise<MemberVisitStatus> {
    if (!stateRef.current.token) throw new Error('Not authenticated');
    return apiGet<MemberVisitStatus>('/visits/my-status', stateRef.current.token);
  }

  async function getChildrenVisitStatus(): Promise<ChildVisitStatus[]> {
    if (!stateRef.current.token) return [];
    return apiGet<ChildVisitStatus[]>('/visits/children-status', stateRef.current.token);
  }

  // Registered once — refreshAccessToken reads stateRef.current (like every function
  // above), so it never goes stale and doesn't need to re-register on state changes.
  useEffect(() => {
    registerRefreshHandler(refreshAccessToken);
    return () => registerRefreshHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function logout() {
    const token = stateRef.current.token;
    // Make the signed-out state visible to the refresh handler immediately. React's
    // state update is asynchronous; without this assignment, a 401 from the logout
    // request can race through refreshAccessToken and resurrect the old session.
    stateRef.current = SIGNED_OUT;
    setState(SIGNED_OUT);
    if (token) {
      apiPost('/auth/logout', undefined, token).catch(() => {});
    }
  }

  // Every function above reads stateRef.current rather than closing over `state`, so none of
  // them need to change identity when auth state changes — memoized once for the provider's
  // lifetime instead of ~110 individual useCallbacks with identical stale-closure risk.
  const actions = useMemo(
    () => ({
      login,
      loginWithCredentials,
      loginWithGoogleToken,
      registerAccount,
      forgotPassword,
      resetPassword,
      completeProfile,
      updateProfile,
      createPayment,
      createRazorpayOrder,
      verifyRazorpayPayment,
      payAtLibrary,
      deleteAccount,
      getMembership,
      getMyPayments,
      getGuardianChildren,
      getChildPayments,
      payChildFines,
      renewChildSubscription,
      bookSeatForChild,
      requestSeatNotifyForChild,
      getMyReadingProgress,
      getReadingGoal,
      setReadingGoal,
      getReadingStreak,
      getReadingProfile,
      getLeaderboard,
      getMyReservations,
      reserveBook,
      cancelReservation,
      getCommunityPosts,
      createCommunityPost,
      updateCommunityPost,
      deleteCommunityPost,
      toggleCommunityLike,
      toggleCommunitySave,
      reportCommunityPost,
      addCommunityComment,
      deleteCommunityComment,
      reportCommunityComment,
      getBannedAuthors,
      banCommunityAuthor,
      unbanCommunityAuthor,
      getSeatSchedule,
      bookSeat,
      getMySeatBookings,
      cancelSeatBooking,
      requestSeatNotify,
      getWishlist,
      addToWishlist,
      removeFromWishlist,
      getMyNotifications,
      markNotificationRead,
      markAllNotificationsRead,
      getBookReviews,
      createReview,
      updateReview,
      deleteReview,
      getAllReviews,
      getMyReviews,
      getAdminDashboard,
      logExpense,
      getAuditLog,
      getRevenueByPlanReport,
      getProfitAndLossReport,
      getExpenseBreakdownReport,
      getMembershipGrowthReport,
      getAdminMembers,
      updateAdminMember,
      getAdminPayments,
      getRecommendationQuiz,
      submitRecommendationQuiz,
      describeRecommendation,
      createSupportTicket,
      getMySupportTickets,
      getStaffSupportTickets,
      resolveSupportTicket,
      confirmSupportTicket,
      reopenSupportTicket,
      searchMembers,
      getManagerDashboard,
      getDemandForecast,
      getLateReturnRisk,
      getFootfallAnalytics,
      bookSeatForMember,
      issueLoanForMember,
      getPendingReservations,
      approveReservation,
      rejectReservation,
      getActiveLoans,
      getLoanHistory,
      getMyLoans,
      linkGuardian,
      setGuardian,
      unlinkGuardian,
      getStudentGuardian,
      getMyGuardian,
      linkMyGuardian,
      unlinkMyGuardian,
      getManagerBooks,
      getBillingRequests,
      createBillingRequest,
      approveBillingRequest,
      rejectBillingRequest,
      waiveFine,
      getApprovedLibraryReviews,
      getMyLibraryReview,
      submitLibraryReview,
      getPendingLibraryReviews,
      approveLibraryReview,
      rejectLibraryReview,
      getPricingPlans,
      updatePricingPlan,
      createMember,
      sendAnnouncement,
      getCoupons,
      generateCoupon,
      validateCoupon,
      getMembers,
      getPermissionRequests,
      createPermissionRequest,
      grantPermissionRequest,
      denyPermissionRequest,
      createLoan,
      getLoanFines,
      returnLoan,
      markFinePaid,
      sendFineReminder,
      getITHeadDashboard,
      getBookRecords,
      createBookRecord,
      createBook,
      suggestBookDescription,
      identifyBookFromCover,
      checkInMember,
      checkOutMember,
      getCurrentlyInLibrary,
      getMyVisitStatus,
      getChildrenVisitStatus,
      clearPostAuthRedirect,
      logout,
    }),
    // login/loginWithCredentials/loginWithGoogleToken/registerAccount/completeProfile/
    // updateProfile/deleteAccount/clearPostAuthRedirect/logout call setState from
    // useLocalStorageState. The linter can't verify a custom hook's setter is stable (it only
    // special-cases useState/useReducer directly), but every render's setState forwards to the
    // same underlying stable setter, so calling any render's version is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Only recomputes when auth state actually changes (login/logout/profile update/token
  // refresh) — not on every render of AuthProvider or its ancestors. This is the object every
  // useAuth() consumer subscribes to, so this is what stops the app-wide re-render fan-out.
  const value = useMemo(() => ({ ...state, ...actions }), [state, actions]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
