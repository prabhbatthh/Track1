import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';

export interface CommonPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (nextPage: number) => void;
  totalItems?: number;
  pageSize?: number;
  className?: string;
}

export type PaginationProps = CommonPaginationProps;

function getPageNumbers(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);

  const result: (number | 'ellipsis')[] = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) {
      result.push('ellipsis');
    }
    result.push(page);
  });

  return result;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
  className,
}: CommonPaginationProps) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;

  const rangeStart = totalItems && pageSize ? (currentPage - 1) * pageSize + 1 : null;
  const rangeEnd = totalItems && pageSize ? Math.min(currentPage * pageSize, totalItems) : null;

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'flex flex-col items-center justify-center gap-2 sm:flex-row sm:justify-between',
        className,
      )}
    >
      {rangeStart !== null && rangeEnd !== null && (
        <span className="text-xs text-muted-foreground">
          {t('common.pagination.showing', { start: rangeStart, end: rangeEnd, total: totalItems })}
        </span>
      )}
      <div className="flex max-w-full min-w-0 items-center justify-center gap-1 sm:gap-2">
        <button
          type="button"
          aria-label={t('common.pagination.previous')}
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="inline-flex size-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronLeft className="size-4" />
        </button>

        <span className="min-w-20 text-center text-sm font-medium text-foreground sm:hidden">
          {t('common.pagination.pageOf', { current: currentPage, total: totalPages })}
        </span>

        {getPageNumbers(currentPage, totalPages).map((page, index) =>
          page === 'ellipsis' ? (
            <span
              key={`ellipsis-${index}`}
              className="hidden px-1 text-sm text-muted-foreground sm:inline"
            >
              …
            </span>
          ) : (
            <button
              key={page}
              type="button"
              aria-current={page === currentPage ? 'page' : undefined}
              onClick={() => onPageChange(page)}
              className={cn(
                'hidden size-9 items-center justify-center rounded-xl text-sm font-medium transition-colors sm:inline-flex',
                page === currentPage
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-foreground hover:bg-muted/70',
              )}
            >
              {page}
            </button>
          ),
        )}

        <button
          type="button"
          aria-label={t('common.pagination.next')}
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="inline-flex size-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </nav>
  );
}
