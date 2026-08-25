import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { MultiSegmentPie, ProgressBar } from '@/components/common';
import { NoResults } from '@/components/feedback';
import { Loader, Modal } from '@/components/ui';
import { formatCurrency, formatMonth } from '@/lib/format';
import {
  useAuth,
  type ExpenseBreakdownReport,
  type MembershipGrowthReport,
  type ProfitAndLossReport,
  type RevenueByPlanReport,
} from '@/providers/AuthProvider';

const CATEGORY_COLORS: Record<string, string> = {
  staffSalaries: 'var(--color-primary)',
  salaries: 'var(--color-primary)',
  bookProcurement: 'var(--color-info)',
  books: 'var(--color-info)',
  utilities: 'var(--color-success)',
  maintenance: 'var(--color-success)',
  marketing: 'var(--color-warning)',
  operations: 'var(--color-warning)',
};

export type ReportKey =
  | 'revenueByPlan'
  | 'profitAndLoss'
  | 'expenseBreakdown'
  | 'membershipGrowth';

export interface ReportModalProps {
  reportKey: ReportKey | null;
  onClose: () => void;
}


function RevenueByPlanContent({ report }: { report: RevenueByPlanReport }) {
  const { t } = useTranslation();

  if (report.items.length === 0) {
    return <NoResults title={t('admin.reports.empty')} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {report.items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground">{item.label}</span>
            <span className="font-medium text-foreground">
              {formatCurrency(item.amount)} · {t('admin.reports.paymentsCount', { count: item.count })}
            </span>
          </div>
          <ProgressBar percent={report.total > 0 ? (item.amount / report.total) * 100 : 0} />
        </div>
      ))}
      <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
        <span className="text-foreground">{t('admin.cashFlow.total')}</span>
        <span className="text-foreground">{formatCurrency(report.total)}</span>
      </div>
    </div>
  );
}

function ProfitAndLossContent({ report }: { report: ProfitAndLossReport }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {report.months.map((month) => (
          <div key={month.month} className="flex flex-col gap-1 rounded-md bg-secondary/50 p-2.5 text-sm">
            <span className="font-medium text-foreground">{formatMonth(month.month)}</span>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>{t('admin.reports.profitAndLossLabels.revenue')}</span>
              <span className="text-foreground">{formatCurrency(month.revenue)}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>{t('admin.reports.profitAndLossLabels.expenses')}</span>
              <span className="text-foreground">{formatCurrency(month.expenses)}</span>
            </div>
            <div className="flex items-center justify-between font-medium">
              <span className="text-foreground">{t('admin.reports.profitAndLossLabels.netProfit')}</span>
              <span className={month.net_profit >= 0 ? 'text-success' : 'text-danger'}>
                {formatCurrency(month.net_profit)}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1 border-t border-border pt-2 text-sm font-semibold">
        <div className="flex items-center justify-between">
          <span className="text-foreground">{t('admin.reports.profitAndLossLabels.totalRevenue')}</span>
          <span className="text-foreground">{formatCurrency(report.total_revenue)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-foreground">{t('admin.reports.profitAndLossLabels.totalExpenses')}</span>
          <span className="text-foreground">{formatCurrency(report.total_expenses)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-foreground">{t('admin.reports.profitAndLossLabels.totalNetProfit')}</span>
          <span className={report.total_net_profit >= 0 ? 'text-success' : 'text-danger'}>
            {formatCurrency(report.total_net_profit)}
          </span>
        </div>
      </div>
    </div>
  );
}

function ExpenseBreakdownContent({ report }: { report: ExpenseBreakdownReport }) {
  const { t } = useTranslation();

  if (report.items.length === 0) {
    return <NoResults title={t('admin.reports.empty')} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-center text-xs text-foreground shadow-xs">
        <span className="font-semibold text-primary">All-Time Historical Scope:</span> Cumulative expenditure breakdown across all library operations
      </div>
      <MultiSegmentPie
        ariaLabel={t('admin.reports.titles.expenseBreakdown')}
        valueFormatter={formatCurrency}
        segments={report.items.map((item, idx) => ({
          key: item.category,
          label: t(`admin.budget.categories.${item.category}`, { defaultValue: item.category }),
          value: item.amount,
          color:
            CATEGORY_COLORS[item.category] ||
            ['#3b82f6', '#eab308', '#c084fc', '#22c55e', '#f97316', '#ec4899'][idx % 6],
        }))}
      />
      <div className="flex items-center justify-between border-t border-border pt-3 text-sm font-semibold">
        <span className="text-foreground">{t('admin.reports.totalHistoricalExpenses', 'Total Historical Expenses')}</span>
        <span className="text-foreground">{formatCurrency(report.total)}</span>
      </div>
    </div>
  );
}

function MembershipGrowthContent({ report }: { report: MembershipGrowthReport }) {
  const { t } = useTranslation();
  const maxNewMembers = Math.max(1, ...report.months.map((month) => month.new_members));

  return (
    <div className="flex flex-col gap-3">
      {report.months.map((month) => (
        <div key={month.month} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground">{formatMonth(month.month)}</span>
            <span className="font-medium text-foreground">
              {t('admin.reports.membershipGrowthLabels.newMembers', { count: month.new_members })}
              {' · '}
              {t('admin.reports.membershipGrowthLabels.totalMembers', { count: month.total_members })}
            </span>
          </div>
          <ProgressBar percent={(month.new_members / maxNewMembers) * 100} />
        </div>
      ))}
    </div>
  );
}

const REPORT_TITLE_KEYS: Record<ReportKey, string> = {
  revenueByPlan: 'admin.reports.items.revenueByPlan',
  profitAndLoss: 'admin.reports.items.profitAndLoss',
  expenseBreakdown: 'admin.reports.items.expenseBreakdown',
  membershipGrowth: 'admin.reports.items.membershipGrowth',
};

// A dedicated component (rather than fetching inline in ReportModal) so that
// mounting it fresh via `key={reportKey}` gives each report its own starting
// "loading" state, instead of resetting state imperatively inside an effect.
function ReportBody({ reportKey }: { reportKey: ReportKey }) {
  const { t } = useTranslation();
  const {
    getRevenueByPlanReport,
    getProfitAndLossReport,
    getExpenseBreakdownReport,
    getMembershipGrowthReport,
  } = useAuth();
  const [content, setContent] = useState<ReactNode | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = {
      revenueByPlan: () =>
        getRevenueByPlanReport().then((report) => <RevenueByPlanContent report={report} />),
      profitAndLoss: () =>
        getProfitAndLossReport().then((report) => <ProfitAndLossContent report={report} />),
      expenseBreakdown: () =>
        getExpenseBreakdownReport().then((report) => <ExpenseBreakdownContent report={report} />),
      membershipGrowth: () =>
        getMembershipGrowthReport().then((report) => <MembershipGrowthContent report={report} />),
    }[reportKey];

    load()
      .then((node) => !cancelled && setContent(node))
      .catch(() => !cancelled && setHasError(true));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportKey]);

  if (hasError) {
    return <p className="text-sm text-danger">{t('common.errors.generic')}</p>;
  }

  if (!content) {
    return (
      <div className="flex justify-center py-8">
        <Loader />
      </div>
    );
  }

  return <>{content}</>;
}

export function ReportModal({ reportKey, onClose }: ReportModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={reportKey !== null}
      onClose={onClose}
      title={reportKey ? t(REPORT_TITLE_KEYS[reportKey]) : undefined}
      className="max-w-lg"
    >
      {reportKey && <ReportBody key={reportKey} reportKey={reportKey} />}
    </Modal>
  );
}
