import { Clock, TrendingUp, CheckCircle2, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/ui';
import { cn } from '@/lib/cn';

const INSIGHTS: { key: string; icon: LucideIcon; classes: string }[] = [
  { key: 'highestExpense', icon: TrendingUp, classes: 'border-primary/30 bg-primary/5 text-primary' },
  { key: 'pendingApproval', icon: Clock, classes: 'border-warning/30 bg-warning/5 text-warning' },
  { key: 'financialHealth', icon: CheckCircle2, classes: 'border-success/30 bg-success/5 text-success' },
];

export function FinancialInsights() {
  const { t } = useTranslation();

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold text-foreground">
        {t('itHead.reportsPage.insights.title')}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {INSIGHTS.map(({ key, icon: Icon, classes }) => (
          <Card key={key} className={cn('flex flex-col gap-2 border p-4', classes)}>
            <Icon className="size-5" aria-hidden="true" />
            <p className="text-xs font-medium uppercase tracking-wide opacity-80">
              {t(`itHead.reportsPage.insights.${key}.label`)}
            </p>
            <p className="text-base font-semibold text-foreground">
              {t(`itHead.reportsPage.insights.${key}.value`)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t(`itHead.reportsPage.insights.${key}.description`)}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
