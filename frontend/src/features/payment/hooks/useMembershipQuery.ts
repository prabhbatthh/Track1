import { useQuery } from '@tanstack/react-query';

import { useAuth, type Membership, type PaymentRecord } from '@/providers/AuthProvider';

export const membershipKeys = {
  mine: ['membership', 'me'] as const,
  myPayments: ['payments', 'me'] as const,
};

/** Membership rarely changes mid-session; a minute avoids refetching on every nav. */
const STALE_TIME_MS = 60_000;

const NO_PAYMENTS: PaymentRecord[] = [];

/**
 * The shared source of truth for "my membership".
 *
 * The member dashboard and the profile page each fetched this independently through
 * useAuth, so navigating between them refetched every time and the two could briefly
 * disagree. One cache entry means one request and one answer.
 */
export function useMembershipQuery() {
  const { getMembership, isAuthenticated } = useAuth();

  const query = useQuery<Membership | null>({
    queryKey: membershipKeys.mine,
    queryFn: getMembership,
    enabled: isAuthenticated,
    staleTime: STALE_TIME_MS,
  });

  // `?? null` keeps the "no membership" and "not loaded yet" cases the same shape the
  // callers already handled, so this drops in without touching their rendering.
  return { ...query, membership: query.data ?? null };
}

/** Payment history for the signed-in member. Same reasoning as useMembershipQuery. */
export function useMyPaymentsQuery() {
  const { getMyPayments, isAuthenticated } = useAuth();

  const query = useQuery<PaymentRecord[]>({
    queryKey: membershipKeys.myPayments,
    queryFn: getMyPayments,
    enabled: isAuthenticated,
    staleTime: STALE_TIME_MS,
  });

  return { ...query, payments: query.data ?? NO_PAYMENTS };
}
