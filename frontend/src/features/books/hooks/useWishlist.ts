import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

const EMPTY: string[] = [];

// Keyed by userId (not a fixed key) so switching accounts never flashes the previous
// signed-in member's wishlist — a different user gets a genuinely different cache entry
// rather than a stale one that hasn't refetched yet.
function wishlistKey(userId: string | null) {
  return ['wishlist', userId ?? 'anonymous'] as const;
}

// Backend-synced (was localStorage-only) so the wishlist follows a member across
// devices/sessions instead of staying trapped in one browser.
export function useWishlist() {
  const { t } = useTranslation();
  const { userId, isAuthenticated, getWishlist, addToWishlist, removeFromWishlist } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = wishlistKey(userId);

  const query = useQuery({
    queryKey,
    queryFn: getWishlist,
    enabled: isAuthenticated,
  });
  const wishlistIds = query.data ?? EMPTY;

  function isWishlisted(bookId: string): boolean {
    return wishlistIds.includes(bookId);
  }

  async function optimisticallyApply(apply: (ids: string[]) => string[]) {
    await queryClient.cancelQueries({ queryKey });
    const previous = queryClient.getQueryData<string[]>(queryKey) ?? EMPTY;
    queryClient.setQueryData<string[]>(queryKey, apply(previous));
    return { previous };
  }

  function rollback(context: { previous: string[] } | undefined, error: unknown) {
    queryClient.setQueryData(queryKey, context?.previous ?? EMPTY);
    toast.error(getErrorMessage(error, t('common.errors.generic')));
  }

  const addMutation = useMutation({
    mutationFn: addToWishlist,
    onMutate: (bookId: string) =>
      optimisticallyApply((ids) => (ids.includes(bookId) ? ids : [...ids, bookId])),
    onError: (error, _bookId, context) => rollback(context, error),
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const removeMutation = useMutation({
    mutationFn: removeFromWishlist,
    onMutate: (bookId: string) =>
      optimisticallyApply((ids) => ids.filter((id) => id !== bookId)),
    onError: (error, _bookId, context) => rollback(context, error),
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  });

  function toggleWishlist(bookId: string) {
    if (isWishlisted(bookId)) {
      removeMutation.mutate(bookId);
    } else {
      addMutation.mutate(bookId);
    }
  }

  return { wishlistIds, isWishlisted, toggleWishlist };
}
