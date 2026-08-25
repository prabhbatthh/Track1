import { History } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageHeader, Pagination, TableToolbar } from '@/components/common';
import { ErrorState, LoadingState, NoResults } from '@/components/feedback';
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { usePagination, useSortedItems } from '@/hooks';
import { formatDate } from '@/lib/format';
import { getErrorMessage } from '@/lib/api';
import { useAuth, type LoanRecord } from '@/providers/AuthProvider';

const PAGE_SIZE = 10;
type LoanStatusFilter = 'all' | 'active' | 'overdue' | 'returned';
type LoanSort = 'newest' | 'oldest' | 'dueSoonest' | 'dueLatest';

function StatusBadge({ status }: { status: LoanRecord['status'] }) {
  const { t } = useTranslation();
  const variant = status === 'overdue' ? 'warning' : status === 'returned' ? 'default' : 'success';
  return <Badge variant={variant}>{t(`myLoans.status.${status}`)}</Badge>;
}

// Member's own borrowing history — read-only, scoped to the signed-in member by
// the backend (/loans/me), so there is nothing to search or filter by member.
export function MyBorrowHistoryPage() {
  const { t } = useTranslation();
  const { getMyLoans } = useAuth();
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<LoanStatusFilter>('all');
  const [sort, setSort] = useState<LoanSort>('newest');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const requestIdRef = useRef(0);

  const loadLoans = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setLoadError(null);
    getMyLoans()
      .then((data) => {
        if (requestId === requestIdRef.current) setLoans(data);
      })
      .catch((error) => {
        if (requestId === requestIdRef.current) setLoadError(error);
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setIsLoading(false);
      });
  }, [getMyLoans]);

  useEffect(() => {
    const timer = setTimeout(loadLoans, 0);
    return () => {
      clearTimeout(timer);
      requestIdRef.current += 1;
    };
  }, [loadLoans]);

  const filteredLoans = useMemo(
    () => (statusFilter === 'all' ? loans : loans.filter((loan) => loan.status === statusFilter)),
    [loans, statusFilter],
  );

  const sortedLoans = useSortedItems(filteredLoans, {
    compare: (a, b) => {
      switch (sort) {
        case 'oldest':
          return new Date(a.borrowed_at).getTime() - new Date(b.borrowed_at).getTime();
        case 'dueSoonest':
          return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        case 'dueLatest':
          return new Date(b.due_date).getTime() - new Date(a.due_date).getTime();
        case 'newest':
        default:
          return new Date(b.borrowed_at).getTime() - new Date(a.borrowed_at).getTime();
      }
    },
  });

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(
    sortedLoans,
    PAGE_SIZE,
  );

  function resetFilters() {
    setStatusFilter('all');
    setSort('newest');
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('myLoans.pageTitle')} description={t('myLoans.pageDescription')} />

      {isLoading ? (
        <LoadingState label="Loading borrowing history" />
      ) : loadError ? (
        <ErrorState
          className="min-h-48"
          description={getErrorMessage(loadError, t('common.errors.generic'))}
          onRetry={loadLoans}
        />
      ) : loans.length === 0 ? (
        <NoResults
          icon={History}
          title={t('myLoans.empty.title')}
          description={t('myLoans.empty.description')}
        />
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card p-3.5 shadow-xs">
            <TableToolbar
              filters={[
                {
                  label: t('myLoans.filters.statusLabel'),
                  value: statusFilter,
                  onChange: (value) => {
                    setStatusFilter(value as LoanStatusFilter);
                    setPage(1);
                  },
                  options: [
                    { value: 'all', label: t('myLoans.filters.all') },
                    { value: 'active', label: t('myLoans.filters.active') },
                    { value: 'overdue', label: t('myLoans.filters.overdue') },
                    { value: 'returned', label: t('myLoans.filters.returned') },
                  ],
                },
              ]}
              sort={{
                label: t('myLoans.sort.label'),
                value: sort,
                onChange: (value) => {
                  setSort(value as LoanSort);
                  setPage(1);
                },
                options: [
                  { value: 'newest', label: t('myLoans.sort.newest') },
                  { value: 'oldest', label: t('myLoans.sort.oldest') },
                  { value: 'dueSoonest', label: t('myLoans.sort.dueSoonest') },
                  { value: 'dueLatest', label: t('myLoans.sort.dueLatest') },
                ],
              }}
              onReset={resetFilters}
            />
          </div>

          {filteredLoans.length === 0 ? (
            <NoResults
              icon={History}
              title={t('myLoans.empty.title')}
              description={t('myLoans.empty.description')}
              action={
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-sm font-medium text-primary"
                >
                  Reset
                </button>
              }
            />
          ) : (
            <>
              <div className="w-full overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
                <Table className="min-w-full">
                  <TableHeader className="bg-secondary/20">
                    <TableRow>
                      <TableHead className="whitespace-nowrap px-3.5 py-2.5">{t('myLoans.table.book')}</TableHead>
                      <TableHead className="whitespace-nowrap px-3.5 py-2.5">{t('myLoans.table.borrowed')}</TableHead>
                      <TableHead className="whitespace-nowrap px-3.5 py-2.5">{t('myLoans.table.due')}</TableHead>
                      <TableHead className="whitespace-nowrap px-3.5 py-2.5">{t('myLoans.table.returned')}</TableHead>
                      <TableHead className="whitespace-nowrap px-3.5 py-2.5 text-right">{t('myLoans.table.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedItems.map((loan) => (
                      <TableRow key={loan.id} className="transition-colors hover:bg-secondary/40">
                        <TableCell className="px-3.5 py-2.5">
                          <p className="font-semibold text-foreground text-xs sm:text-sm">{loan.book_title}</p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-3.5 py-2.5 text-xs text-muted-foreground">{formatDate(loan.borrowed_at)}</TableCell>
                        <TableCell className="whitespace-nowrap px-3.5 py-2.5 text-xs text-muted-foreground">{formatDate(loan.due_date)}</TableCell>
                        <TableCell className="whitespace-nowrap px-3.5 py-2.5 text-xs text-muted-foreground">
                          {formatDate(loan.returned_at) ?? t('myLoans.notReturned')}
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-3.5 py-2.5 text-right">
                          <StatusBadge status={loan.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={totalItems}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
