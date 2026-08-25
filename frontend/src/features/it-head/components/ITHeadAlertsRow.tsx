import { AlertTriangle, CheckCircle2, Info, ShieldAlert, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { ITHeadAlert } from '@/providers/AuthProvider';

const SEVERITY: Record<ITHeadAlert['severity'], { icon: LucideIcon; classes: string }> = {
  critical: { icon: ShieldAlert, classes: 'border-danger/30 bg-danger/5 text-danger' },
  warning: { icon: AlertTriangle, classes: 'border-warning/30 bg-warning/5 text-warning' },
  info: { icon: Info, classes: 'border-info/30 bg-info/5 text-info' },
  success: { icon: CheckCircle2, classes: 'border-success/30 bg-success/5 text-success' },
};

export function ITHeadAlertsRow({ alerts }: { alerts: ITHeadAlert[] }) {
  const { t } = useTranslation();

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold text-foreground">{t('itHead.systemAlerts.title')}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {alerts.map((alert) => {
          const { icon: Icon, classes } = SEVERITY[alert.severity];
          return (
            <Card key={alert.id} className={cn('flex flex-col gap-2 border p-4', classes)}>
              <Icon className="size-5" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">{alert.title}</p>
              <p className="text-xs text-muted-foreground">{alert.description}</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
