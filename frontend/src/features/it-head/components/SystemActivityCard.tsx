import { KeyRound, LogIn, Minus, ShieldCheck, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { TrendLineChart } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatWeekday } from '@/lib/format';
import type { AdminTrend, SystemActivityDay, SystemActivitySummary } from '@/providers/AuthProvider';

function StatCell({
  label,
  value,
  trend,
  icon: Icon,
  iconBgClass,
  iconTextClass,
}: {
  label: string;
  value: number;
  trend: AdminTrend;
  icon: LucideIcon;
  iconBgClass: string;
  iconTextClass: string;
}) {
  const neutral = trend.percent === 0;
  return (
    <div className="flex items-center gap-3 px-2 first:pl-0 last:pr-0">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${iconBgClass} ${iconTextClass}`}
      >
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-1.5">
          <p className="text-base font-bold text-foreground tracking-tight">{value}</p>
          <span
            className={cn(
              'inline-flex items-center gap-0.5 text-xs font-semibold',
              neutral
                ? 'text-muted-foreground'
                : trend.direction === 'up'
                  ? 'text-success'
                  : 'text-danger',
            )}
          >
            {neutral ? (
              <Minus className="size-3" aria-hidden="true" />
            ) : trend.direction === 'up' ? (
              <TrendingUp className="size-3" aria-hidden="true" />
            ) : (
              <TrendingDown className="size-3" aria-hidden="true" />
            )}
            {trend.percent}%
          </span>
        </div>
      </div>
    </div>
  );
}

export function SystemActivityCard({
  days,
  summary,
}: {
  days: SystemActivityDay[];
  summary: SystemActivitySummary;
}) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('itHead.systemActivity.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-secondary/30 p-3.5">
          <StatCell
            label={t('itHead.systemActivity.logins')}
            value={summary.logins_total}
            trend={summary.logins_trend}
            icon={LogIn}
            iconBgClass="bg-primary/10"
            iconTextClass="text-primary"
          />
          <StatCell
            label={t('itHead.systemActivity.accessChanges')}
            value={summary.access_changes_total}
            trend={summary.access_changes_trend}
            icon={KeyRound}
            iconBgClass="bg-warning/10"
            iconTextClass="text-warning"
          />
          <StatCell
            label={t('itHead.systemActivity.permissionsUpdated')}
            value={summary.permissions_updated_total}
            trend={summary.permissions_updated_trend}
            icon={ShieldCheck}
            iconBgClass="bg-info/10"
            iconTextClass="text-info"
          />
        </div>
        <TrendLineChart
          ariaLabel={t('itHead.systemActivity.loginsChartLabel')}
          color="var(--color-primary)"
          data={days.map((d) => ({ label: formatWeekday(d.date), value: d.logins }))}
        />
      </CardContent>
    </Card>
  );
}
