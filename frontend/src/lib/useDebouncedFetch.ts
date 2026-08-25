import { useEffect, useState } from 'react';

export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Debounces `fetcher` by `debounceMs` and re-runs it whenever `deps` change,
 * ignoring the result of a call if a newer one has started (or the effect
 * unmounted) in the meantime — avoids stale search results overwriting fresh ones.
 */
export function useDebouncedFetch<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  fallback: T,
  debounceMs = SEARCH_DEBOUNCE_MS,
): { data: T; isLoading: boolean; error: unknown; refresh: () => void } {
  const [data, setData] = useState<T>(fallback);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setIsLoading(true);
      fetcher()
        .then((result) => {
          if (cancelled) return;
          setData(result);
          setError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          setData(fallback);
          setError(err);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey]);

  return { data, isLoading, error, refresh: () => setReloadKey((key) => key + 1) };
}
