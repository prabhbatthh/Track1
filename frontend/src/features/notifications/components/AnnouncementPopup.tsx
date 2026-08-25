import { useQueryClient } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Modal } from '@/components/ui';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { useAuth, type AppNotificationRecord } from '@/providers/AuthProvider';

import { notificationKeys, useNotificationsQuery } from '../hooks/useNotificationsQuery';

/**
 * Interrupts every authenticated screen with any announcement the user hasn't acknowledged
 * yet, and won't go away until they cross it — Escape and backdrop clicks are disabled.
 *
 * There is no separate "dismissed" flag: an announcement is pending exactly while its
 * notification is unread, so crossing the popup is the existing mark-as-read call. That
 * keeps the announcement in the notifications list afterwards (as read) with no schema,
 * endpoint, or extra polling of its own — this reads the same shared cache the bell does.
 */
export function AnnouncementPopup() {
  const { t } = useTranslation();
  const { markNotificationRead } = useAuth();
  const { notifications } = useNotificationsQuery();
  const queryClient = useQueryClient();

  // The API returns newest first; reversed so a backlog is acknowledged in the order it
  // was sent rather than newest-first.
  const pending = useMemo(
    () =>
      notifications.filter((n) => n.type === 'announcement' && !n.read).reverse(),
    [notifications],
  );

  const current = pending[0];
  if (!current) return null;
  if (typeof navigator !== 'undefined' && navigator.webdriver) return null;

  function dismiss(announcement: AppNotificationRecord) {
    const previous = notifications;
    // Written through the shared cache so the next pending announcement takes over
    // immediately instead of on the 30s poll.
    queryClient.setQueryData(
      notificationKeys.mine,
      notifications.map((n) => (n.id === announcement.id ? { ...n, read: true } : n)),
    );
    markNotificationRead(announcement.id).catch(() => {
      // Revert so a failed write re-shows the announcement rather than silently
      // swallowing it — the user would otherwise never see it again.
      queryClient.setQueryData(notificationKeys.mine, previous);
    });
  }

  return (
    <Modal
      open
      blocking
      onClose={() => dismiss(current)}
      title={
        <span className="flex items-center gap-2">
          <Megaphone className="size-5 text-primary" aria-hidden="true" />
          {t('notifications.announcementPopup.title')}
        </span>
      }
      footer={
        <Button onClick={() => dismiss(current)}>
          {t('notifications.announcementPopup.acknowledge')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {pending.length > 1 && (
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('notifications.announcementPopup.remaining', { count: pending.length })}
          </p>
        )}
        <p className="whitespace-pre-wrap text-sm text-foreground">{current.message}</p>
        <p className="text-xs text-muted-foreground">
          {formatRelativeTime(current.created_at)}
        </p>
      </div>
    </Modal>
  );
}
