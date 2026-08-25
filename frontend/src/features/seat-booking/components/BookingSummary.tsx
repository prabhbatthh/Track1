import { Bell, BellRing, Clock3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import type { SeatBookingRecord, SeatSlot } from '@/providers/AuthProvider';

export interface BookingSummaryProps {
  selectedSeat: SeatSlot | null;
  dateLabel: string;
  hourLabel: string;
  /** Label for when the currently selected 1-hour slot ends, e.g. "5 PM". */
  slotEndHourLabel: string;
  /** Minutes left in the slot if it's happening right now, else null (future slot). */
  minutesUntilFree: number | null;
  isNotified: boolean;
  /** True when you already hold a different seat in this exact date/hour slot. */
  hasOtherBookingThisSlot: boolean;
  isBusy: boolean;
  myBookings: SeatBookingRecord[];
  onConfirm: () => void;
  onCancelBooking: (bookingId: string) => void;
  onRequestNotify: () => void;
}

function formatBookingHour(hour: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour} ${period}`;
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// A booking is "in progress" (rather than simply "upcoming") when its 1-hour
// slot has started but not yet ended — e.g. an 8 PM booking checked at 8:54 PM.
function isBookingInProgress(date: string, hour: number): boolean {
  const now = new Date();
  return date === toDateInputValue(now) && hour === now.getHours();
}

export function BookingSummary({
  selectedSeat,
  dateLabel,
  hourLabel,
  slotEndHourLabel,
  minutesUntilFree,
  isNotified,
  hasOtherBookingThisSlot,
  isBusy,
  myBookings,
  onConfirm,
  onCancelBooking,
  onRequestNotify,
}: BookingSummaryProps) {
  const { t } = useTranslation();
  const isAvailable = selectedSeat?.status === 'available';
  const isMine = selectedSeat?.status === 'booked_by_me';
  const isBookedForChild = selectedSeat?.status === 'booked_for_child';
  const isTaken = selectedSeat?.status === 'reserved';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('seatBooking.bookingSummary.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!selectedSeat && (
          <p className="text-sm text-muted-foreground">
            {t('seatBooking.bookingSummary.selectPrompt')}
          </p>
        )}

        {selectedSeat && (
          <p className="text-sm text-foreground">
            {t('seatBooking.bookingSummary.slotLabel', {
              seatId: selectedSeat.seat_label,
              date: dateLabel,
              hour: hourLabel,
            })}
          </p>
        )}

        {isTaken && selectedSeat && (
          <div className="rounded-md bg-warning/10 p-3 text-sm font-medium text-warning">
            {t('seatBooking.bookingSummary.reservedByOther', { seatId: selectedSeat.seat_label })}
          </div>
        )}

        {isMine && selectedSeat && (
          <div className="rounded-md bg-primary/10 p-3 text-sm font-medium text-primary">
            {selectedSeat.booked_by_guardian_name
              ? `Booked for you by your guardian (${selectedSeat.booked_by_guardian_name})`
              : t('seatBooking.bookingSummary.bookedByYou', { seatId: selectedSeat.seat_label })}
          </div>
        )}

        {isBookedForChild && selectedSeat && (
          <div className="rounded-md bg-primary/10 p-3 text-sm font-medium text-primary">
            Booked for {selectedSeat.booked_for_child_name || 'Child'}
          </div>
        )}

        {(isTaken || isMine || isBookedForChild) && selectedSeat && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Clock3 className="mt-0.5 size-3.5 shrink-0" />
            {minutesUntilFree !== null
              ? t('seatBooking.bookingSummary.slotDurationCountdown', {
                  minutes: minutesUntilFree,
                })
              : t('seatBooking.bookingSummary.slotDurationFixed', { endHour: slotEndHourLabel })}
          </p>
        )}

        {isAvailable && hasOtherBookingThisSlot && (
          <div className="rounded-md bg-warning/10 p-3 text-sm font-medium text-warning">
            {t('seatBooking.bookingSummary.alreadyBookedThisSlot')}
          </div>
        )}

        {isTaken &&
          (isNotified ? (
            <p className="flex items-center gap-1.5 text-sm text-success">
              <BellRing className="size-4" />
              {t('seatBooking.bookingSummary.notifySet')}
            </p>
          ) : (
            <Button
              variant="outline"
              leadingIcon={<Bell className="size-4" />}
              disabled={isBusy}
              onClick={onRequestNotify}
            >
              {t('seatBooking.bookingSummary.notifyButton')}
            </Button>
          ))}

        {isMine || (isBookedForChild && selectedSeat?.booking_id) ? (
          <Button
            variant="outline"
            disabled={isBusy}
            onClick={() => selectedSeat?.booking_id && onCancelBooking(selectedSeat.booking_id)}
          >
            {t('seatBooking.bookingSummary.cancelButton')}
          </Button>
        ) : (
          <Button
            disabled={!isAvailable || isBusy || hasOtherBookingThisSlot}
            onClick={onConfirm}
          >
            {t('seatBooking.bookingSummary.confirmButton')}
          </Button>
        )}

        {myBookings.length > 0 && (
          <div className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('seatBooking.bookingSummary.yourBookings')}
            </p>
            {myBookings.map((booking) => {
              const inProgress = isBookingInProgress(booking.date, booking.hour);
              return (
                <div
                  key={booking.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-secondary/40 px-3 py-2 text-sm"
                >
                  <span className="text-foreground">
                    {booking.seat_label} · {booking.date} ·{' '}
                    {inProgress
                      ? t('seatBooking.bookingSummary.bookingInProgress', {
                          endHour: formatBookingHour((booking.hour + 1) % 24),
                        })
                      : formatBookingHour(booking.hour)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isBusy}
                    onClick={() => onCancelBooking(booking.id)}
                  >
                    {t('seatBooking.bookingSummary.cancelButton')}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
