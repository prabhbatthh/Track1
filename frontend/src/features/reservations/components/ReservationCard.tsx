import { useTranslation } from 'react-i18next';

import { Badge, Button, Card, CardContent, type BadgeVariant } from '@/components/ui';
import type { Reservation } from '@/providers/AuthProvider';

export interface ReservationCardProps {
  reservation: Reservation;
  onCancel: () => void;
}

const badgeVariantByStatus: Record<Reservation['status'], BadgeVariant> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'outline',
};

export function ReservationCard({ reservation, onCancel }: ReservationCardProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-medium text-foreground">{reservation.book_title}</p>
          <p className="text-sm text-muted-foreground">
            {t('common.time.since', {
              date: new Date(reservation.created_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              }),
            })}
          </p>
          {reservation.status === 'approved' && reservation.due_date && (
            <p className="text-sm text-muted-foreground">
              {t('reservations.dueBy', {
                date: new Date(reservation.due_date).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                }),
              })}
            </p>
          )}
          {reservation.status === 'pending' && reservation.queue_position !== null && (
            <p className="text-sm text-muted-foreground">
              {t('reservations.queue.position', { position: reservation.queue_position })}
              {reservation.eta_days !== null &&
                ` — ${
                  reservation.eta_days === 0
                    ? t('reservations.queue.etaReady')
                    : t('reservations.queue.eta', { days: reservation.eta_days })
                }`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={badgeVariantByStatus[reservation.status]}>
            {t(`reservations.status.${reservation.status}`)}
          </Badge>
          {reservation.status === 'pending' && (
            <Button size="sm" variant="outline" onClick={onCancel}>
              {t('reservations.actions.cancel')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
