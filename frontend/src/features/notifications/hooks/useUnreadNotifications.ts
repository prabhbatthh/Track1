import { useEffect, useRef, useState } from 'react';

import { useNotificationsQuery } from './useNotificationsQuery';

// How long the bell keeps "ringing" after a genuinely new notification shows up,
// as opposed to the steady gold tint which stays for as long as anything is unread.
const JUST_ARRIVED_DURATION_MS = 4_000;

export function useUnreadNotifications() {
  // Polling lives in useNotificationsQuery now — shared with the panel and dashboards
  // instead of this hook owning its own 30s setInterval.
  const { notifications, isError, refetch } = useNotificationsQuery();
  const [justArrived, setJustArrived] = useState(false);
  // null until the first load resolves, so it doesn't treat a member's entire
  // pre-existing unread pile as "new" the moment the app loads.
  const seenIds = useRef<Set<string> | null>(null);

  const unread = notifications.filter((notification) => !notification.read);
  const unreadCount = isError ? 0 : unread.length;

  useEffect(() => {
    if (isError) return;

    // Derived in here rather than reused from the render body: that array is rebuilt every
    // render, so depending on it would re-run this effect in a loop.
    const unreadIds = new Set(
      notifications.filter((notification) => !notification.read).map((n) => n.id),
    );
    const previouslySeen = seenIds.current;
    seenIds.current = unreadIds;

    if (!previouslySeen) return;
    const hasNew = [...unreadIds].some((id) => !previouslySeen.has(id));
    if (!hasNew) return;

    setJustArrived(true);
    const timer = setTimeout(() => setJustArrived(false), JUST_ARRIVED_DURATION_MS);
    return () => clearTimeout(timer);
    // notifications is the query's cached array — a new identity only on an actual refetch
    // that returned different data, so this can't loop on unrelated re-renders.
  }, [notifications, isError]);

  return { unreadCount, justArrived, refresh: refetch };
}
