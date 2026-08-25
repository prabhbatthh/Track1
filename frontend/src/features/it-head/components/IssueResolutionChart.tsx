import { AlertCircle, CheckCircle2, HelpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { MultiBarChart } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { formatMonth } from '@/lib/format';
import type { IssueResolutionMonth } from '@/providers/AuthProvider';

export function IssueResolutionChart({ months }: { months: IssueResolutionMonth[] }) {
  const { t } = useTranslation();
  const latest = months.at(-1);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('itHead.issueResolutionOverview.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {latest && (
          <div className="grid grid-cols-3 divide-x divide-border rounded-xl border border-border bg-secondary/30 p-3.5">
            <div className="flex items-center gap-3 px-2 first:pl-0">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
                <CheckCircle2 className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">
                  {t('itHead.issueResolutionOverview.resolved')}
                </p>
                <p className="text-base font-bold text-foreground tracking-tight">
                  {latest.resolved}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 px-2">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
                <AlertCircle className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">
                  {t('itHead.issueResolutionOverview.open')}
                </p>
                <p className="text-base font-bold text-foreground tracking-tight">{latest.open}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 px-2 last:pr-0">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info">
                <HelpCircle className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">
                  {t('itHead.issueResolutionOverview.other')}
                </p>
                <p className="text-base font-bold text-foreground tracking-tight">
                  {latest.other}
                </p>
              </div>
            </div>
          </div>
        )}
        <MultiBarChart
          legendPosition="bottom"
          stacked
          ariaLabel={t('itHead.issueResolutionOverview.title')}
          data={months.map((m) => ({
            label: formatMonth(m.month),
            values: { resolved: m.resolved, open: m.open, other: m.other },
          }))}
          series={[
            {
              key: 'resolved',
              label: t('itHead.issueResolutionOverview.resolved'),
              color: 'var(--color-success)',
            },
            {
              key: 'open',
              label: t('itHead.issueResolutionOverview.open'),
              color: 'var(--color-warning)',
            },
            {
              key: 'other',
              label: t('itHead.issueResolutionOverview.other'),
              color: 'var(--color-info)',
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}
