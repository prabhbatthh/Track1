import { Armchair, CircleCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { StatisticCard } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import type { AdminSeatStatus } from '@/providers/AuthProvider';

export function LiveSeatStatus({ status }: { status: AdminSeatStatus }) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{t('admin.seatStatus.title')}</CardTitle>
        <span className="flex items-center gap-1.5 text-xs font-medium text-success">
          <span className="size-1.5 rounded-full bg-success" />
          {t('landing.seatAvailability.live')}
        </span>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatisticCard
          icon={CircleCheck}
          label={t('landing.seatAvailability.available')}
          value={String(status.available)}
        />
        <StatisticCard
          icon={Armchair}
          label={t('landing.seatAvailability.occupied')}
          value={String(status.booked)}
        />
      </CardContent>
    </Card>
  );
}
