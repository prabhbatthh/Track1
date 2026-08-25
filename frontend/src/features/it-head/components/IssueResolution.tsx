import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Pagination, TableToolbar } from '@/components/common';
import { NoResults } from '@/components/feedback';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { usePagination } from '@/hooks';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import type { SupportTicketCategory, SupportTicketRecord } from '@/providers/AuthProvider';

const categoryLabelKey: Record<SupportTicketCategory, string> = {
  book_reservation: 'itHead.issueResolution.categories.bookReservation',
  payment: 'itHead.issueResolution.categories.payment',
  seat_booking: 'itHead.issueResolution.categories.seatBooking',
  harassment: 'itHead.issueResolution.categories.harassment',
  offline_library: 'itHead.issueResolution.categories.offlineLibrary',
  attendance: 'itHead.issueResolution.categories.attendance',
  other: 'itHead.issueResolution.categories.other',
};

export interface IssueResolutionProps {
  tickets: SupportTicketRecord[];
  onResolveClick: (ticket: SupportTicketRecord) => void;
}

export function IssueResolution({ tickets, onResolveClick }: IssueResolutionProps) {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortValue, setSortValue] = useState('newest');

  const filteredTickets = useMemo(() => {
    const items = [...tickets].filter((ticket) => {
      if (statusFilter === 'all') return true;
      return ticket.status === statusFilter;
    });

    switch (sortValue) {
      case 'oldest':
        return items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      case 'category':
        return items.sort((a, b) => a.category.localeCompare(b.category));
      case 'newest':
      default:
        return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
  }, [sortValue, statusFilter, tickets]);

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(filteredTickets, 4);

  return (
    <Card className="flex h-full flex-col justify-between">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle>{t('itHead.issueResolution.title')}</CardTitle>
        <TableToolbar
          variant="icon-only"
          filters={[
            {
              label: t('itHead.issueResolution.filters.statusLabel'),
              value: statusFilter,
              onChange: (value) => {
                setStatusFilter(value);
                setPage(1);
              },
              options: [
                { value: 'all', label: t('itHead.issueResolution.filters.all') },
                { value: 'open', label: t('itHead.issueResolution.status.open') },
                { value: 'resolved', label: t('itHead.issueResolution.status.resolved') },
                { value: 'closed', label: t('itHead.issueResolution.status.closed') },
              ],
            },
          ]}
          sort={{
            label: t('common.actions.sort'),
            value: sortValue,
            onChange: (value) => {
              setSortValue(value);
              setPage(1);
            },
            options: [
              { value: 'newest', label: t('itHead.issueResolution.sort.newestFirst') },
              { value: 'oldest', label: t('itHead.issueResolution.sort.oldestFirst') },
              { value: 'category', label: t('itHead.issueResolution.sort.category') },
            ],
          }}
          onReset={() => {
            setStatusFilter('all');
            setSortValue('newest');
            setPage(1);
          }}
          resetLabel={t('common.actions.reset')}
        />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-3">
        {filteredTickets.length === 0 ? (
          <NoResults title={t('itHead.issueResolution.empty')} />
        ) : (
          <div className="flex flex-col justify-between gap-3 h-full">
            <div className="flex flex-col gap-3">
              {paginatedItems.map((ticket) => (
                <div key={ticket.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{t(categoryLabelKey[ticket.category])}</Badge>
                    <Badge variant={ticket.status === 'open' ? 'warning' : 'success'}>
                      {t(`itHead.issueResolution.status.${ticket.status}`)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatRelativeTime(ticket.created_at)}</span>
                  </div>
                  <p className="mt-1 text-foreground">{ticket.description}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      {t('itHead.issueResolution.from', { name: ticket.raised_by_name })}
                    </p>
                    {ticket.status === 'open' && (
                      <Button size="sm" onClick={() => onResolveClick(ticket)}>
                        {t('itHead.issueResolution.resolve')}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={totalItems}
                pageSize={4}
                onPageChange={setPage}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
