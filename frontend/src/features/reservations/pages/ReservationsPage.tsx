import { SearchX, Ticket } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { PageHeader, Pagination, TableToolbar } from '@/components/common';
import { ErrorState, LoadingState } from '@/components/feedback';
import { Button, Dialog, EmptyState, SearchBar } from '@/components/ui';
import { usePagination, useSortedItems } from '@/hooks';
import { ROUTES } from '@/constants/routes';
import { getErrorMessage } from '@/lib/api';
import { type Reservation, useAuth } from '@/providers/AuthProvider';

import { ReservationCard } from '../components/ReservationCard';

export function ReservationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getMyReservations, cancelReservation } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'cancelled'>('all');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'titleAsc' | 'titleDesc'>('newest');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const loadReservations = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    getMyReservations()
      .then(setReservations)
      .catch(setLoadError)
      .finally(() => setIsLoading(false));
  }, [getMyReservations]);

  useEffect(() => {
    const timer = setTimeout(loadReservations, 0);
    return () => clearTimeout(timer);
  }, [loadReservations]);

  const cancellingReservation = reservations.find((entry) => entry.id === cancellingId);

  const query = search.trim().toLowerCase();
  const filteredReservations = useMemo(
    () =>
      reservations.filter(
        (entry) =>
          entry.book_title.toLowerCase().includes(query) &&
          (statusFilter === 'all' ? true : entry.status === statusFilter),
      ),
    [reservations, query, statusFilter],
  );

  const sortedReservations = useSortedItems(filteredReservations, {
    compare: (a, b) => {
      switch (sort) {
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'titleAsc':
          return a.book_title.localeCompare(b.book_title);
        case 'titleDesc':
          return b.book_title.localeCompare(a.book_title);
        case 'newest':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    },
  });

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(sortedReservations, 5);

  async function confirmCancel() {
    if (!cancellingReservation) return;
    try {
      await cancelReservation(cancellingReservation.id);
      setReservations((prev) => prev.filter((entry) => entry.id !== cancellingReservation.id));
      toast.success(t('reservations.cancelSuccessToast', { book: cancellingReservation.book_title }));
    } catch (error) {
      toast.error(getErrorMessage(error, t('common.errors.generic')));
    } finally {
      setCancellingId(null);
    }
  }

  function resetFilters() {
    setSearch('');
    setStatusFilter('all');
    setSort('newest');
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('reservations.pageTitle')} description={t('reservations.pageDescription')} />

      {/* Styled Filter & Search Toolbar Container matching Admin Members page */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <SearchBar
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder={t('reservations.search.placeholder')}
          label={t('reservations.search.ariaLabel')}
          aria-label={t('reservations.search.ariaLabel')}
          className="sm:max-w-sm"
        />

        <TableToolbar
          filters={[
            {
              label: t('reservations.filters.statusLabel'),
              value: statusFilter,
              onChange: (value) => {
                setStatusFilter(value as 'all' | 'pending' | 'approved' | 'rejected' | 'cancelled');
                setPage(1);
              },
              options: [
                { value: 'all', label: t('reservations.filters.all') },
                { value: 'pending', label: t('reservations.filters.pending') },
                { value: 'approved', label: t('reservations.filters.approved') },
                { value: 'rejected', label: t('reservations.filters.rejected') },
                { value: 'cancelled', label: t('reservations.filters.cancelled') },
              ],
            },
          ]}
          sort={{
            label: t('common.actions.sort'),
            value: sort,
            onChange: (value) => {
              setSort(value as 'newest' | 'oldest' | 'titleAsc' | 'titleDesc');
              setPage(1);
            },
            options: [
              { value: 'newest', label: t('reservations.sort.newest') },
              { value: 'oldest', label: t('reservations.sort.oldest') },
              { value: 'titleAsc', label: t('reservations.sort.titleAsc') },
              { value: 'titleDesc', label: t('reservations.sort.titleDesc') },
            ],
          }}
          onReset={resetFilters}
        />
      </div>

      <section aria-labelledby="current-reservations-heading" className="flex flex-col gap-3">
        <h2 id="current-reservations-heading" className="text-lg font-semibold text-foreground">
          {t('reservations.current.heading')}
        </h2>
        {isLoading ? (
          <LoadingState label="Loading reservations" />
        ) : loadError ? (
          <ErrorState
            className="min-h-48"
            description={getErrorMessage(loadError, t('common.errors.generic'))}
            onRetry={loadReservations}
          />
        ) : reservations.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title={t('reservations.current.emptyTitle')}
            description={t('reservations.current.emptyDescription')}
            action={
              <Button size="sm" onClick={() => navigate(ROUTES.BOOKS)}>
                {t('reservations.current.browseBooks')}
              </Button>
            }
          />
        ) : filteredReservations.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={t('reservations.search.noResultsTitle')}
            description={t('reservations.search.noResultsDescription')}
            action={
              <Button size="sm" variant="outline" onClick={resetFilters}>
                {t('reservations.search.clearSearch')}
              </Button>
            }
          />
        ) : (
          <>
            {paginatedItems.map((reservation) => (
              <ReservationCard
                key={reservation.id}
                reservation={reservation}
                onCancel={() => setCancellingId(reservation.id)}
              />
            ))}

            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={5}
              onPageChange={setPage}
            />
          </>
        )}
      </section>

      <Dialog
        open={cancellingReservation != null}
        onClose={() => setCancellingId(null)}
        title={t('reservations.cancelDialog.title')}
        description={
          cancellingReservation
            ? t('reservations.cancelDialog.description', { book: cancellingReservation.book_title })
            : undefined
        }
        confirmLabel={t('reservations.cancelDialog.confirmLabel')}
        confirmVariant="danger"
        onConfirm={confirmCancel}
      />
    </div>
  );
}
