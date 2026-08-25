import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { TrendLineChart } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import type { SeatUtilizationHour } from '@/providers/AuthProvider';

function formatHour(hour: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const twelveHour = hour % 12 || 12;
  return `${twelveHour} ${period}`;
}

export function SeatUtilizationCard({ hours }: { hours: SeatUtilizationHour[] }) {
  const { t } = useTranslation();

  const average =
    hours.length === 0
      ? 0
      : Math.round(hours.reduce((sum, h) => sum + h.percent, 0) / hours.length);
  const peak = hours.reduce<SeatUtilizationHour | null>(
    (best, h) => (best === null || h.percent > best.percent ? h : best),
    null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('managerDashboard.seatUtilization.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <TrendLineChart
          data={hours.map((h) => ({ label: formatHour(h.hour), value: h.percent }))}
          color="var(--color-primary)"
          valueFormatter={(v) => `${v}%`}
          ariaLabel={t('managerDashboard.seatUtilization.title')}
          axisSuffix="%"
        />
        {peak && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 p-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Clock className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {t('managerDashboard.seatUtilization.peakTime')}
              </p>
              <p className="text-sm text-foreground">
                {formatHour(peak.hour)} - {formatHour(peak.hour + 1)}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('managerDashboard.seatUtilization.averageUtilization', { percent: average })}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
