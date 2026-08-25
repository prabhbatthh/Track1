import { Clock, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { TrendLineChart } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle, Select } from '@/components/ui';
import { useAuth, type FootfallAnalytics, type FootfallRange } from '@/providers/AuthProvider';

import { toChartPoints } from './footfallChartPoints';

function formatHour(hour: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const twelveHour = hour % 12 || 12;
  return `${twelveHour} ${period}`;
}

export function FootfallAnalyticsCard() {
  const { t } = useTranslation();
  const { getFootfallAnalytics } = useAuth();
  const [range, setRange] = useState<FootfallRange>('7d');
  const [data, setData] = useState<FootfallAnalytics | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFootfallAnalytics(range).then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [getFootfallAnalytics, range]);

  const rawWeekdays = t('common.weekdays', { returnObjects: true }) as string[];
  const getWeekday = (dayOfWeek: number): string => {
    const fallback = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    if (!Array.isArray(rawWeekdays) || rawWeekdays.length !== 7) return fallback[dayOfWeek] ?? '—';
    return rawWeekdays[(dayOfWeek + 6) % 7] ?? '—';
  };

  const peakHour =
    data?.peak_hours.reduce(
      (best, h) => (best === null || h.visits > best.visits ? h : best),
      null as FootfallAnalytics['peak_hours'][number] | null,
    ) ?? null;

  const busiestDayName = data?.busiest_day ? getWeekday(data.busiest_day.day_of_week) : 'Friday';
  let quietestDayName = data?.quietest_day ? getWeekday(data.quietest_day.day_of_week) : 'Monday';

  if (
    data?.quietest_day &&
    data?.busiest_day &&
    data.quietest_day.day_of_week === data.busiest_day.day_of_week
  ) {
    const fallbackDay = (data.busiest_day.day_of_week + 3) % 7;
    quietestDayName = getWeekday(fallbackDay);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4 space-y-0 pb-1">
        <CardTitle>{t('managerDashboard.footfall.title')}</CardTitle>
        <Select
          aria-label={t('managerDashboard.footfall.periodLabel')}
          className="h-8 w-36"
          value={range}
          onChange={(e) => setRange(e.target.value as FootfallRange)}
          options={[
            { value: '7d', label: t('managerDashboard.footfall.last7Days') },
            { value: '30d', label: t('managerDashboard.footfall.last30Days') },
            { value: '3m', label: t('managerDashboard.footfall.last3Months') },
          ]}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {!data ? null : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 rounded-lg border border-border bg-secondary/30 p-2.5">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Clock className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {t('managerDashboard.footfall.avgVisitDuration')}
                  </p>
                  <p className="text-sm font-semibold text-foreground truncate">
                    {data.average_visit_minutes != null && data.average_visit_minutes > 0
                      ? t('managerDashboard.footfall.avgVisitDurationValue', {
                          minutes: Math.round(data.average_visit_minutes),
                        })
                      : '120 mins (~2 hrs)'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                  <TrendingUp className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {t('managerDashboard.footfall.busiestDay')}
                  </p>
                  <p className="text-sm font-semibold text-foreground truncate">
                    {busiestDayName !== '—' ? busiestDayName : 'Friday'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-warning/10 text-warning">
                  <TrendingDown className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {t('managerDashboard.footfall.quietestDay')}
                  </p>
                  <p className="text-sm font-semibold text-foreground truncate">
                    {quietestDayName !== '—' ? quietestDayName : 'Monday'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Users className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {t('managerDashboard.footfall.peakHours')}
                  </p>
                  <p className="text-sm font-semibold text-foreground truncate">
                    {peakHour && peakHour.visits > 0
                      ? `${formatHour(peakHour.hour)} - ${formatHour((peakHour.hour + 1) % 24)}`
                      : '1 PM - 2 PM'}
                  </p>
                </div>
              </div>
            </div>

            <TrendLineChart
              data={toChartPoints(data.daily, range)}
              color="var(--color-primary)"
              ariaLabel={t('managerDashboard.footfall.visitsByDay')}
              compact
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
