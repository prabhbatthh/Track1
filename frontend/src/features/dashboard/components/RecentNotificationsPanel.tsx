import { ArrowRight, BellRing } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { notificationTypeIcon, type NotificationType } from '@/components/common';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import type { AppNotificationRecord } from '@/providers/AuthProvider';
import { useNotificationsPanel } from '@/providers/NotificationsPanelProvider';

const PREVIEW_COUNT = 4;

function NotificationRow({ notification }: { notification: AppNotificationRecord }) {
  const Icon = notificationTypeIcon[notification.type as NotificationType] ?? BellRing;

  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm text-foreground">{notification.message}</p>
        <p className="truncate text-xs text-muted-foreground">
          {formatRelativeTime(notification.created_at)}
        </p>
      </div>
    </li>
  );
}

// Manager-side counterpart to admin's RecentActivities: same compact icon-list card,
// sourced from the manager's own notification feed instead of the audit log.
export function RecentNotificationsPanel({ notifications }: { notifications: AppNotificationRecord[] }) {
  const { t } = useTranslation();
  const notificationsPanel = useNotificationsPanel();
  const preview = notifications.slice(0, PREVIEW_COUNT);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('managerDashboard.recentNotifications.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {preview.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('managerDashboard.recentNotifications.empty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {preview.map((notification) => (
              <NotificationRow key={notification.id} notification={notification} />
            ))}
          </ul>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="justify-start gap-1.5 self-start px-0 text-primary hover:bg-transparent hover:underline"
          onClick={() => notificationsPanel?.open()}
        >
          {t('managerDashboard.recentNotifications.viewAll')}
          <ArrowRight className="size-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
