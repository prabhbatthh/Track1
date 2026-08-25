import { ArrowRight, Bell, HandCoins, Megaphone, ReceiptText, Ticket, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { useNotificationsPanel } from '@/providers/NotificationsPanelProvider';
import type { AuditLogEntry } from '@/providers/AuthProvider';

import { useActionText, useActorText } from './AuditLog';

const ACTION_ICONS: Record<string, LucideIcon> = {
  expenseApproved: ReceiptText,
  refundIssued: HandCoins,
  refundRejected: HandCoins,
  feeWaived: HandCoins,
  feeWaiverRejected: HandCoins,
  pricingPlanUpdated: ReceiptText,
  announcementSent: Megaphone,
  couponGenerated: Ticket,
};

const PREVIEW_COUNT = 4;

function ActivityRow({ entry }: { entry: AuditLogEntry }) {
  const { t } = useTranslation();
  const actionText = useActionText(entry);
  const actorText = useActorText(entry);
  const Icon = ACTION_ICONS[entry.action] ?? Bell;

  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        {/* useActionText doesn't cover every action type (e.g. library check-in/out) —
            an unrecognized one falls back to its raw action id rather than a blank line. */}
        <p className="truncate text-sm text-foreground">
          {actionText ?? t('admin.recentActivities.genericAction', { action: entry.action })}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {actorText} · {formatRelativeTime(entry.created_at)}
        </p>
      </div>
    </li>
  );
}

// Compact preview of the audit log (same data AuditLog shows in full further down this
// page, filterable/paginated there) — just the latest few, styled as a quick glance
// with a link out to the full notifications view.
export function RecentActivities({ entries }: { entries: AuditLogEntry[] }) {
  const { t } = useTranslation();
  const notificationsPanel = useNotificationsPanel();
  const preview = entries.slice(0, PREVIEW_COUNT);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.recentActivities.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {preview.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('admin.recentActivities.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {preview.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="justify-start gap-1.5 self-start px-0 text-primary hover:bg-transparent hover:underline"
          onClick={() => notificationsPanel?.open()}
        >
          {t('admin.recentActivities.viewAll')}
          <ArrowRight className="size-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
