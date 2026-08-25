import {
  ArrowRight,
  BadgeIndianRupee,
  BarChart3,
  CalendarPlus,
  HandCoins,
  IndianRupee,
  Megaphone,
  PieChart,
  ReceiptText,
  Star,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  IconBadge,
  type IconBadgeTone,
  MultiSegmentPie,
  PageHeader,
  Pagination,
  QuickActionsCard,
  StatisticCard,
  TableToolbar,
} from '@/components/common';
import { ErrorState, LoadingState } from '@/components/feedback';
import { usePagination } from '@/hooks';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import {
  type AdminDashboard,
  type AdminTrend,
  type AuditLogEntry,
  type BillingRequestRecord,
  type ExpenseCategory,
  useAuth,
} from '@/providers/AuthProvider';

import { CreateEventModal } from '@/features/events/components/CreateEventModal';

import { AdjustPricingModal } from '../components/AdjustPricingModal';
import { AnnouncementModal } from '../components/AnnouncementModal';
import { AuditLog } from '../components/AuditLog';
import { BudgetExpenses } from '../components/BudgetExpenses';
import { CashFlowBreakdown } from '../components/CashFlowBreakdown';
import { EditBudgetModal } from '../components/EditBudgetModal';
import { InviteMemberModal } from '../components/InviteMemberModal';
import { LiveSeatStatus } from '../components/LiveSeatStatus';
import { LogExpenseModal } from '../components/LogExpenseModal';
import { PendingLibraryReviewsModal } from '../components/PendingLibraryReviewsModal';
import { PendingRequests } from '../components/PendingRequests';
import { RecentActivities } from '../components/RecentActivities';
import { ReportModal, type ReportKey } from '../components/ReportModal';
import { SeatOccupancySummary } from '../components/SeatOccupancySummary';
import { StatTrendModal, type StatKey } from '../components/StatTrendModal';
import { WaiveFineModal } from '../components/WaiveFineModal';

// More spending is bad news even when the number itself goes up — invert the
// default up-is-good sentiment for this one stat.
function expenseSentiment(trend: AdminTrend): 'positive' | 'negative' {
  return trend.direction === 'up' ? 'negative' : 'positive';
}

// Fixed per category, same reasoning as AccessByRoleCard's ROLE_COLORS — a category
// with ₹0 spent this period still gets a stable color if it picks up spend later.
// Avoids danger/success: BudgetExpenses (elsewhere on this page) already uses those
// for over-budget/on-track status on these same categories, so reusing them here as
// plain identity color would clash with that meaning.
const EXPENSE_CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  staffSalaries: 'var(--color-primary)',
  bookProcurement: 'var(--color-info)',
  utilities: 'var(--color-success)',
  marketing: 'var(--color-warning)',
};

const REPORTS: { key: ReportKey; labelKey: string; icon: LucideIcon; tone: IconBadgeTone }[] = [
  { key: 'revenueByPlan', labelKey: 'admin.reports.items.revenueByPlan', icon: IndianRupee, tone: 'success' },
  { key: 'profitAndLoss', labelKey: 'admin.reports.items.profitAndLoss', icon: BarChart3, tone: 'warning' },
  { key: 'expenseBreakdown', labelKey: 'admin.reports.items.expenseBreakdown', icon: PieChart, tone: 'primary-tint' },
  { key: 'membershipGrowth', labelKey: 'admin.reports.items.membershipGrowth', icon: TrendingUp, tone: 'info' },
];

export function AdminDashboardPage() {
  const { t } = useTranslation();
  const { getAdminDashboard, getBillingRequests, getAuditLog } = useAuth();
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [billingRequests, setBillingRequests] = useState<BillingRequestRecord[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [billingLoading, setBillingLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState(false);
  const [billingError, setBillingError] = useState(false);
  const [auditError, setAuditError] = useState(false);
  const [loggingCategory, setLoggingCategory] = useState<ExpenseCategory | null>(null);
  const [isLogExpenseOpen, setIsLogExpenseOpen] = useState(false);
  const [isEditBudgetOpen, setIsEditBudgetOpen] = useState(false);
  const [isWaiveFineOpen, setIsWaiveFineOpen] = useState(false);
  const [isAdjustPricingOpen, setIsAdjustPricingOpen] = useState(false);
  const [isInviteMemberOpen, setIsInviteMemberOpen] = useState(false);
  const [isAnnouncementOpen, setIsAnnouncementOpen] = useState(false);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [isPendingReviewsOpen, setIsPendingReviewsOpen] = useState(false);
  const [activeReport, setActiveReport] = useState<ReportKey | null>(null);
  const [activeStat, setActiveStat] = useState<StatKey | null>(null);
  const [reportFilter, setReportFilter] = useState('all');
  const [reportSort, setReportSort] = useState('name-asc');

  function refresh() {
    void Promise.resolve().then(async () => {
      setDashboardLoading(true);
      setDashboardError(false);
      try {
        setDashboard(await getAdminDashboard());
      } catch {
        setDashboardError(true);
      } finally {
        setDashboardLoading(false);
      }
    });
  }

  function refreshBillingRequests() {
    void Promise.resolve().then(async () => {
      setBillingLoading(true);
      setBillingError(false);
      try {
        setBillingRequests(await getBillingRequests());
      } catch {
        setBillingError(true);
      } finally {
        setBillingLoading(false);
      }
    });
  }

  function refreshAuditLog() {
    void Promise.resolve().then(async () => {
      setAuditLoading(true);
      setAuditError(false);
      try {
        setAuditLog(await getAuditLog());
      } catch {
        setAuditError(true);
      } finally {
        setAuditLoading(false);
      }
    });
  }

  useEffect(refresh, [getAdminDashboard]);
  useEffect(refreshBillingRequests, [getBillingRequests]);
  useEffect(refreshAuditLog, [getAuditLog]);

  const visibleReports = useMemo(() => {
    const reportEntries = REPORTS.filter((report) => {
      if (reportFilter === 'all') return true;
      if (reportFilter === 'financial') {
        return ['revenueByPlan', 'profitAndLoss', 'expenseBreakdown'].includes(report.key);
      }
      if (reportFilter === 'membership') {
        return report.key === 'membershipGrowth';
      }
      return true;
    });

    const sortedReports = [...reportEntries];
    if (reportSort === 'name-desc') {
      sortedReports.sort((a, b) => b.labelKey.localeCompare(a.labelKey));
    } else {
      sortedReports.sort((a, b) => a.labelKey.localeCompare(b.labelKey));
    }

    return sortedReports;
  }, [reportFilter, reportSort]);

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(visibleReports, 5);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('admin.pageTitle')} description={t('admin.pageDescription')} />

      <h2 className="sr-only">{t('common.dashboardSectionsHeading')}</h2>

      {dashboardLoading ? (
        <LoadingState label="Loading dashboard" />
      ) : dashboardError ? (
        <ErrorState onRetry={refresh} />
      ) : dashboard ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatisticCard
              icon={IndianRupee}
              label={t('admin.stats.revenueMtd')}
              value={formatCurrency(dashboard.stats.revenue_mtd)}
              trend={dashboard.stats.revenue_trend}
              onClick={() => setActiveStat('revenueMtd')}
              selected={activeStat === 'revenueMtd'}
            />
            <StatisticCard
              icon={TrendingDown}
              label={t('admin.stats.expensesMtd')}
              value={formatCurrency(dashboard.stats.expenses_mtd)}
              trend={{
                ...dashboard.stats.expenses_trend,
                sentiment: expenseSentiment(dashboard.stats.expenses_trend),
              }}
              onClick={() => setActiveStat('expensesMtd')}
              selected={activeStat === 'expensesMtd'}
            />
            <StatisticCard
              icon={Wallet}
              label={t('admin.stats.netProfitMtd')}
              value={formatCurrency(dashboard.stats.net_profit_mtd)}
              trend={dashboard.stats.net_profit_trend}
              onClick={() => setActiveStat('netProfitMtd')}
              selected={activeStat === 'netProfitMtd'}
            />
            <StatisticCard
              icon={Users}
              label={t('admin.stats.totalMembers')}
              value={String(dashboard.stats.total_members)}
              trend={dashboard.stats.total_members_trend}
              onClick={() => setActiveStat('totalMembers')}
              selected={activeStat === 'totalMembers'}
            />
          </div>

          {dashboard.budget.length > 0 && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>{t('admin.reports.items.expenseBreakdown')}</CardTitle>
                  <span className="text-xs font-medium text-muted-foreground">Month-To-Date (MTD)</span>
                </CardHeader>
                <CardContent>
                  <MultiSegmentPie
                    ariaLabel={t('admin.reports.items.expenseBreakdown')}
                    valueFormatter={formatCurrency}
                    segments={dashboard.budget.map((category) => ({
                      key: category.category,
                      label: t(`admin.budget.categories.${category.category}`),
                      value: category.spent,
                      color: EXPENSE_CATEGORY_COLORS[category.category] || '#3b82f6',
                    }))}
                  />
                </CardContent>
              </Card>

              <RecentActivities entries={auditLog} />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CashFlowBreakdown sources={dashboard.cash_flow} />
            <BudgetExpenses
              categories={dashboard.budget}
              onLogExpense={setLoggingCategory}
              onEditBudget={() => setIsEditBudgetOpen(true)}
            />
          </div>

          <LiveSeatStatus status={dashboard.seat_status} />

          <SeatOccupancySummary slots={dashboard.seat_occupancy} />
        </>
      ) : null}

      {billingLoading ? (
        <LoadingState label="Loading pending requests" />
      ) : billingError ? (
        <ErrorState onRetry={refreshBillingRequests} />
      ) : (
        <PendingRequests
          requests={billingRequests}
          onDecided={() => {
            refreshBillingRequests();
            refreshAuditLog();
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {auditLoading ? (
          <LoadingState label="Loading audit log" />
        ) : auditError ? (
          <ErrorState onRetry={refreshAuditLog} />
        ) : (
          <AuditLog entries={auditLog} />
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle>{t('admin.reports.title')}</CardTitle>
            <TableToolbar
              variant="icon-only"
              filters={[
                {
                  label: t('admin.reports.filters.categoryLabel'),
                  value: reportFilter,
                  onChange: (value) => {
                    setReportFilter(value);
                    setPage(1);
                  },
                  options: [
                    { value: 'all', label: t('admin.reports.filters.categoryOptions.all') },
                    { value: 'financial', label: t('admin.reports.filters.categoryOptions.financial') },
                    { value: 'membership', label: t('admin.reports.filters.categoryOptions.membership') },
                  ],
                },
              ]}
              sort={{
                label: t('common.actions.sort'),
                value: reportSort,
                onChange: (value) => {
                  setReportSort(value);
                  setPage(1);
                },
                options: [
                  { value: 'name-asc', label: t('admin.reports.sort.nameAsc') },
                  { value: 'name-desc', label: t('admin.reports.sort.nameDesc') },
                ],
              }}
              onReset={() => {
                setReportFilter('all');
                setReportSort('name-asc');
                setPage(1);
              }}
              resetLabel={t('common.actions.reset')}
            />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">

            <div className="flex flex-col gap-3">
              {paginatedItems.map((report) => (
                <div
                  key={report.key}
                  className="flex items-center gap-3 rounded-lg border border-border p-3"
                >
                  <IconBadge icon={report.icon} tone={report.tone} shape="square" size={11} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{t(report.labelKey)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t(`admin.reports.descriptions.${report.key}`)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 gap-1 text-primary hover:bg-transparent hover:underline"
                    onClick={() => setActiveReport(report.key)}
                  >
                    {t('common.actions.viewReport')}
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={5}
              onPageChange={setPage}
            />
          </CardContent>
        </Card>
      </div>

      <QuickActionsCard
        actions={[
          {
            label: t('events.form.createTitle'),
            icon: CalendarPlus,
            onClick: () => setCreateEventOpen(true),
          },
          {
            label: t('admin.quickActions.logExpense'),
            icon: ReceiptText,
            onClick: () => setIsLogExpenseOpen(true),
          },
          {
            label: t('admin.quickActions.adjustPricing'),
            icon: BadgeIndianRupee,
            onClick: () => setIsAdjustPricingOpen(true),
          },
          {
            label: t('admin.quickActions.inviteMember'),
            icon: UserPlus,
            onClick: () => setIsInviteMemberOpen(true),
          },
          {
            label: t('admin.quickActions.announcement'),
            icon: Megaphone,
            onClick: () => setIsAnnouncementOpen(true),
          },
          {
            label: t('admin.quickActions.viewGrowthReport'),
            icon: TrendingUp,
            onClick: () => setActiveReport('membershipGrowth'),
          },
          {
            label: t('admin.quickActions.waiveFine'),
            icon: HandCoins,
            onClick: () => setIsWaiveFineOpen(true),
          },
          {
            label: t('admin.quickActions.reviewLibraryReviews'),
            icon: Star,
            onClick: () => setIsPendingReviewsOpen(true),
          },
        ]}
      />

      <PendingLibraryReviewsModal
        open={isPendingReviewsOpen}
        onClose={() => setIsPendingReviewsOpen(false)}
      />

      <ReportModal reportKey={activeReport} onClose={() => setActiveReport(null)} />

      <StatTrendModal statKey={activeStat} onClose={() => setActiveStat(null)} />

      <WaiveFineModal
        open={isWaiveFineOpen}
        onClose={() => setIsWaiveFineOpen(false)}
        onWaived={() => {
          refreshBillingRequests();
          refreshAuditLog();
        }}
      />

      <LogExpenseModal
        open={loggingCategory !== null || isLogExpenseOpen}
        onClose={() => {
          setLoggingCategory(null);
          setIsLogExpenseOpen(false);
        }}
        category={loggingCategory}
        categoryLabel={loggingCategory ? t(`admin.budget.categories.${loggingCategory}`) : undefined}
        onLogged={() => {
          refresh();
          refreshAuditLog();
        }}
      />

      <EditBudgetModal
        open={isEditBudgetOpen}
        onClose={() => setIsEditBudgetOpen(false)}
        categories={dashboard?.budget ?? []}
        onSaveAllocations={(allocations) => {
          if (!dashboard) return;
          setDashboard({
            ...dashboard,
            budget: dashboard.budget.map((cat) => ({
              ...cat,
              budgeted: allocations[cat.category] ?? cat.budgeted,
            })),
          });
          refreshAuditLog();
        }}
      />

      <AdjustPricingModal open={isAdjustPricingOpen} onClose={() => setIsAdjustPricingOpen(false)} />

      <InviteMemberModal
        open={isInviteMemberOpen}
        onClose={() => setIsInviteMemberOpen(false)}
        onInvited={refresh}
      />

      <AnnouncementModal
        open={isAnnouncementOpen}
        onClose={() => setIsAnnouncementOpen(false)}
        onSent={refreshAuditLog}
      />

      <CreateEventModal
        open={createEventOpen}
        onClose={() => setCreateEventOpen(false)}
        onSaved={() => setCreateEventOpen(false)}
      />
    </div>
  );
}
