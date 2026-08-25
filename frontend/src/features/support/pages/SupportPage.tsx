import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { PageHeader, Pagination, TableToolbar } from '@/components/common';
import { ErrorState, LoadingState } from '@/components/feedback';
import { Button, Select } from '@/components/ui';
import { usePagination, useSortedItems } from '@/hooks';
import { getErrorMessage } from '@/lib/api';
import { useAuth, type SupportTicketRecord, type SupportTicketStatus } from '@/providers/AuthProvider';

import { GUARDIAN_CATEGORIES, MEMBER_CATEGORIES } from '../constants';
import { MyTicketsList } from '../components/MyTicketsList';
import { RaiseTicketModal } from '../components/RaiseTicketModal';
import { StaffTicketQueue } from '../components/StaffTicketQueue';

const STAFF_FILTERS: (SupportTicketStatus | 'all')[] = ['all', 'open', 'resolved', 'closed'];
const TICKETS_PAGE_SIZE = 10;
type TicketSort = 'newest' | 'oldest';

function RaiserView({ role }: { role: 'member' | 'guardian' }) {
  const { t } = useTranslation();
  const { getMySupportTickets, confirmSupportTicket, reopenSupportTicket } = useAuth();
  const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<SupportTicketStatus | 'all'>('all');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const refresh = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    getMySupportTickets()
      .then(setTickets)
      .catch(setLoadError)
      .finally(() => setIsLoading(false));
  }, [getMySupportTickets]);

  useEffect(() => {
    const timer = setTimeout(refresh, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const filteredTickets = useMemo(
    () =>
      statusFilter === 'all'
        ? tickets
        : tickets.filter((ticket) => ticket.status === statusFilter),
    [statusFilter, tickets],
  );

  const sortedTickets = useSortedItems(filteredTickets, {
    compare: (a, b) => {
      const delta = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sort === 'newest' ? -delta : delta;
    },
  });

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(sortedTickets, 5);

  async function handleConfirm(ticketId: string) {
    try {
      await confirmSupportTicket(ticketId);
      toast.success(t('support.toasts.confirmed'));
      refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, t('common.errors.generic')));
    }
  }

  async function handleReopen(ticketId: string) {
    try {
      await reopenSupportTicket(ticketId);
      toast.success(t('support.toasts.reopened'));
      refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, t('common.errors.generic')));
    }
  }

  function resetFilters() {
    setStatusFilter('all');
    setSort('newest');
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('support.pageTitle')}
        description={t('support.pageDescription')}
        actions={<Button onClick={() => setModalOpen(true)}>{t('support.raiseButton')}</Button>}
      />

      <TableToolbar
        filters={[
          {
            label: t('support.filters.statusLabel'),
            value: statusFilter,
            onChange: (value) => {
              setStatusFilter(value as SupportTicketStatus | 'all');
              setPage(1);
            },
            options: [
              { value: 'all', label: t('support.staff.filters.all') },
              { value: 'open', label: t('support.staff.filters.open') },
              { value: 'resolved', label: t('support.staff.filters.resolved') },
              { value: 'closed', label: t('support.staff.filters.closed') },
            ],
          },
        ]}
        sort={{
          label: t('common.actions.sort'),
          value: sort,
          onChange: (value) => {
            setSort(value as 'newest' | 'oldest');
            setPage(1);
          },
          options: [
            { value: 'newest', label: t('support.sort.newest') },
            { value: 'oldest', label: t('support.sort.oldest') },
          ],
        }}
        onReset={resetFilters}
      />

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">{t('support.history.title')}</h2>
        {isLoading ? (
          <LoadingState label="Loading support tickets" />
        ) : loadError ? (
          <ErrorState
            className="min-h-48"
            description={getErrorMessage(loadError, t('common.errors.generic'))}
            onRetry={refresh}
          />
        ) : filteredTickets.length === 0 ? (
          <div className="text-sm text-muted-foreground">No matching tickets found.</div>
        ) : (
          <>
            <MyTicketsList tickets={paginatedItems} onConfirm={handleConfirm} onReopen={handleReopen} />
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={5}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      <RaiseTicketModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        categories={role === 'guardian' ? GUARDIAN_CATEGORIES : MEMBER_CATEGORIES}
        onCreated={() => {
          toast.success(t('support.toasts.created'));
          refresh();
        }}
      />
    </div>
  );
}

function StaffView() {
  const { t } = useTranslation();
  const { getStaffSupportTickets, resolveSupportTicket } = useAuth();
  const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);
  const [filter, setFilter] = useState<(typeof STAFF_FILTERS)[number]>('open');
  const [sort, setSort] = useState<TicketSort>('newest');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const refresh = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    getStaffSupportTickets(filter === 'all' ? undefined : filter)
      .then(setTickets)
      .catch(setLoadError)
      .finally(() => setIsLoading(false));
  }, [filter, getStaffSupportTickets]);

  useEffect(() => {
    const timer = setTimeout(refresh, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const sortedTickets = useSortedItems(tickets, {
    compare: (a, b) => {
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sort === 'newest' ? -diff : diff;
    },
  });

  const { page, setPage, totalPages, paginatedItems: pagedTickets, totalItems } = usePagination(
    sortedTickets,
    TICKETS_PAGE_SIZE,
  );

  async function handleResolve(ticketId: string, resolutionNote: string) {
    try {
      await resolveSupportTicket(ticketId, { resolution_note: resolutionNote });
      toast.success(t('support.staff.resolvedToast'));
      refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, t('common.errors.generic')));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('support.staff.title')} description={t('support.staff.description')} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex gap-2" role="group" aria-label={t('support.staff.filterAriaLabel')}>
          {STAFF_FILTERS.map((value) => (
            <Button
              key={value}
              size="sm"
              variant={filter === value ? 'primary' : 'outline'}
              onClick={() => {
                setFilter(value);
                setPage(1);
              }}
            >
              {t(`support.staff.filters.${value}`)}
            </Button>
          ))}
        </div>

        <Select
          label={t('support.staff.sort.label')}
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as TicketSort);
            setPage(1);
          }}
          className="w-full sm:w-44"
          options={[
            { value: 'newest', label: t('support.staff.sort.newest') },
            { value: 'oldest', label: t('support.staff.sort.oldest') },
          ]}
        />
      </div>

      {isLoading ? (
        <LoadingState label="Loading support queue" />
      ) : loadError ? (
        <ErrorState
          className="min-h-48"
          description={getErrorMessage(loadError, t('common.errors.generic'))}
          onRetry={refresh}
        />
      ) : (
        <StaffTicketQueue tickets={pagedTickets} onResolve={handleResolve} />
      )}

      {!isLoading && !loadError && sortedTickets.length > 0 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={TICKETS_PAGE_SIZE}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

export function SupportPage() {
  const { role } = useAuth();

  if (role === 'admin' || role === 'manager' || role === 'librarian' || role === 'it-head') {
    return <StaffView />;
  }
  if (role === 'guardian') {
    return <RaiserView role="guardian" />;
  }
  return <RaiserView role="member" />;
}
