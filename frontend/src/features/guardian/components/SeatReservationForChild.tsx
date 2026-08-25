import { Bell, BellRing } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { SeatCard } from '@/components/common';
import { Button, Card, CardContent, CardHeader, CardTitle, Modal, Select } from '@/components/ui';
import { SeatLegend } from '@/features/seat-booking/components/SeatLegend';
import { getErrorMessage } from '@/lib/api';
import { useAuth, type GuardianChild, type SeatSlot } from '@/providers/AuthProvider';

const SEAT_ROWS = ['A', 'B', 'C', 'D'];
const SEATS_PER_ROW = 8;
const SEAT_LABELS = SEAT_ROWS.flatMap((row) =>
  Array.from({ length: SEATS_PER_ROW }, (_, index) => `${row}${index + 1}`),
);
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatHourLabel(hour: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour} ${period}`;
}

export function SeatReservationForChild({ children }: { children: GuardianChild[] }) {
  const { t } = useTranslation();
  const { getSeatSchedule, bookSeatForChild, requestSeatNotifyForChild, cancelSeatBooking } = useAuth();
  const [selectedChildId, setSelectedChildId] = useState<string>(children[0]?.id ?? '');
  const [selectedSeatLabel, setSelectedSeatLabel] = useState<string | null>(null);
  const [notifiedSeatLabels, setNotifiedSeatLabels] = useState<Set<string>>(new Set());
  const [seats, setSeats] = useState<SeatSlot[] | null>(null);

  const dateOptions = useMemo(() => {
    const today = new Date();
    return [0, 1, 2].map((offset) => {
      const date = new Date(today);
      date.setDate(date.getDate() + offset);
      return {
        value: toDateInputValue(date),
        label: offset === 0 ? t('seatBooking.today') : dayFormatter.format(date),
      };
    });
  }, [t]);

  const todayValue = dateOptions[0].value;
  const [selectedDate, setSelectedDate] = useState(todayValue);
  const [selectedHour, setSelectedHour] = useState(() => new Date().getHours());
  const [slotModalDate, setSlotModalDate] = useState<string | null>(null);

  const isHourPast = (hour: number, date: string = selectedDate) =>
    date < todayValue || (date === todayValue && hour < new Date().getHours());
  const effectiveHour = isHourPast(selectedHour) ? new Date().getHours() : selectedHour;

  const selectedChild = children.find((child) => child.id === selectedChildId);
  const selectedSeat = seats?.find((seat) => seat.seat_label === selectedSeatLabel) ?? null;
  const isAvailable = selectedSeat?.status === 'available';
  const isBookedForChild = selectedSeat?.status === 'booked_for_child';
  const isNotified = selectedSeat ? notifiedSeatLabels.has(selectedSeat.seat_label) : false;

  function refreshSchedule() {
    getSeatSchedule(selectedDate, effectiveHour)
      .then((schedule) => setSeats(schedule.seats))
      .catch(() => setSeats(null));
  }


  function openSlotModal(date: string) {
    setSlotModalDate(date);
  }

  function chooseSlot(hour: number) {
    if (!slotModalDate || isHourPast(hour, slotModalDate)) return;
    setSelectedDate(slotModalDate);
    setSelectedHour(hour);
    setSelectedSeatLabel(null);
    setSlotModalDate(null);
  }

  useEffect(() => {
    let cancelled = false;

    function fetchSchedule() {
      getSeatSchedule(selectedDate, effectiveHour)
        .then((schedule) => {
          if (!cancelled) setSeats(schedule.seats);
        })
        .catch(() => {
          if (!cancelled) setSeats(null);
        });
    }

    fetchSchedule();
    const interval = setInterval(fetchSchedule, 60_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [getSeatSchedule, selectedDate, effectiveHour]);

  function toggleSeat(seatLabel: string) {
    setSelectedSeatLabel((prev) => (prev === seatLabel ? null : seatLabel));
  }

  async function confirmBooking() {
    if (!selectedSeat || !selectedChild || !isAvailable) return;
    try {
      await bookSeatForChild(selectedChild.id, {
        seat_label: selectedSeat.seat_label,
        date: selectedDate,
        hour: effectiveHour,
      });
      toast.success(
        t('guardian.seatReservation.confirmToast', {
          seatId: selectedSeat.seat_label,
          name: selectedChild.full_name,
        }),
      );
      setSelectedSeatLabel(null);
      refreshSchedule();
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    }
  }

  async function cancelChildBooking() {
    if (!selectedSeat?.booking_id) return;
    try {
      await cancelSeatBooking(selectedSeat.booking_id);
      toast.success(t('seatBooking.cancelToast', { defaultValue: 'Reservation cancelled' }));
      setSelectedSeatLabel(null);
      refreshSchedule();
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    }
  }

  async function requestNotify() {
    if (!selectedSeat || !selectedChild) return;
    try {
      await requestSeatNotifyForChild(selectedChild.id, {
        seat_label: selectedSeat.seat_label,
        date: selectedDate,
        hour: effectiveHour,
      });
      setNotifiedSeatLabels((prev) => new Set(prev).add(selectedSeat.seat_label));
      toast.success(
        t('guardian.seatReservation.notifyToast', {
          seatId: selectedSeat.seat_label,
          name: selectedChild.full_name,
        }),
      );
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('guardian.seatReservation.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Select
          label={t('guardian.seatReservation.selectChild')}
          value={selectedChildId}
          onChange={(event) => {
            setSelectedChildId(event.target.value);
            setSelectedSeatLabel(null);
          }}
          options={children.map((child) => ({ value: child.id, label: child.full_name }))}
          placeholder={t('guardian.seatReservation.selectChildPlaceholder')}
        />

        <p className="text-sm text-muted-foreground">
          {t('seatBooking.selectedSlot', {
            date: dateOptions.find((option) => option.value === selectedDate)?.label ?? selectedDate,
            hour: formatHourLabel(effectiveHour),
          })}{' '}
          <button
            type="button"
            onClick={() => openSlotModal(selectedDate)}
            className="font-medium text-primary hover:underline"
          >
            {t('seatBooking.changeTime')}
          </button>
        </p>

        <SeatLegend />

        <div className="flex flex-col gap-3">
          {SEAT_ROWS.map((row) => (
            <div key={row} className="flex items-center gap-2.5 sm:gap-4">
              <span className="w-6 shrink-0 text-center font-bold text-foreground text-sm sm:text-base">{row}</span>
              <div className="grid flex-1 grid-cols-4 gap-2 sm:grid-cols-8">
                {SEAT_LABELS.filter((label) => label.startsWith(row)).map((label) => {
                  const seat = seats?.find((s) => s.seat_label === label);
                  const visualStatus = !seat
                    ? 'available'
                    : seat.status === 'booked_for_child'
                    ? 'booked_for_child'
                    : seat.status === 'booked_by_me'
                    ? 'mine'
                    : seat.status === 'available'
                    ? 'available'
                    : 'reserved';
                  return (
                    <SeatCard
                      key={label}
                      label={label}
                      status={visualStatus}
                      avatarUrl={seat?.booked_by_avatar_url}
                      childName={seat?.booked_for_child_name}
                      selected={selectedSeatLabel === label}
                      onSelect={() => toggleSeat(label)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {!selectedSeat && (
          <p className="text-sm text-muted-foreground">{t('guardian.seatReservation.selectPrompt')}</p>
        )}

        {selectedSeat && isAvailable && selectedChild && (
          <p className="text-sm text-foreground">
            {t('guardian.seatReservation.selected', {
              seatId: selectedSeat.seat_label,
              name: selectedChild.full_name,
            })}
          </p>
        )}

        {selectedSeat && isBookedForChild && (
          <div className="rounded-md bg-primary/10 p-3 text-sm font-medium text-primary">
            Booked for {selectedSeat.booked_for_child_name || 'Child'}
          </div>
        )}

        {selectedSeat && !isAvailable && !isBookedForChild && (
          <div className="rounded-md bg-warning/10 p-3 text-sm font-medium text-warning">
            {t('seatBooking.bookingSummary.reservedByOther', { seatId: selectedSeat.seat_label })}
          </div>
        )}

        {selectedSeat && isBookedForChild && selectedSeat.booking_id && (
          <Button variant="outline" onClick={cancelChildBooking}>
            {t('seatBooking.bookingSummary.cancelButton', { defaultValue: 'Cancel Reservation' })}
          </Button>
        )}

        {selectedSeat &&
          !isAvailable &&
          !isBookedForChild &&
          (isNotified ? (
            <p className="flex items-center gap-1.5 text-sm text-success">
              <BellRing className="size-4" />
              {t('guardian.seatReservation.notifySet')}
            </p>
          ) : (
            <Button variant="outline" leadingIcon={<Bell className="size-4" />} onClick={requestNotify}>
              {t('guardian.seatReservation.notifyButton')}
            </Button>
          ))}

        <Button disabled={!selectedSeatLabel || !selectedChild || !isAvailable} onClick={confirmBooking}>
          {t('guardian.seatReservation.confirmButton')}
        </Button>

        <Modal
          open={slotModalDate !== null}
          onClose={() => setSlotModalDate(null)}
          title={
            slotModalDate
              ? t('seatBooking.pickTimeTitle', {
                  date: dateOptions.find((option) => option.value === slotModalDate)?.label ?? slotModalDate,
                })
              : undefined
          }
        >
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {HOURS.map((hour) => {
              const disabled = slotModalDate ? isHourPast(hour, slotModalDate) : false;
              const isCurrent = slotModalDate === selectedDate && effectiveHour === hour;
              return (
                <button
                  key={hour}
                  type="button"
                  disabled={disabled}
                  onClick={() => chooseSlot(hour)}
                  className={
                    'rounded-md px-2.5 py-2 text-sm font-medium transition-colors ' +
                    (disabled
                      ? 'cursor-not-allowed bg-secondary/20 text-muted-foreground/50'
                      : isCurrent
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary/60 text-foreground hover:bg-secondary')
                  }
                >
                  {formatHourLabel(hour)}
                </button>
              );
            })}
          </div>
        </Modal>
      </CardContent>
    </Card>
  );
}
