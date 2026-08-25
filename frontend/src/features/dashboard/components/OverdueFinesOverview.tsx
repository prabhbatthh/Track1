import { TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ComboBarLineChart } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatCurrency, formatMonth } from '@/lib/format';
import type { OverdueFinesMonth } from '@/providers/AuthProvider';

interface Trend {
  direction: 'up' | 'down';
  percent: number;
}

// Latest vs. previous of the 3 months shown — same idea as the admin dashboard's own
// month-over-month trend arrows, just computed client-side since these are derived from
// a list already on the page rather than a dedicated backend field.
function trendFor(current: number, previous: number): Trend | null {
  if (previous === 0) return null;
  return {
    direction: current >= previous ? 'up' : 'down',
    percent: Math.round((Math.abs(current - previous) / previous) * 100),
  };
}

function StatCell({
  label,
  value,
  trend,
  goodDirection,
}: {
  label: string;
  value: string;
  trend: Trend | null;
  /** Which direction counts as good news for this metric — more overdue books isn't. */
  goodDirection: 'up' | 'down';
}) {
  const sentiment = trend ? (trend.direction === goodDirection ? 'positive' : 'negative') : null;

  return (
    <div>
      <p className="text-lg font-semibold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {trend && (
        <p
          className={cn(
            'mt-0.5 flex items-center gap-1 text-xs font-medium',
            sentiment === 'positive' ? 'text-success' : 'text-danger',
          )}
        >
          {trend.direction === 'up' ? (
            <TrendingUp className="size-3.5" aria-hidden="true" />
          ) : (
            <TrendingDown className="size-3.5" aria-hidden="true" />
          )}
          {trend.percent}%
        </p>
      )}
    </div>
  );
}

export function OverdueFinesOverview({ months }: { months: OverdueFinesMonth[] }) {
  const { t } = useTranslation();

  const totalOverdue = months.reduce((sum, m) => sum + m.overdue_books, 0);
  const totalGenerated = months.reduce((sum, m) => sum + m.fines_generated, 0);
  const totalCollected = months.reduce((sum, m) => sum + m.fines_collected, 0);
  const collectionRate = totalGenerated === 0 ? 0 : Math.round((totalCollected / totalGenerated) * 100);

  const latest = months.at(-1);
  const previous = months.at(-2);
  const latestRate =
    latest && latest.fines_generated > 0
      ? (latest.fines_collected / latest.fines_generated) * 100
      : 0;
  const previousRate =
    previous && previous.fines_generated > 0
      ? (previous.fines_collected / previous.fines_generated) * 100
      : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>{t('managerDashboard.overdueFines.title')}</CardTitle>
        <span className="text-xs font-normal text-muted-foreground">Last 3 Months</span>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-lg border border-border bg-secondary/20 p-5">
          <StatCell
            label={t('managerDashboard.overdueFines.totalOverdue')}
            value={String(totalOverdue)}
            trend={latest && previous ? trendFor(latest.overdue_books, previous.overdue_books) : null}
            goodDirection="down"
          />
          <StatCell
            label={t('managerDashboard.overdueFines.finesGenerated')}
            value={formatCurrency(totalGenerated)}
            trend={
              latest && previous ? trendFor(latest.fines_generated, previous.fines_generated) : null
            }
            goodDirection="down"
          />
          <StatCell
            label={t('managerDashboard.overdueFines.finesCollected')}
            value={formatCurrency(totalCollected)}
            trend={
              latest && previous ? trendFor(latest.fines_collected, previous.fines_collected) : null
            }
            goodDirection="up"
          />
          <StatCell
            label={t('managerDashboard.overdueFines.collectionRate')}
            value={`${collectionRate}%`}
            trend={trendFor(latestRate, previousRate)}
            goodDirection="up"
          />
        </div>
        <ComboBarLineChart
          ariaLabel={t('managerDashboard.overdueFines.title')}
          lineAxisPrefix="₹"
          legendPosition="bottom"
          data={months.map((m) => ({
            label: formatMonth(m.month),
            values: {
              overdue: m.overdue_books,
              generated: m.fines_generated,
              collected: m.fines_collected,
            },
          }))}
          barSeries={{
            key: 'overdue',
            label: t('managerDashboard.overdueFines.totalOverdue'),
            color: 'var(--color-primary)',
          }}
          lineSeries={[
            {
              key: 'generated',
              label: `${t('managerDashboard.overdueFines.finesGenerated')} (₹)`,
              color: 'var(--color-info)',
            },
            {
              key: 'collected',
              label: `${t('managerDashboard.overdueFines.finesCollected')} (₹)`,
              color: 'var(--color-teal)',
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}
