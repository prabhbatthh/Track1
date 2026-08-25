import { useQuery } from '@tanstack/react-query';

import { useAuth, type AppNotificationRecord } from '@/providers/AuthProvider';

export const notificationKeys = { mine: ['notifications', 'me'] as const };

/** Matches the poll interval the notification bell used before this was shared. */
const POLL_INTERVAL_MS = 30_000;

const EMPTY: AppNotificationRecord[] = [];

/**
 * The single source of truth for "my notifications".
 *
 * The bell, the panel, and both dashboards all read this list. They each used to fetch
 * it independently, so opening the panel on a dashboard fired the same request three
 * times and marking one read left the bell's count stale until its next 30s poll. One
 * shared cache entry fixes both: the poll refreshes every consumer at once, and a
 * mark-as-read written through setQueryData is visible everywhere immediately.
 */
export function useNotificationsQuery() {
  const { getMyNotifications, isAuthenticated } = useAuth();

  const query = useQuery({
    queryKey: notificationKeys.mine,
    queryFn: getMyNotifications,
    enabled: isAuthenticated,
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: POLL_INTERVAL_MS,
  });

  return { ...query, notifications: query.data ?? EMPTY };
}
