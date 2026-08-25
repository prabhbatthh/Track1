import { LifeBuoy } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, EmptyState } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { SupportTicketRecord } from '@/providers/AuthProvider';

import { CATEGORY_ICONS } from '../constants';
import { ResolveTicketModal } from './ResolveTicketModal';
import { TicketStatusBadge } from './TicketStatusBadge';

export interface StaffTicketQueueProps {
  tickets: SupportTicketRecord[];
  onResolve: (ticketId: string, resolutionNote: string) => Promise<void>;
}

export function StaffTicketQueue({ tickets, onResolve }: StaffTicketQueueProps) {
  const { t } = useTranslation();
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  if (tickets.length === 0) {
    return (
      <EmptyState
        icon={LifeBuoy}
        title={t('support.staff.emptyTitle')}
        description={t('support.staff.emptyDescription')}
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
              {t('support.staff.raisedBy', {
                name: ticket.raised_by_name,
                role: t(`auth.login.roles.${ticket.raised_by_role}`),
              })}
              {' · '}
              {formatDate(ticket.created_at)}
            </p>

            {ticket.resolution_note && (
              <div className="mt-3 rounded-md bg-secondary/50 p-3">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  {t('support.history.staffResponse')}
                </p>
                <p className="mt-1 text-foreground">{ticket.resolution_note}</p>
              </div>
            )}

            {ticket.status === 'open' && (
              <div className="mt-3 flex justify-end">
                <Button size="sm" onClick={() => setResolvingId(ticket.id)}>
                  {t('support.staff.resolveButton')}
                </Button>
              </div>
            )}
          </div>
        );
      })}

      <ResolveTicketModal
        open={resolvingId !== null}
        onClose={() => setResolvingId(null)}
        onSubmit={async (note) => {
          if (!resolvingId) return;
          await onResolve(resolvingId, note);
          setResolvingId(null);
        }}
      />
    </div>
  );
}
