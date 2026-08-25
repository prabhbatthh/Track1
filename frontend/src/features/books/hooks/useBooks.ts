import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';

import { useDebouncedValue } from '@/lib/useDebouncedValue';

import { fetchBookById, fetchBookInsights, fetchBooks, fetchRelatedBooks, PAGE_SIZE } from '../api';
import { bookKeys } from '../queryKeys';
import type { Book, BookSort } from '../types';

export { PAGE_SIZE } from '../api';
export type { Book, BookSort } from '../types';

const SEARCH_DEBOUNCE_MS = 300;

export function useBooks(search: string, category: string, sort: BookSort, page: number) {
  // The old manual fetch debounced its whole effect (all four deps) by 300ms, not just the
  // search box, so filter/page clicks got the same settle delay — replicated per-field here
  // since they all update in the same render (React batches them into one debounce window).
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const debouncedCategory = useDebouncedValue(category, SEARCH_DEBOUNCE_MS);
  const debouncedSort = useDebouncedValue(sort, SEARCH_DEBOUNCE_MS);
  const debouncedPage = useDebouncedValue(page, SEARCH_DEBOUNCE_MS);

  const params = {
    search: debouncedSearch,
    category: debouncedCategory,
    sort: debouncedSort,
    page: debouncedPage,
  };

  const query = useQuery({
    queryKey: bookKeys.list(params),
    queryFn: () => fetchBooks(params),
    // The old state-based version never cleared `items` between fetches, so the grid never
    // flashed empty while paging/filtering — keepPreviousData reproduces that, not just speed.
    placeholderData: keepPreviousData,
    // Availability/counts shift when someone borrows or returns a book, not second-to-second;
    // 30s cuts refetches on rapid filter/page changes without the list going noticeably stale.
    staleTime: 30_000,
  });

  const total = query.data?.total ?? 0;

  return {
    items: query.data?.items ?? [],
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    // query.refetch() runs immediately (no debounce) — original refresh() wasn't required to
    // wait either, it just happened to be delayed by the same 300ms debounce as every other
    // change since it shared that effect; nothing depends on that delay.
    refresh: query.refetch,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
  };
}

/** Resolves full book details for a set of ids (e.g. the wishlist), independent of any list/pagination. */
export function useBooksByIds(ids: string[]) {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: bookKeys.detail(id),
      queryFn: () => fetchBookById(id),
      // Shares its cache entry with useBookQuery below — opening a wishlisted book's details
      // page (or vice versa) reuses this fetch instead of firing a duplicate one.
      staleTime: 60_000,
    })),
  });
  return results.filter((result) => result.data).map((result) => result.data as Book);
}

export function useBookQuery(bookId: string | undefined) {
  return useQuery({
    queryKey: bookKeys.detail(bookId ?? ''),
    queryFn: () => fetchBookById(bookId as string),
    enabled: Boolean(bookId),
    staleTime: 60_000,
  });
}

export function useRelatedBooksQuery(bookId: string | undefined) {
  return useQuery({
    queryKey: bookKeys.related(bookId ?? ''),
    queryFn: () => fetchRelatedBooks(bookId as string),
    enabled: Boolean(bookId),
    staleTime: 60_000,
  });
}

// Backend caches the AI analysis itself (Book.aiInsights), so the result is stable once
// generated — a long staleTime plus no retry avoids hammering a slow/unavailable Ollama
// with repeated requests on every re-render or transient failure.
export function useBookInsightsQuery(bookId: string | undefined) {
  return useQuery({
    queryKey: bookKeys.insights(bookId ?? ''),
    queryFn: () => fetchBookInsights(bookId as string),
    enabled: Boolean(bookId),
    staleTime: 10 * 60_000,
    retry: false,
  });
}
