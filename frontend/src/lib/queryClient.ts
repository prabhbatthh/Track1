import { QueryClient } from '@tanstack/react-query';

// retry: false matches the manual fetches this replaces (they never retried) — keeps request
// counts identical to before while features migrate one at a time. refetchOnWindowFocus is left
// at its default (true): with an explicit staleTime set per query, it only refires once that
// query's data has actually gone stale, so it can't add requests beyond what staleTime allows.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});
