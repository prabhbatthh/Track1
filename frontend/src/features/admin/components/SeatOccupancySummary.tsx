import { useTranslation } from 'react-i18next';

import { ProgressBar } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui';
import type { AdminSeatOccupancySlot } from '@/providers/AuthProvider';

function formatHour(hour: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const twelveHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelveHour} ${period}`;
}

export function SeatOccupancySummary({ slots }: { slots: AdminSeatOccupancySlot[] }) {
  const { t } = useTranslation();

  if (slots.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.seatOccupancy.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title={t('admin.seatOccupancy.emptyTitle')}
            description={t('admin.seatOccupancy.emptyDescription')}
          />
        </CardContent>
      </Card>
    );
  }

  const peak = slots.reduce((a, b) => (b.percent_filled > a.percent_filled ? b : a), slots[0]);
  const avg = Math.round(slots.reduce((sum, s) => sum + s.percent_filled, 0) / slots.length);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.seatOccupancy.title')}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {peak.percent_filled === 0
            ? t('admin.seatOccupancy.zeroSummary')
            : t('admin.seatOccupancy.summary', {
                peakHour: formatHour(peak.hour),
                peakPercent: peak.percent_filled,
                avgPercent: avg,
              })}
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {slots.map((slot) => (
          <ProgressBar key={slot.hour} percent={slot.percent_filled} label={formatHour(slot.hour)} />
        ))}
      </CardContent>
    </Card>
  );
}
