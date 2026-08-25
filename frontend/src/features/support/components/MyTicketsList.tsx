import { LifeBuoy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button, EmptyState } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { SupportTicketRecord } from '@/providers/AuthProvider';

import { CATEGORY_ICONS } from '../constants';
import { TicketStatusBadge } from './TicketStatusBadge';

export interface MyTicketsListProps {
  tickets: SupportTicketRecord[];
  onConfirm: (ticketId: string) => void;
  onReopen: (ticketId: string) => void;
}

export function MyTicketsList({ tickets, onConfirm, onReopen }: MyTicketsListProps) {
  const { t } = useTranslation();

  if (tickets.length === 0) {
    return (
      <EmptyState
        icon={LifeBuoy}
        title={t('support.history.emptyTitle')}
        description={t('support.history.emptyDescription')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {tickets.map((ticket) => {
        const Icon = CATEGORY_ICONS[ticket.category];
        return (
          <div key={ticket.id} className="rounded-lg border border-border p-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-medium text-foreground">
                <Icon className="size-4 text-muted-foreground" />
                {t(`support.categories.${ticket.category}`)}
              </span>
              <TicketStatusBadge status={ticket.status} />
            </div>
            <p className="mt-2 whitespace-pre-wrap text-foreground">{ticket.description}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('support.history.raisedOn', { date: formatDate(ticket.created_at) })}
            </p>

            {ticket.resolution_note && (
              <div className="mt-3 rounded-md bg-secondary/50 p-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  {t('support.history.staffResponse')}
                </p>
                <p className="mt-1 text-foreground">{ticket.resolution_note}</p>
              </div>
            )}

            {ticket.status === 'resolved' && (
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => onReopen(ticket.id)}>
                  {t('support.actions.reopen')}
                </Button>
                <Button size="sm" onClick={() => onConfirm(ticket.id)}>
                  {t('support.actions.confirmResolved')}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
