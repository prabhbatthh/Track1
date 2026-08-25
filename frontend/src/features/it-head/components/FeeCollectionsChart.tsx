import { CheckCircle2, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { MultiLineTrendChart } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { formatCurrency, formatMonth } from '@/lib/format';
import type { FeeCollectionMonth } from '@/providers/AuthProvider';

export function FeeCollectionsChart({ months }: { months: FeeCollectionMonth[] }) {
  const { t } = useTranslation();
  const latest = months.at(-1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('itHead.feeCollections.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {latest && (
          <div className="grid grid-cols-2 divide-x divide-border rounded-xl border border-border bg-secondary/30 p-3.5">
            <div className="flex items-center gap-3 px-2 first:pl-0">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CheckCircle2 className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">
                  {t('itHead.feeCollections.collected')}
                </p>
                <p className="text-base font-bold text-foreground tracking-tight">
                  {formatCurrency(latest.collected)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 px-2 last:pr-0">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-danger/10 text-danger">
                <Clock className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">
                  {t('itHead.feeCollections.pending')}
                </p>
                <p className="text-base font-bold text-foreground tracking-tight">
                  {formatCurrency(latest.pending)}
                </p>
              </div>
            </div>
          </div>
        )}
        <MultiLineTrendChart
          legendPosition="bottom"
          ariaLabel={t('itHead.feeCollections.title')}
          axisPrefix="₹"
          data={months.map((m) => ({
            label: formatMonth(m.month),
            values: { collected: m.collected, pending: m.pending },
          }))}
          series={[
            {
              key: 'collected',
              label: t('itHead.feeCollections.collected'),
              color: 'var(--color-primary)',
            },
            {
              key: 'pending',
              label: t('itHead.feeCollections.pending'),
              color: 'var(--color-danger)',
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}
