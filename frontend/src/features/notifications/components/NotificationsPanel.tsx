import { useQueryClient } from '@tanstack/react-query';
import { BellOff, CheckCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { NotificationCard, type NotificationType } from '@/components/common';
import { Badge, Button, EmptyState } from '@/components/ui';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { useAuth, type AppNotificationRecord } from '@/providers/AuthProvider';

import { notificationKeys, useNotificationsQuery } from '../hooks/useNotificationsQuery';

type Filter = 'all' | 'unread';

const NOTIFICATION_TITLE_KEYS: Partial<Record<string, string>> = {
  'seat-available': 'seatAvailable',
  'seat-booked': 'seatBooked',
  'reservation-ready': 'reservationReady',
  'reported-comment': 'commentReported',
  'post-comment': 'postComment',
  'post-like': 'postLike',
  'payment-received': 'paymentReceived',
  'payment-pending': 'paymentPending',
  'pending-request': 'pendingRequest',
  'book-record': 'bookRecord',
  announcement: 'announcement',
  'support-ticket': 'supportTicket',
  'support-ticket-resolved': 'supportTicketResolved',
  'support-ticket-reopened': 'supportTicketReopened',
  'fine-reminder': 'fineReminder',
};

function NotificationRow({
  notification,
  onMarkAsRead,
}: {
  notification: AppNotificationRecord;
  onMarkAsRead: () => void;
}) {
  const { t } = useTranslation();
  const titleKey = NOTIFICATION_TITLE_KEYS[notification.type];
  const title = titleKey ? t(`notifications.titles.${titleKey}`) : notification.type;

  return (
    <NotificationCard
      type={(notification.type as NotificationType) ?? 'seat-available'}
      title={title}
      message={notification.message}
      timestamp={formatRelativeTime(notification.created_at)}
      read={notification.read}
      onMarkAsRead={onMarkAsRead}
    />
  );
}

export function NotificationsPanel() {
  const { t } = useTranslation();
  const { markNotificationRead, markAllNotificationsRead } = useAuth();
  const { notifications } = useNotificationsQuery();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');

  // Writes go through the shared cache rather than local state, so the bell's unread
  // count updates the moment something is marked read instead of on its next poll.
  function setCached(next: AppNotificationRecord[]) {
    queryClient.setQueryData(notificationKeys.mine, next);
  }

  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const visibleNotifications = useMemo(
    () => (filter === 'unread' ? notifications.filter((n) => !n.read) : notifications),
    [notifications, filter],
  );

  function markAsRead(id: string) {
    const previous = notifications;
    setCached(
      notifications.map((notification) =>
        notification.id === id ? { ...notification, read: true } : notification,
      ),
    );
    markNotificationRead(id).catch(() => {
      // Revert on failure so the UI doesn't claim a read state the backend never saved.
      setCached(previous);
    });
  }

  function markAllAsRead() {
    const previous = notifications;
    setCached(notifications.map((notification) => ({ ...notification, read: true })));
    markAllNotificationsRead().catch(() => {
      // Revert on failure so the UI doesn't claim a read state the backend never saved.
      setCached(previous);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2" role="group" aria-label={t('notifications.filterAriaLabel')}>
          <Button
            variant={filter === 'all' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            {t('notifications.filters.all')}
          </Button>
          <Button
            variant={filter === 'unread' ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setFilter('unread')}
          >
            {t('notifications.filters.unread')}
          </Button>
        </div>
        {unreadCount > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="success">{t('notifications.unreadBadge', { count: unreadCount })}</Badge>
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={<CheckCheck className="size-4" />}
              onClick={markAllAsRead}
            >
              {t('notifications.markAllAsRead')}
            </Button>
          </div>
        )}
      </div>

      {visibleNotifications.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title={t('notifications.empty.title')}
          description={t('notifications.empty.description')}
          secondaryAction={
            filter === 'unread' && (
              <Button size="sm" variant="outline" onClick={() => setFilter('all')}>
                {t('notifications.filters.all')}
              </Button>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {visibleNotifications.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              onMarkAsRead={() => markAsRead(notification.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
