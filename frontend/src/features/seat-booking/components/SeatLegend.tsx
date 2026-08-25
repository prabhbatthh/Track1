import { useTranslation } from 'react-i18next';

import { useAuth } from '@/providers/AuthProvider';

export function SeatLegend() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const isManagerOrStaff = role === 'admin' || role === 'librarian' || role === 'it-head';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-sm bg-success" /> {t('landing.seatAvailability.available')}
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-sm bg-warning" /> {t('landing.seatAvailability.reserved')}
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-sm bg-primary" /> {t('landing.seatAvailability.mine')}
        </span>
      </div>
      {isManagerOrStaff && (
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-success" /> {t('seatBooking.occupancy.available')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-warning" /> {t('seatBooking.occupancy.partial')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-danger" /> {t('seatBooking.occupancy.full')}
          </span>
        </div>
      )}
    </div>
  );
}
