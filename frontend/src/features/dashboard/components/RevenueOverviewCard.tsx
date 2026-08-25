import { Calendar, IndianRupee, TrendingUp, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { TrendLineChart } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { formatCurrency, formatMonth } from '@/lib/format';
import type { RevenueMonth } from '@/providers/AuthProvider';

function StatCell({
  label,
  value,
  icon: Icon,
  iconBgClass,
  iconTextClass,
  trend,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  iconBgClass: string;
  iconTextClass: string;
  trend?: string;
}) {
  return (
    <div className="flex items-center gap-3.5 py-1 px-3 first:pl-0 last:pr-0">
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${iconBgClass} ${iconTextClass}`}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
          <p className="text-lg font-bold text-foreground tracking-tight">{value}</p>
          {trend && (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-success/10 px-1.5 py-0.5 text-xs font-semibold text-success">
              <TrendingUp className="size-3" />
              {trend}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function RevenueOverviewCard({ months }: { months: RevenueMonth[] }) {
  const { t } = useTranslation();

  const total = months.reduce((sum, m) => sum + m.total, 0);
  const thisMonth = months.at(-1)?.total ?? 0;
  const prevMonth = months.at(-2)?.total ?? 0;
  const average = months.length === 0 ? 0 : Math.round(total / months.length);

  const momTrend =
    prevMonth > 0
      ? `${thisMonth >= prevMonth ? '+' : ''}${Math.round(((thisMonth - prevMonth) / prevMonth) * 100)}%`
      : undefined;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>{t('managerDashboard.revenue.title')}</CardTitle>
        <span className="text-xs font-normal text-muted-foreground">Last 6 Months</span>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <TrendLineChart
          data={months.map((m) => ({ label: formatMonth(m.month), value: m.total }))}
          color="var(--color-success)"
          valueFormatter={formatCurrency}
          ariaLabel={t('managerDashboard.revenue.title')}
        />
        <div className="grid grid-cols-1 divide-y divide-border rounded-xl border border-border bg-secondary/30 p-4 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <StatCell
            label={t('managerDashboard.revenue.total')}
            value={formatCurrency(total)}
            icon={IndianRupee}
            iconBgClass="bg-success/10"
            iconTextClass="text-success"
          />
          <StatCell
            label={t('managerDashboard.revenue.thisMonth')}
            value={formatCurrency(thisMonth)}
            icon={TrendingUp}
            iconBgClass="bg-emerald-500/10"
            iconTextClass="text-emerald-600 dark:text-emerald-400"
            trend={momTrend}
          />
          <StatCell
            label={t('managerDashboard.revenue.avgMonthly')}
            value={formatCurrency(average)}
            icon={Calendar}
            iconBgClass="bg-info/10"
            iconTextClass="text-info"
          />
        </div>
      </CardContent>
    </Card>
  );
}
