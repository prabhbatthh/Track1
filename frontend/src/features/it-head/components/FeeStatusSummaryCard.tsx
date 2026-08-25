import { useTranslation } from 'react-i18next';

import { MultiSegmentDonut } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import type { FeeStatusEntryRecord } from '@/providers/AuthProvider';

const TOP_OVERDUE_COUNT = 5;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function FeeStatusSummaryCard({
  feesOutstanding,
  lateFinesOutstanding,
  feeStatus,
}: {
  feesOutstanding: number;
  lateFinesOutstanding: number;
  feeStatus: FeeStatusEntryRecord[];
}) {
  const { t } = useTranslation();

  // "Overdue" (past the renewal grace period) ranks above "due" (just lapsed, still in
  // grace) — within the same status, the longest-overdue member comes first.
  const topOverdue = feeStatus
    .filter((entry) => entry.status !== 'paid')
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'overdue' ? -1 : 1;
      const aDue = a.due_date ? new Date(a.due_date).getTime() : 0;
      const bDue = b.due_date ? new Date(b.due_date).getTime() : 0;
      return aDue - bDue;
    })
    .slice(0, TOP_OVERDUE_COUNT);

  const totalOutstanding = feesOutstanding + lateFinesOutstanding;

  return (
    <Card className="flex h-full flex-col justify-between">
      <CardHeader>
        <CardTitle>{t('itHead.feeStatusSummary.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-5">
        <MultiSegmentDonut
          centerValue={formatCurrency(totalOutstanding)}
          centerLabel="Total Owed"
          valueFormatter={formatCurrency}
          segments={[
            {
              key: 'current',
              label: t('itHead.feeStatusSummary.currentOutstanding'),
              value: feesOutstanding,
              color: 'var(--color-primary)',
            },
            {
              key: 'late-fines',
              label: t('itHead.feeStatusSummary.lateFines'),
              value: lateFinesOutstanding,
              color: 'var(--color-danger)',
            },
          ]}
        />
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-secondary/30 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('itHead.feeStatusSummary.topOverdue')}
          </p>
          {topOverdue.length === 0 ? (
            <p className="py-1 text-sm text-muted-foreground">{t('itHead.feeStatusSummary.empty')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border/60">
              {topOverdue.map((entry) => (
                <li key={entry.member_id} className="flex items-center justify-between gap-2.5 py-2 first:pt-0 last:pb-0 text-sm">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-foreground">
                      {getInitials(entry.member_name)}
                    </span>
                    <span className="truncate font-medium text-foreground">{entry.member_name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="rounded-md bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger capitalize">
                      {entry.status}
                    </span>
                    <span className="font-bold text-foreground">
                      {formatCurrency(entry.amount_due)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
