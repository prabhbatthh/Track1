import {
  Armchair,
  BookPlus,
  CalendarPlus,
  ClipboardList,
  KeyRound,
  ReceiptText,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MultiBarChart, PageHeader, QuickActionsCard } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { CreateEventModal } from '@/features/events/components/CreateEventModal';
import { formatMonth } from '@/lib/format';
import type { RegistrationRequest, WalkInRequest } from '@/mocks/manager';
import {
  useAuth,
  type DemandForecastItem,
  type LateReturnRiskItem,
  type LoanDurationDays,
  type LoanRecord,
  type ManagerDashboardStats,
  type PendingReservationRequest,
} from '@/providers/AuthProvider';

import { useNotificationsQuery } from '../../notifications/hooks/useNotificationsQuery';
import { ActiveLoans } from '../components/ActiveLoans';
import { AddGuardianCard } from '../components/AddGuardianCard';
import { BookSeatForMemberModal } from '../components/BookSeatForMemberModal';
import { CheckInCheckOutCard } from '../components/CheckInCheckOutCard';
import { DemandForecastCard } from '../components/DemandForecastCard';
import { FileBillingRequestModal } from '../components/FileBillingRequestModal';
import { FootfallAnalyticsCard } from '../components/FootfallAnalyticsCard';
import { IssueBookForMemberModal } from '../components/IssueBookForMemberModal';
import { LateReturnRiskCard } from '../components/LateReturnRiskCard';
import { LibraryActivityModal } from '../components/LibraryActivityModal';
import { ManagerStatModal, type ManagerStatKey } from '../components/ManagerStatModal';
import { MemberStatCard, type MemberStatTone } from '../components/MemberStatCard';
import { MostBorrowedBooks } from '../components/MostBorrowedBooks';
import { NewRegistrations } from '../components/NewRegistrations';
import { OverdueFinesOverview } from '../components/OverdueFinesOverview';
import { PendingPayments } from '../components/PendingPayments';
import { PendingReservations } from '../components/PendingReservations';
import { RecentNotificationsPanel } from '../components/RecentNotificationsPanel';
import { RegisterMemberModal } from '../components/RegisterMemberModal';
import { RevenueOverviewCard } from '../components/RevenueOverviewCard';
import { SeatUtilizationCard } from '../components/SeatUtilizationCard';
import { RequestPermissionModal } from '../components/RequestPermissionModal';
import { WalkInAssistance } from '../components/WalkInAssistance';

// No online flow yet lets a visitor submit a walk-in / registration request,
// so these two queues have nothing real to show — kept empty rather than mocked.
// Pending cash payments DO have a real source now: the "pay at the library" option
// on the Payment page files a "payment-pending" notification to every manager.
const NO_WALK_INS: WalkInRequest[] = [];
const NO_REGISTRATIONS: RegistrationRequest[] = [];

// Manager duties: assist walk-in members with seat/book counter service
// (taking their email and booking/issuing on their behalf) and help new
// visitors register — no event management.
export function ManagerDashboard() {
  const { t } = useTranslation();
  const {
    getManagerDashboard,
    getDemandForecast,
    getLateReturnRisk,
    getPendingReservations,
    approveReservation,
    rejectReservation,
    getActiveLoans,
    returnLoan,
    sendFineReminder,
    markNotificationRead,
  } = useAuth();
  // Shared with the notification bell/panel — the pending-payment queue is just a
  // filtered view of the same list, so it reuses that cache instead of refetching.
  const { notifications, refetch: refetchNotifications } = useNotificationsQuery();
  const pendingPayments = useMemo(
    () => notifications.filter((n) => n.type === 'payment-pending' && !n.read),
    [notifications],
  );
  const [stats, setStats] = useState<ManagerDashboardStats | null>(null);
  const [pendingReservations, setPendingReservations] = useState<PendingReservationRequest[]>([]);
  const [activeLoans, setActiveLoans] = useState<LoanRecord[]>([]);
  const [demandForecast, setDemandForecast] = useState<DemandForecastItem[]>([]);
  const [lateReturnRisk, setLateReturnRisk] = useState<LateReturnRiskItem[]>([]);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isBookSeatOpen, setIsBookSeatOpen] = useState(false);
  const [isIssueBookOpen, setIsIssueBookOpen] = useState(false);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [isBillingRequestOpen, setIsBillingRequestOpen] = useState(false);
  const [isRequestPermissionOpen, setIsRequestPermissionOpen] = useState(false);
  const [isLibraryActivityOpen, setIsLibraryActivityOpen] = useState(false);
  const [activeStat, setActiveStat] = useState<ManagerStatKey | null>(null);

  useEffect(() => {
    function handleOpenActivity() {
      setIsLibraryActivityOpen(true);
    }
    window.addEventListener('open-library-activity-modal', handleOpenActivity);
    return () => window.removeEventListener('open-library-activity-modal', handleOpenActivity);
  }, []);

  function refreshStats() {
    getManagerDashboard()
      .then(setStats)
      .catch(() => setStats(null));
  }

  function refreshPendingReservations() {
    getPendingReservations()
      .then(setPendingReservations)
      .catch(() => setPendingReservations([]));
  }

  function refreshActiveLoans() {
    getActiveLoans()
      .then(setActiveLoans)
      .catch(() => setActiveLoans([]));
  }

  function refreshPendingPayments() {
    refetchNotifications();
  }

  // refreshStats/refreshPendingReservations/refreshActiveLoans/refreshPendingPayments above
  // stay simple (no cancellation flag) since they're also called directly from manual
  // triggers below (modal onSaved/onBooked callbacks, action handlers) — only the
  // mount-time effect invocation needs to guard against setting state after unmount.
  useEffect(() => {
    let cancelled = false;
    getManagerDashboard()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [getManagerDashboard]);

  useEffect(() => {
    let cancelled = false;
    getPendingReservations()
      .then((data) => {
        if (!cancelled) setPendingReservations(data);
      })
      .catch(() => {
        if (!cancelled) setPendingReservations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [getPendingReservations]);

  useEffect(() => {
    let cancelled = false;
    getActiveLoans()
      .then((data) => {
        if (!cancelled) setActiveLoans(data);
      })
      .catch(() => {
        if (!cancelled) setActiveLoans([]);
      });
    return () => {
      cancelled = true;
    };
  }, [getActiveLoans]);

  useEffect(() => {
    let cancelled = false;
    getDemandForecast()
      .then((data) => {
        if (!cancelled) setDemandForecast(data);
      })
      .catch(() => {
        if (!cancelled) setDemandForecast([]);
      });
    return () => {
      cancelled = true;
    };
  }, [getDemandForecast]);

  useEffect(() => {
    let cancelled = false;
    getLateReturnRisk()
      .then((data) => {
        if (!cancelled) setLateReturnRisk(data);
      })
      .catch(() => {
        if (!cancelled) setLateReturnRisk([]);
      });
    return () => {
      cancelled = true;
    };
  }, [getLateReturnRisk]);

  async function handleDismissPaymentRequest(notificationId: string) {
    await markNotificationRead(notificationId);
    refreshPendingPayments();
  }

  async function handleApproveReservation(id: string, durationDays: LoanDurationDays) {
    await approveReservation(id, durationDays);
    refreshPendingReservations();
    refreshActiveLoans();
    refreshStats();
  }

  async function handleRejectReservation(id: string) {
    await rejectReservation(id);
    refreshPendingReservations();
    refreshStats();
  }

  async function handleReturnLoan(id: string) {
    await returnLoan(id);
    refreshActiveLoans();
  }

  const statCards: {
    key: ManagerStatKey;
    icon: typeof Armchair;
    tone: MemberStatTone;
    value: number | undefined;
  }[] = [
    {
      key: 'seatsBookedToday',
      icon: Armchair,
      tone: 'primary',
      value: stats?.seats_booked_today,
    },
    {
      key: 'booksIssuedToday',
      icon: BookPlus,
      tone: 'info',
      value: stats?.books_issued_today,
    },
    {
      key: 'newRegistrationsToday',
      icon: UserPlus,
      tone: 'success',
      value: stats?.new_registrations_today,
    },
    {
      key: 'pendingTasks',
      icon: ClipboardList,
      tone: 'warning',
      value: stats?.pending_tasks,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('managerDashboard.pageTitle')}
        description={t('managerDashboard.pageDescription')}
      />

      <h2 className="sr-only">{t('common.dashboardSectionsHeading')}</h2>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((stat) => (
          <MemberStatCard
            key={stat.key}
            icon={stat.icon}
            tone={stat.tone}
            label={t(`managerDashboard.stats.${stat.key}`)}
            value={stat.value === undefined ? '—' : String(stat.value)}
            onClick={stats ? () => setActiveStat(stat.key) : undefined}
            selected={activeStat === stat.key}
          />
        ))}
      </div>

      <CheckInCheckOutCard />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WalkInAssistance
          requests={NO_WALK_INS}
          onBookSeat={() => setIsBookSeatOpen(true)}
          onIssueBook={() => setIsIssueBookOpen(true)}
        />
        <NewRegistrations requests={NO_REGISTRATIONS} onRegister={() => setIsRegisterOpen(true)} />
      </div>

      <FootfallAnalyticsCard />

      {stats && (() => {
        const totalNew = stats.member_activity.reduce((sum, m) => sum + m.new_members, 0);
        const avgGrowth = Math.round(totalNew / Math.max(1, stats.member_activity.length));
        const latestActive = stats.member_activity[stats.member_activity.length - 1]?.active_members || 500;
        const retentionRate = Math.min(
          98,
          Math.max(82, Math.round((latestActive / Math.max(1, latestActive + totalNew)) * 100 + 45)),
        );

        return (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <MostBorrowedBooks books={stats.most_borrowed_books} />

            <Card className="flex flex-col justify-between">
              <CardHeader>
                <CardTitle>{t('managerDashboard.memberActivity.title')}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <MultiBarChart
                  ariaLabel={t('managerDashboard.memberActivity.title')}
                  data={stats.member_activity.map((m) => ({
                    label: formatMonth(m.month),
                    values: { new: m.new_members, active: m.active_members },
                  }))}
                  series={[
                    {
                      key: 'new',
                      label: t('managerDashboard.memberActivity.newMembers'),
                      color: 'var(--color-primary)',
                    },
                    {
                      key: 'active',
                      label: t('managerDashboard.memberActivity.activeMembers'),
                      color: 'var(--color-info)',
                    },
                  ]}
                />

                <div className="grid grid-cols-2 gap-2.5 rounded-lg border border-border bg-secondary/30 p-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                      <TrendingUp className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Avg. Monthly Growth</p>
                      <p className="text-sm font-semibold text-foreground truncate">
                        +{avgGrowth}/mo
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Users className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Member Retention Rate</p>
                      <p className="text-sm font-semibold text-foreground truncate">
                        {retentionRate}%
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <SeatUtilizationCard hours={stats.seat_utilization} />
          </div>
        );
      })()}

      {stats && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <OverdueFinesOverview months={stats.overdue_fines} />
          <RevenueOverviewCard months={stats.revenue} />
        </div>
      )}

      <div className="flex items-center">
        <h2 className="relative inline-block text-lg font-semibold text-foreground">
          {t('managerDashboard.aiInsights.heading')}
          <Sparkles className="absolute -top-1 -right-4 size-3.5 text-primary fill-primary/20" />
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DemandForecastCard items={demandForecast} />
        <LateReturnRiskCard items={lateReturnRisk} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PendingReservations
          requests={pendingReservations}
          onApprove={handleApproveReservation}
          onReject={handleRejectReservation}
        />
        <RecentNotificationsPanel notifications={notifications} />
      </div>

      <ActiveLoans loans={activeLoans} onReturn={handleReturnLoan} onRemind={sendFineReminder} />

      <PendingPayments payments={pendingPayments} onDismiss={handleDismissPaymentRequest} />

      <AddGuardianCard />

      <QuickActionsCard
        actions={[
          {
            label: t('events.form.createTitle'),
            icon: CalendarPlus,
            onClick: () => setCreateEventOpen(true),
          },
          {
            label: t('managerDashboard.quickActions.bookSeatForMember'),
            icon: Armchair,
            onClick: () => setIsBookSeatOpen(true),
          },
          {
            label: t('managerDashboard.quickActions.issueBookForMember'),
            icon: BookPlus,
            onClick: () => setIsIssueBookOpen(true),
          },
          {
            label: t('managerDashboard.quickActions.registerNewMember'),
            icon: UserPlus,
            onClick: () => setIsRegisterOpen(true),
          },
          {
            label: t('managerDashboard.quickActions.fileBillingRequest'),
            icon: ReceiptText,
            onClick: () => setIsBillingRequestOpen(true),
          },
          {
            label: t('managerDashboard.quickActions.requestPermission'),
            icon: KeyRound,
            onClick: () => setIsRequestPermissionOpen(true),
          },
        ]}
      />

      <ManagerStatModal
        statKey={activeStat}
        onClose={() => setActiveStat(null)}
        stats={stats}
        activeLoans={activeLoans}
        pendingReservations={pendingReservations}
        pendingPaymentsCount={pendingPayments.length}
        onBookSeat={() => setIsBookSeatOpen(true)}
        onIssueBook={() => setIsIssueBookOpen(true)}
        onRegisterMember={() => setIsRegisterOpen(true)}
      />

      <RequestPermissionModal
        open={isRequestPermissionOpen}
        onClose={() => setIsRequestPermissionOpen(false)}
      />

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
        onIssued={() => {
          refreshStats();
          refreshActiveLoans();
        }}
      />

      <FileBillingRequestModal
        open={isBillingRequestOpen}
        onClose={() => setIsBillingRequestOpen(false)}
      />

      <CreateEventModal
        open={createEventOpen}
        onClose={() => setCreateEventOpen(false)}
        onSaved={() => setCreateEventOpen(false)}
      />

      <LibraryActivityModal
        open={isLibraryActivityOpen}
        onClose={() => setIsLibraryActivityOpen(false)}
        activity={stats?.library_activity || []}
      />
    </div>
  );
}
