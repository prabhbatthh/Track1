import { History } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageHeader, Pagination, TableToolbar } from '@/components/common';
import { NoResults } from '@/components/feedback';
import {
  Badge,
  SearchBar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { usePagination, useSortedItems } from '@/hooks';
import { formatDate } from '@/lib/format';
import { useAuth, type LoanRecord } from '@/providers/AuthProvider';

const PAGE_SIZE = 10;
type LoanStatusFilter = 'all' | 'active' | 'overdue' | 'returned';
type LoanSort = 'newest' | 'oldest' | 'dueSoonest' | 'dueLatest';

function StatusBadge({ status }: { status: LoanRecord['status'] }) {
  const { t } = useTranslation();
  const variant = status === 'overdue' ? 'warning' : status === 'returned' ? 'default' : 'success';
  return <Badge variant={variant}>{t(`managerDashboard.borrowHistory.status.${status}`)}</Badge>;
}

// Full loan ledger (active, overdue, and returned) for staff — the "Books Out on
// Loan" widget on the dashboard only shows what's currently active.
export function ManagerBorrowHistoryPage() {
  const { t } = useTranslation();
  const { getLoanHistory } = useAuth();
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LoanStatusFilter>('all');
  const [sort, setSort] = useState<LoanSort>('newest');

  useEffect(() => {
    let cancelled = false;
    getLoanHistory()
      .then((data) => {
        if (!cancelled) setLoans(data);
      })
      .catch(() => {
        if (!cancelled) setLoans([]);
      });
    return () => {
      cancelled = true;
    };
  }, [getLoanHistory]);

  const filteredLoans = useMemo(() => {
    const query = search.trim().toLowerCase();
    return loans.filter((loan) => {
      const matchesStatus = statusFilter === 'all' || loan.status === statusFilter;
      const matchesSearch =
        query.length === 0 ||
        loan.book_title.toLowerCase().includes(query) ||
        loan.member_name.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [loans, search, statusFilter]);

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

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateStatusFilter(value: string) {
    setStatusFilter(value as LoanStatusFilter);
    setPage(1);
  }

  function updateSort(value: string) {
    setSort(value as LoanSort);
    setPage(1);
  }

  function resetFilters() {
    setSearch('');
    setStatusFilter('all');
    setSort('newest');
    setPage(1);
  }

  const hasActiveFilters = search.trim().length > 0 || statusFilter !== 'all' || sort !== 'newest';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('managerDashboard.borrowHistory.pageTitle')}
        description={t('managerDashboard.borrowHistory.pageDescription')}
      />

      {/* Styled Filter & Search Toolbar Container matching Admin Members page */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <SearchBar
          value={search}
          onChange={updateSearch}
          placeholder={t('managerDashboard.borrowHistory.searchPlaceholder')}
          className="max-w-sm"
        />

        <TableToolbar
          filters={[
            {
              label: t('managerDashboard.borrowHistory.filters.statusLabel'),
              value: statusFilter,
              onChange: updateStatusFilter,
              options: [
                { value: 'all', label: t('managerDashboard.borrowHistory.filters.all') },
                { value: 'active', label: t('managerDashboard.borrowHistory.filters.active') },
                { value: 'overdue', label: t('managerDashboard.borrowHistory.filters.overdue') },
                { value: 'returned', label: t('managerDashboard.borrowHistory.filters.returned') },
              ],
            },
          ]}
          sort={{
            label: t('managerDashboard.borrowHistory.sort.label'),
            value: sort,
            onChange: updateSort,
            options: [
              { value: 'newest', label: t('managerDashboard.borrowHistory.sort.newest') },
              { value: 'oldest', label: t('managerDashboard.borrowHistory.sort.oldest') },
              { value: 'dueSoonest', label: t('managerDashboard.borrowHistory.sort.dueSoonest') },
              { value: 'dueLatest', label: t('managerDashboard.borrowHistory.sort.dueLatest') },
            ],
          }}
          onReset={resetFilters}
          resetLabel={t('common.actions.reset')}
        />
      </div>

      {filteredLoans.length === 0 ? (
        <NoResults
          icon={History}
          title={t('managerDashboard.borrowHistory.empty.title')}
          description={t('managerDashboard.borrowHistory.empty.description')}
          action={
            hasActiveFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                className="text-sm font-medium text-primary"
              >
                {t('common.actions.reset')}
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="w-full overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
            <Table className="min-w-full">
              <TableHeader className="bg-secondary/20">
                <TableRow>
                  <TableHead className="whitespace-nowrap px-3.5 py-2.5">{t('managerDashboard.borrowHistory.table.book')}</TableHead>
                  <TableHead className="whitespace-nowrap px-3.5 py-2.5">{t('managerDashboard.borrowHistory.table.member')}</TableHead>
                  <TableHead className="whitespace-nowrap px-3.5 py-2.5">{t('managerDashboard.borrowHistory.table.borrowed')}</TableHead>
                  <TableHead className="whitespace-nowrap px-3.5 py-2.5">{t('managerDashboard.borrowHistory.table.due')}</TableHead>
                  <TableHead className="whitespace-nowrap px-3.5 py-2.5">{t('managerDashboard.borrowHistory.table.returned')}</TableHead>
                  <TableHead className="whitespace-nowrap px-3.5 py-2.5 text-right">{t('managerDashboard.borrowHistory.table.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map((loan) => (
                  <TableRow key={loan.id} className="transition-colors hover:bg-secondary/40">
                    <TableCell className="px-3.5 py-2.5">
                      <p className="font-semibold text-foreground text-xs sm:text-sm">{loan.book_title}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3.5 py-2.5 font-medium text-foreground text-xs sm:text-sm">{loan.member_name}</TableCell>
                    <TableCell className="whitespace-nowrap px-3.5 py-2.5 text-xs text-muted-foreground">{formatDate(loan.borrowed_at)}</TableCell>
                    <TableCell className="whitespace-nowrap px-3.5 py-2.5 text-xs text-muted-foreground">{formatDate(loan.due_date)}</TableCell>
                    <TableCell className="whitespace-nowrap px-3.5 py-2.5 text-xs text-muted-foreground">
                      {formatDate(loan.returned_at) ?? t('managerDashboard.borrowHistory.notReturned')}
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
    </div>
  );
}
