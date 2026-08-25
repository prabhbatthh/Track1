import { useState } from 'react';

/**
 * Client-side pagination for lists that are already fetched in full (reviews,
 * support tickets, events) rather than paged from the server. `items` should
 * already be filtered and sorted by the caller — this just slices a page out
 * of it. If a filter/sort change shrinks the list below the stored page, the
 * page is clamped for rendering purposes (rather than reset via a setState
 * effect, which would cause an extra render).
 */
export function usePagedList<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const start = (currentPage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  return { page: currentPage, setPage, totalPages, pageItems };
}
