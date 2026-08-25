import {
  AlertCircle,
  Armchair,
  Award,
  BookOpen,
  ClipboardList,
  IndianRupee,
  KeyRound,
  Lock,
  TicketCheck,
  Trophy,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ExportButton, ProgressBar, StatisticCard } from '@/components/common';
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/format';
import { guardianStats, type Child, type ChildBorrowedBook } from '@/mocks/guardian';
import type { RegistrationRequest, WalkInRequest } from '@/mocks/manager';
import {
  useAuth,
  type AuditLogEntry,
  type ChildVisitStatus,
  type GuardianChild,
  type LeaderboardEntry,
  type LoanRecord,
  type ManagerDashboardStats,
  type MemberRecord,
  type PermissionRequestRecord,
  type ReadingProfile,
  type ReadingProgressEntry,
  type SupportTicketRecord,
} from '@/providers/AuthProvider';

import { AuditLog } from '@/features/admin/components/AuditLog';
import {
  useMembershipQuery,
  useMyPaymentsQuery,
} from '@/features/payment/hooks/useMembershipQuery';
import { BookSeatForMemberModal } from '@/features/dashboard/components/BookSeatForMemberModal';
import { IssueBookForMemberModal } from '@/features/dashboard/components/IssueBookForMemberModal';
import { NewRegistrations } from '@/features/dashboard/components/NewRegistrations';
import { RegisterMemberModal } from '@/features/dashboard/components/RegisterMemberModal';
import { WalkInAssistance } from '@/features/dashboard/components/WalkInAssistance';
import { BorrowedBooksByChild } from '@/features/guardian/components/BorrowedBooksByChild';
import { ChildrenPresence } from '@/features/guardian/components/ChildrenPresence';
import { AccessControl } from '@/features/it-head/components/AccessControl';
import { IssueResolution } from '@/features/it-head/components/IssueResolution';
import { ResolveTicketModal } from '@/features/it-head/components/ResolveTicketModal';

import { ProfileHeader } from '../components/ProfileHeader';
import { ReadingProfileCard } from '../components/ReadingProfileCard';

const ACHIEVEMENT_DEFINITIONS = [
  {
    key: 'bookworm',
    icon: '📚',
    titleKey: 'leaderboard.badges.bookworm',
    descKey: 'leaderboard.badges.bookwormDesc',
  },
  {
    key: '7_day_streak',
    icon: '🔥',
    titleKey: 'leaderboard.badges.7_day_streak',
    descKey: 'leaderboard.badges.7_day_streakDesc',
  },
  {
    key: 'top_reviewer',
    icon: '⭐',
    titleKey: 'leaderboard.badges.top_reviewer',
    descKey: 'leaderboard.badges.top_reviewerDesc',
  },
  {
    key: 'perfect_returner',
    icon: '🎯',
    titleKey: 'leaderboard.badges.perfect_returner',
    descKey: 'leaderboard.badges.perfect_returnerDesc',
  },
  {
    key: 'reading_champion',
    icon: '🏆',
    titleKey: 'leaderboard.badges.reading_champion',
    descKey: 'leaderboard.badges.reading_championDesc',
  },
  {
    key: 'community_star',
    icon: '🌟',
    titleKey: 'leaderboard.badges.community_star',
    descKey: 'leaderboard.badges.community_starDesc',
  },
];

// No online flow yet lets a visitor submit a walk-in/registration request, so
// these queues have nothing real to show — kept empty rather than mocked
// (mirrors ManagerDashboard.tsx, the primary manager view for this).
const NO_WALK_INS: WalkInRequest[] = [];
const NO_REGISTRATIONS: RegistrationRequest[] = [];

function AdminProfile() {
  const { t } = useTranslation();
  const { fullName, email, getAuditLog } = useAuth();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    getAuditLog().then(setEntries).catch(() => setEntries([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const expensesApproved = entries.filter((entry) => entry.action === 'expenseApproved').length;
  const feesWaived = entries.filter((entry) => entry.action === 'feeWaived').length;

  return (
    <div className="flex flex-col gap-6">
      <ProfileHeader name={fullName || t('auth.login.roles.admin')} email={email ?? undefined} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatisticCard
          icon={ClipboardList}
          label={t('profile.adminStats.actionsThisMonth')}
          value={String(entries.length)}
        />
        <StatisticCard
          icon={IndianRupee}
          label={t('profile.adminStats.expensesApproved')}
          value={String(expensesApproved)}
        />
        <StatisticCard
          icon={Wallet}
          label={t('profile.adminStats.finesWaived')}
          value={String(feesWaived)}
        />
      </div>

      <AuditLog entries={entries} />
    </div>
  );
}

// ponytail: GuardianChild has no presence/loan/fine fields server-side yet —
// linkedChildren is overridden with the real count, ChildrenPresence/
// BorrowedBooksByChild get empty arrays and show their honest empty states
// instead of fabricated per-child data (mirrors GuardianDashboardPage).
function GuardianProfile() {
  const { t } = useTranslation();
  const { fullName, email, getGuardianChildren, getChildrenVisitStatus } = useAuth();
  const [realChildren, setRealChildren] = useState<GuardianChild[]>([]);
  const [childrenVisitStatus, setChildrenVisitStatus] = useState<ChildVisitStatus[]>([]);

  useEffect(() => {
    getGuardianChildren().then(setRealChildren).catch(() => setRealChildren([]));
    getChildrenVisitStatus().then(setChildrenVisitStatus).catch(() => setChildrenVisitStatus([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalDues = useMemo(
    () => realChildren.reduce((sum, c) => sum + (c.outstanding_fine || 0), 0),
    [realChildren],
  );

  const mappedChildren: Child[] = useMemo(
    () =>
      realChildren.map((c) => ({
        id: c.id,
        name: c.full_name,
        membershipId: c.id.slice(0, 8).toUpperCase(),
        presenceStatus: 'left' as const,
        presenceTime: 'Not checked in today',
        subscriptionExpiresOn: 'Active',
        outstandingFine: c.outstanding_fine > 0 ? formatCurrency(c.outstanding_fine) : '₹0',
      })),
    [realChildren],
  );

  const borrowedBooks: ChildBorrowedBook[] = useMemo(() => {
    const list: ChildBorrowedBook[] = [];
    realChildren.forEach((child) => {
      child.currently_reading.forEach((book) => {
        list.push({
          id: book.id,
          childId: child.id,
          title: book.book_title,
          author: 'Library Collection',
          dueDate: 'Active loan',
          status: 'on-time',
        });
      });
      if (child.fine_book_title) {
        list.push({
          id: `fine-${child.id}`,
          childId: child.id,
          title: child.fine_book_title,
          author: 'Library Collection',
          dueDate: child.fine_due_date ? new Date(child.fine_due_date).toLocaleDateString() : 'Overdue',
          status: 'overdue',
          fineAccrued: child.outstanding_fine > 0 ? formatCurrency(child.outstanding_fine) : undefined,
        });
      }
    });
    return list;
  }, [realChildren]);

  return (
    <div className="flex flex-col gap-6">
      <ProfileHeader name={fullName || t('auth.login.roles.guardian')} email={email ?? undefined} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatisticCard
          icon={guardianStats[0].icon}
          label={t('guardian.stats.linkedChildren')}
          value={String(realChildren.length)}
        />
        <StatisticCard
          icon={guardianStats[1].icon}
          label={t('guardian.stats.currentlyInLibrary')}
          value="0"
        />
        <StatisticCard
          icon={guardianStats[2].icon}
          label={t('guardian.stats.booksBorrowed')}
          value={String(borrowedBooks.length)}
        />
        <StatisticCard
          icon={guardianStats[3].icon}
          label={t('guardian.stats.totalDues')}
          value={formatCurrency(totalDues)}
        />
      </div>

      <ChildrenPresence children={childrenVisitStatus} />
      <BorrowedBooksByChild books={borrowedBooks} children={mappedChildren} />
    </div>
  );
}

function ManagerProfile() {
  const { t } = useTranslation();
  const { fullName, email, getManagerDashboard } = useAuth();
  const [stats, setStats] = useState<ManagerDashboardStats | null>(null);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isBookSeatOpen, setIsBookSeatOpen] = useState(false);
  const [isIssueBookOpen, setIsIssueBookOpen] = useState(false);

  function refreshStats() {
    getManagerDashboard().then(setStats).catch(() => setStats(null));
  }

  useEffect(() => {
    refreshStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <ProfileHeader name={fullName || t('auth.login.roles.manager')} email={email ?? undefined} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatisticCard
          icon={Armchair}
          label={t('profile.managerStats.walkInRequests')}
          value={String(NO_WALK_INS.length)}
        />
        <StatisticCard
          icon={UserPlus}
          label={t('profile.managerStats.newRegistrations')}
          value={String(NO_REGISTRATIONS.length)}
        />
        <StatisticCard
          icon={ClipboardList}
          label={t('managerDashboard.stats.pendingTasks')}
          value={stats ? String(stats.pending_tasks) : '0'}
        />
      </div>

      <WalkInAssistance
        requests={NO_WALK_INS}
        onBookSeat={() => setIsBookSeatOpen(true)}
        onIssueBook={() => setIsIssueBookOpen(true)}
      />
      <NewRegistrations requests={NO_REGISTRATIONS} onRegister={() => setIsRegisterOpen(true)} />

      <RegisterMemberModal
        open={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onRegistered={refreshStats}
      />
      <BookSeatForMemberModal
        open={isBookSeatOpen}
        onClose={() => setIsBookSeatOpen(false)}
        onBooked={refreshStats}
      />
      <IssueBookForMemberModal
        open={isIssueBookOpen}
        onClose={() => setIsIssueBookOpen(false)}
        onIssued={refreshStats}
      />
    </div>
  );
}

const IT_HEAD_ACCESS_ROLES = new Set(['member', 'manager']);

function ITHeadProfile() {
  const { t } = useTranslation();
  const { fullName, email, getMembers, getPermissionRequests, getStaffSupportTickets } = useAuth();
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [permissionRequests, setPermissionRequests] = useState<PermissionRequestRecord[]>([]);
  const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);
  const [resolvingTicket, setResolvingTicket] = useState<SupportTicketRecord | null>(null);

  function refreshAccessControl() {
    getMembers({ page_size: 100 })
      .then((data) => setMembers(data.items.filter((m) => IT_HEAD_ACCESS_ROLES.has(m.role.name))))
      .catch(() => setMembers([]));
    getPermissionRequests()
      .then(setPermissionRequests)
      .catch(() => setPermissionRequests([]));
  }

  function refreshTickets() {
    getStaffSupportTickets()
      .then(setTickets)
      .catch(() => setTickets([]));
  }

  useEffect(refreshAccessControl, [getMembers, getPermissionRequests]);
  useEffect(refreshTickets, [getStaffSupportTickets]);

  const openIssues = useMemo(() => tickets.filter((t) => t.status === 'open').length, [tickets]);
  const resolvedIssues = useMemo(
    () => tickets.filter((t) => t.status === 'resolved').length,
    [tickets],
  );
  const pendingPermissions = useMemo(
    () => permissionRequests.filter((r) => r.status === 'pending').length,
    [permissionRequests],
  );

  return (
    <div className="flex flex-col gap-6">
      <ProfileHeader name={fullName || t('auth.login.roles.it-head')} email={email ?? undefined} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatisticCard
          icon={AlertCircle}
          label={t('profile.itHeadStats.openIssues')}
          value={String(openIssues)}
        />
        <StatisticCard
          icon={TicketCheck}
          label={t('profile.itHeadStats.resolvedIssues')}
          value={String(resolvedIssues)}
        />
        <StatisticCard
          icon={KeyRound}
          label={t('profile.itHeadStats.pendingPermissions')}
          value={String(pendingPermissions)}
        />
      </div>

      <AccessControl
        members={members}
        permissionRequests={permissionRequests}
        onChanged={refreshAccessControl}
      />
      <IssueResolution tickets={tickets} onResolveClick={setResolvingTicket} />

      <ResolveTicketModal
        ticket={resolvingTicket}
        onClose={() => setResolvingTicket(null)}
        onResolved={refreshTickets}
      />
    </div>
  );
}

function formatJoinDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatPaymentDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function MemberProfile() {
  const { t } = useTranslation();
  const {
    fullName,
    email,
    userId,
    getMyReadingProgress,
    getLeaderboard,
    getMyLoans,
    getReadingProfile,
  } = useAuth();
  const { membership } = useMembershipQuery();
  const { payments } = useMyPaymentsQuery();
  const [progress, setProgress] = useState<ReadingProgressEntry[]>([]);
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [myLeaderboardEntry, setMyLeaderboardEntry] = useState<LeaderboardEntry | null>(null);
  const [readingProfile, setReadingProfile] = useState<ReadingProfile | null>(null);
  const [readingProfileLoading, setReadingProfileLoading] = useState(true);
  const [readingProfileError, setReadingProfileError] = useState(false);

  useEffect(() => {
    getMyReadingProgress().then(setProgress).catch(() => setProgress([]));
    getMyLoans().then(setLoans).catch(() => setLoans([]));
    getLeaderboard()
      .then((entries) => {
        const me = entries.find((e) => e.is_current_user || e.member_id === userId);
        setMyLeaderboardEntry(me ?? null);
      })
      .catch(() => setMyLeaderboardEntry(null));
    getReadingProfile()
      .then(setReadingProfile)
      .catch(() => setReadingProfileError(true))
      .finally(() => setReadingProfileLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const activeLoans = useMemo(
    () => loans.filter((loan) => loan.status === 'active' || loan.status === 'overdue'),
    [loans],
  );

  const currentlyReading = useMemo(() => {
    const items: Array<{ id: string; book_title: string; percent_complete: number }> = [];
    progress.forEach((p) => {
      if (p.status === 'reading') {
        items.push({ id: p.id, book_title: p.book_title, percent_complete: p.percent_complete });
      }
    });
    activeLoans.forEach((l) => {
      if (!items.some((i) => i.book_title === l.book_title)) {
        items.push({ id: l.id, book_title: l.book_title, percent_complete: 50 });
      }
    });
    return items;
  }, [progress, activeLoans]);

  const booksReadCount = useMemo(() => {
    const completedFromProgress = progress.filter((entry) => entry.status === 'completed').length;
    const returnedLoansCount = loans.filter((l) => l.status === 'returned').length;
    return Math.max(completedFromProgress, returnedLoansCount);
  }, [progress, loans]);

  const earnedBadges = new Set(myLeaderboardEntry?.badges ?? []);

  return (
    <div className="flex flex-col gap-6">
      <ProfileHeader
        name={fullName ?? ''}
        email={email ?? undefined}
        joinDate={membership ? formatJoinDate(membership.purchased_at) : undefined}
        planLabel={membership?.is_active ? membership.plan_label : undefined}
      />

      <ReadingProfileCard
        profile={readingProfile}
        isLoading={readingProfileLoading}
        isError={readingProfileError}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatisticCard icon={BookOpen} label={t('profile.stats.booksRead')} value={String(booksReadCount)} />
        <StatisticCard
          icon={Trophy}
          label="Leaderboard Score"
          value={myLeaderboardEntry ? `${myLeaderboardEntry.score} pts` : '0 pts'}
        />
        <StatisticCard
          icon={Award}
          label="Leaderboard Rank"
          value={myLeaderboardEntry ? `#${myLeaderboardEntry.rank}` : '—'}
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t('profile.paymentHistory.title')}</CardTitle>
          {payments.length > 0 && (
            <ExportButton
              filename="payment-history"
              title={t('profile.paymentHistory.title')}
              headers={[
                t('profile.paymentHistory.table.label'),
                t('profile.paymentHistory.table.amount'),
                t('profile.paymentHistory.table.status'),
                t('profile.paymentHistory.table.date'),
              ]}
              rows={payments.map((payment) => [
                payment.label,
                formatCurrency(payment.amount),
                payment.status,
                formatPaymentDate(payment.created_at),
              ])}
            />
          )}
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <EmptyState
              icon={IndianRupee}
              title={t('profile.paymentHistory.empty.title')}
              description={t('profile.paymentHistory.empty.description')}
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-foreground">{payment.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatPaymentDate(payment.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">
                      {formatCurrency(payment.amount)}
                    </span>
                    <Badge variant={payment.status === 'success' ? 'success' : 'outline'}>
                      {payment.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>{t('profile.achievements.title')}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Badges earned through community participation, reading goals, and reviews.
            </p>
          </div>
          {myLeaderboardEntry && (
            <Badge variant="outline" className="gap-1 font-semibold text-primary">
              <Trophy className="size-3.5" /> Score: {myLeaderboardEntry.score.toLocaleString()} pts (Rank #{myLeaderboardEntry.rank})
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ACHIEVEMENT_DEFINITIONS.map((ach) => {
              const unlocked = earnedBadges.has(ach.key);
              return (
                <div
                  key={ach.key}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3.5 transition-all',
                    unlocked
                      ? 'border-emerald-500/40 bg-emerald-500/5 shadow-xs'
                      : 'border-dashed border-border bg-card'
                  )}
                >
                  <div
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-lg text-lg',
                      unlocked ? 'bg-emerald-500/10' : 'bg-muted'
                    )}
                  >
                    {ach.icon}
                  </div>
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-xs text-foreground truncate">
                        {t(ach.titleKey)}
                      </span>
                      {unlocked ? (
                        <Badge variant="success" className="text-[10px] px-1.5 py-0">
                          Unlocked
                        </Badge>
                      ) : (
                        <span className="text-[10px] font-medium text-muted-foreground flex items-center gap-0.5">
                          <Lock className="size-2.5" /> Locked
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {t(ach.descKey)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('profile.currentReading.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {currentlyReading.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title={t('readingProgress.emptyState.title')}
              description={t('readingProgress.lists.currentlyReading.emptyDescription')}
            />
          ) : (
            <div className="flex flex-col gap-4">
              {currentlyReading.map((entry) => (
                <div key={entry.id}>
                  <p className="text-sm font-medium text-foreground">{entry.book_title}</p>
                  <ProgressBar percent={entry.percent_complete} className="mt-1.5" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('profile.borrowHistory.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {loans.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={t('profile.borrowHistory.empty.title')}
              description={t('profile.borrowHistory.empty.description')}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {loans.map((loan) => (
                <div
                  key={loan.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground truncate">{loan.book_title}</p>
                    <p className="text-xs text-muted-foreground">
                      Borrowed: {new Date(loan.borrowed_at).toLocaleDateString()}
                      {loan.returned_at
                        ? ` · Returned: ${new Date(loan.returned_at).toLocaleDateString()}`
                        : ` · Due: ${new Date(loan.due_date).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant={
                        loan.status === 'returned'
                          ? 'success'
                          : loan.status === 'overdue'
                          ? 'danger'
                          : 'outline'
                      }
                    >
                      {loan.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ProfilePage() {
  const { role } = useAuth();

  if (role === 'admin') return <AdminProfile />;
  if (role === 'manager' || role === 'librarian') return <ManagerProfile />;
  if (role === 'it-head') return <ITHeadProfile />;
  if (role === 'guardian') return <GuardianProfile />;

  return <MemberProfile />;
}
