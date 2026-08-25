import { useMemo, useState } from 'react';

export interface UsePaginationResult<T> {
  page: number;
  setPage: (nextPage: number) => void;
  totalPages: number;
  paginatedItems: T[];
  totalItems: number;
  startIndex: number;
  endIndex: number;
  resetPage: () => void;
}

export function usePagination<T>(items: T[], pageSize: number, initialPage = 1): UsePaginationResult<T> {
  const safePageSize = Math.max(1, pageSize);
  const [page, setPageState] = useState(initialPage);

  const totalPages = Math.max(1, Math.ceil(items.length / safePageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const paginatedItems = useMemo(() => {
    if (items.length === 0) return [];
    const start = (safePage - 1) * safePageSize;
    return items.slice(start, start + safePageSize);
  }, [items, safePage, safePageSize]);

  const totalItems = items.length;
  const startIndex = totalItems === 0 ? 0 : (safePage - 1) * safePageSize + 1;
  const endIndex = Math.min(safePage * safePageSize, totalItems);

  function setPage(nextPage: number) {
    setPageState(Math.min(Math.max(1, nextPage), totalPages));
  }

  return {
    page: safePage,
    setPage,
    totalPages,
    paginatedItems,
    totalItems,
    startIndex,
    endIndex,
    resetPage: () => setPageState(1),
  };
}
