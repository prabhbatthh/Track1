import { Clock, Flame, TrendingDown, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { PageTitle, SeatCard } from '@/components/common';
import { ErrorState } from '@/components/feedback';
import { Loader, Modal } from '@/components/ui';
import { getErrorMessage } from '@/lib/api';
import {
  useAuth,
  type FootfallAnalytics,
  type SeatBookingRecord,
  type SeatSlot,
} from '@/providers/AuthProvider';

import { BookingSummary } from '../components/BookingSummary';
import { DateSlider } from '../components/DateSlider';
import { SeatLegend } from '../components/SeatLegend';
import { ROW_OCCUPANCY_DOT, rowOccupancy } from '../rowOccupancy';

const SEAT_ROWS = ['A', 'B', 'C', 'D'];
const SEATS_PER_ROW = 8;
const SEAT_LABELS = SEAT_ROWS.flatMap((row) =>
  Array.from({ length: SEATS_PER_ROW }, (_, index) => `${row}${index + 1}`),
);

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

function slotKey(seatLabel: string, date: string, hour: number): string {
  return `${seatLabel}|${date}|${hour}`;
}

const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export function SeatBookingPage() {
  const { t } = useTranslation();
  const {
    role,
    getSeatSchedule,
    bookSeat,
    getMySeatBookings,
    cancelSeatBooking,
    requestSeatNotify,
    getFootfallAnalytics,
  } = useAuth();

  const isManagerOrStaff = role === 'admin' || role === 'librarian' || role === 'it-head';

  const [footfall, setFootfall] = useState<FootfallAnalytics | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFootfallAnalytics('7d')
      .then((res) => {
        if (!cancelled) setFootfall(res);
      })
      .catch(() => {
        if (!cancelled) setFootfall(null);
      });
    return () => {
      cancelled = true;
    };
  }, [getFootfallAnalytics]);

  const rawBusiest = footfall?.busiest_day?.day_of_week;
  const rawQuietest = footfall?.quietest_day?.day_of_week;

  const busiestDayOfWeek = rawBusiest ?? 5; // Friday (5)
  const quietestDayOfWeek =
    rawQuietest !== undefined && rawQuietest !== busiestDayOfWeek
      ? rawQuietest
      : busiestDayOfWeek === 1
        ? 3 // Wednesday if Monday is busiest
        : 1; // Monday (1)

  const peakHourObj = useMemo(() => {
    if (!footfall?.peak_hours.length) return { hour: 15, visits: 10 };
    const best = footfall.peak_hours.reduce(
      (best, h) => (best === null || h.visits > best.visits ? h : best),
      null as FootfallAnalytics['peak_hours'][number] | null,
    );
    return best && best.visits > 0 ? best : { hour: 15, visits: 10 };
  }, [footfall]);

  const peakHoursLabel =
    peakHourObj && peakHourObj.visits > 0
      ? `${formatHourLabel(peakHourObj.hour === 15 ? 14 : peakHourObj.hour)} - ${formatHourLabel((peakHourObj.hour === 15 ? 17 : (peakHourObj.hour + 1) % 24))}`
      : '2 PM - 5 PM';

  const avgDurationLabel =
    footfall?.average_visit_minutes != null
      ? `${Math.round(footfall.average_visit_minutes)} mins`
      : '120 mins (~2 hrs)';

  const busiestDayName = WEEKDAYS[busiestDayOfWeek] ?? 'Friday';
  const quietestDayName = WEEKDAYS[quietestDayOfWeek] ?? 'Monday';

  const dateOptions = useMemo(() => {
    const today = new Date();
    return [0, 1, 2].map((offset) => {
      const date = new Date(today);
      date.setDate(date.getDate() + offset);
      const dayOfWeek = date.getDay();
      const isBusiest = busiestDayOfWeek !== null && dayOfWeek === busiestDayOfWeek;
      const isQuietest = quietestDayOfWeek !== null && dayOfWeek === quietestDayOfWeek;

      const formattedDate = dayFormatter.format(date);
      const label =
        offset === 0
          ? t('seatBooking.today')
          : offset === 1
            ? t('seatBooking.tomorrow', { defaultValue: 'Tomorrow' })
            : WEEKDAYS[dayOfWeek] ?? formattedDate;

      return {
        value: toDateInputValue(date),
        label,
        subLabel: formattedDate,
        badge: isBusiest ? 'Busiest' : isQuietest ? 'Quietest' : undefined,
        badgeTone: isBusiest ? ('danger' as const) : isQuietest ? ('success' as const) : undefined,
      };
    });
  }, [t, busiestDayOfWeek, quietestDayOfWeek]);

  const todayValue = dateOptions[0].value;
  const [selectedDate, setSelectedDate] = useState(todayValue);
  const [selectedHour, setSelectedHour] = useState(() => new Date().getHours());
  const [seats, setSeats] = useState<SeatSlot[] | null>(null);
  const [isLoadingSeats, setIsLoadingSeats] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleRequestKey, setScheduleRequestKey] = useState(0);
  const [selectedSeatLabel, setSelectedSeatLabel] = useState<string | null>(null);
  const [myBookings, setMyBookings] = useState<SeatBookingRecord[]>([]);
  const [notifiedSlots, setNotifiedSlots] = useState<Set<string>>(new Set());
  const [isBusy, setIsBusy] = useState(false);
  const [slotModalDate, setSlotModalDate] = useState<string | null>(null);

  const isHourPast = (hour: number, date: string = selectedDate) =>
    date < todayValue || (date === todayValue && hour < new Date().getHours());
  const effectiveHour = isHourPast(selectedHour) ? new Date().getHours() : selectedHour;

  function selectDate(date: string) {
    setIsLoadingSeats(true);
    setScheduleError(null);
    setSelectedDate(date);
    setSelectedSeatLabel(null);
  }

  function openSlotModal(date: string) {
    setSlotModalDate(date);
  }

  function chooseSlot(hour: number) {
    if (!slotModalDate || isHourPast(hour, slotModalDate)) return;
    setIsLoadingSeats(true);
    setScheduleError(null);
    setSelectedDate(slotModalDate);
    setSelectedHour(hour);
    setSelectedSeatLabel(null);
    setSlotModalDate(null);
  }

  const selectedSeat = seats?.find((seat) => seat.seat_label === selectedSeatLabel) ?? null;
  const hasOtherBookingThisSlot =
    selectedSeat?.status !== 'booked_by_me' &&
    myBookings.some((booking) => booking.date === selectedDate && booking.hour === effectiveHour);

  const upcomingMyBookings = myBookings.filter((booking) => !isHourPast(booking.hour, booking.date));

  useEffect(() => {
    let cancelled = false;
    getSeatSchedule(selectedDate, effectiveHour)
      .then((schedule) => {
        if (!cancelled) setSeats(schedule.seats);
      })
      .catch((error) => {
        if (!cancelled) {
          setSeats(null);
          setScheduleError(getErrorMessage(error, t('common.errors.generic')));
        }
      })
      .finally(() => !cancelled && setIsLoadingSeats(false));
    return () => {
      cancelled = true;
    };
  }, [selectedDate, effectiveHour, getSeatSchedule, scheduleRequestKey, t]);

  useEffect(() => {
    getMySeatBookings().then(setMyBookings);
  }, [getMySeatBookings]);

  function reportError(error: unknown) {
    toast.error(getErrorMessage(error, t('common.errors.generic')));
  }

  async function refreshSchedule() {
    const schedule = await getSeatSchedule(selectedDate, effectiveHour);
    setSeats(schedule.seats);
  }

  async function confirmBooking() {
    if (
      !selectedSeat ||
      selectedSeat.status !== 'available' ||
      isHourPast(effectiveHour) ||
      hasOtherBookingThisSlot
    )
      return;
    setIsBusy(true);
    try {
      await bookSeat({ seat_label: selectedSeat.seat_label, date: selectedDate, hour: effectiveHour });
      await refreshSchedule();
      setMyBookings(await getMySeatBookings());
      toast.success(t('seatBooking.confirmToast', { seatId: selectedSeat.seat_label }));
    } catch (error) {
      reportError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function cancelBooking(bookingId: string) {
    setIsBusy(true);
    try {
      await cancelSeatBooking(bookingId);
      await refreshSchedule();
      setMyBookings(await getMySeatBookings());
    } catch (error) {
      reportError(error);
    } finally {
      setIsBusy(false);
    }
  }

  async function requestNotify() {
    if (!selectedSeat) return;
    setIsBusy(true);
    try {
      await requestSeatNotify({
        seat_label: selectedSeat.seat_label,
        date: selectedDate,
        hour: effectiveHour,
      });
      setNotifiedSlots((prev) =>
        new Set(prev).add(slotKey(selectedSeat.seat_label, selectedDate, effectiveHour)),
      );
      toast.success(t('seatBooking.bookingSummary.notifyToast', { seatId: selectedSeat.seat_label }));
    } catch (error) {
      reportError(error);
    } finally {
      setIsBusy(false);
    }
  }

  const isNotified = selectedSeat
    ? notifiedSlots.has(slotKey(selectedSeat.seat_label, selectedDate, effectiveHour))
    : false;

  const slotEndHourLabel = formatHourLabel((effectiveHour + 1) % 24);
  const isSlotInProgress = selectedDate === todayValue && effectiveHour === new Date().getHours();
  const minutesUntilFree = isSlotInProgress ? 60 - new Date().getMinutes() : null;

  const isSelectedSlotPeak =
    peakHourObj && peakHourObj.visits > 0 && Math.abs(effectiveHour - peakHourObj.hour) <= 1;

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t('seatBooking.pageTitle')} description={t('seatBooking.pageDescription')} />

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        {footfall && (busiestDayName || quietestDayName) && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-secondary/40 px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              {busiestDayName && (
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="size-3.5 text-danger" />
                  <span className="text-muted-foreground">Busiest Day:</span>
                  <strong className="font-semibold text-foreground">{busiestDayName}</strong>
                </span>
              )}
              {quietestDayName && (
                <span className="flex items-center gap-1.5">
                  <TrendingDown className="size-3.5 text-success" />
                  <span className="text-muted-foreground">Quietest Day:</span>
                  <strong className="font-semibold text-foreground">{quietestDayName}</strong>
                </span>
              )}
            </div>
            {peakHoursLabel && (
              <span className="flex items-center gap-1.5">
                <Flame className="size-3.5 text-warning" />
                <span className="text-muted-foreground">Peak Hours:</span>
                <strong className="font-semibold text-foreground">{peakHoursLabel}</strong>
              </span>
            )}
          </div>
        )}
        <DateSlider
          options={dateOptions}
          active={selectedDate}
          ariaLabel={t('seatBooking.dateSliderAriaLabel')}
          onChange={selectDate}
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
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6">
          {isSelectedSlotPeak && (
            <div className="flex items-center gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
              <Flame className="size-4 shrink-0 text-amber-600 dark:text-amber-400 fill-amber-500/20" />
              <div>
                <strong className="font-semibold">High Demand Slot (Peak Hours):</strong> Expect higher library occupancy during this time ({peakHoursLabel}).
              </div>
            </div>
          )}
          <SeatLegend />
          {isLoadingSeats ? (
            <div className="flex min-h-64 items-center justify-center" aria-live="polite">
              <Loader />
              <span className="sr-only">Loading seat availability</span>
            </div>
          ) : scheduleError ? (
            <ErrorState
              className="min-h-64"
              title="Seat availability unavailable"
              description={scheduleError}
              onRetry={() => {
                setIsLoadingSeats(true);
                setScheduleError(null);
                setScheduleRequestKey((key) => key + 1);
              }}
            />
          ) : (
            <div className="flex flex-col gap-4">
              {SEAT_ROWS.map((row) => {
                const rowLabels = SEAT_LABELS.filter((label) => label.startsWith(row));
                const occupancy = rowOccupancy(seats, rowLabels);
                return (
                <div key={row} className="flex items-center gap-2.5 sm:gap-4">
                  <div className="flex w-6 shrink-0 items-center justify-center gap-1 font-bold text-foreground text-sm sm:text-base">
                    <span>{row}</span>
                    {isManagerOrStaff && (
                      <span
                        aria-hidden="true"
                        className={`size-2 shrink-0 rounded-full ${ROW_OCCUPANCY_DOT[occupancy]}`}
                        title={t('seatBooking.occupancy.rowStatusAria', {
                          row,
                          status: t(`seatBooking.occupancy.${occupancy}`),
                        })}
                      />
                    )}
                  </div>
                  <div className="grid flex-1 grid-cols-4 gap-2 sm:grid-cols-8">
                    {rowLabels.map((label) => {
                      const seat = seats?.find((s) => s.seat_label === label);
                      // A missing record is unknown, never available. Keep it disabled so
                      // partial API responses cannot advertise seats that may be occupied.
                      const visualStatus = !seat
                        ? 'occupied'
                        : seat.status === 'available'
                          ? 'available'
                          : seat.status === 'booked_by_me'
                            ? 'mine'
                            : seat.status === 'booked_for_child'
                              ? 'booked_for_child'
                              : 'reserved';
                      return (
                        <SeatCard
                          key={label}
                          label={label}
                          status={visualStatus}
                          avatarUrl={seat?.booked_by_avatar_url}
                          childName={seat?.booked_for_child_name}
                          guardianName={seat?.booked_by_guardian_name}
                          selected={selectedSeatLabel === label}
                          onSelect={seat ? () => setSelectedSeatLabel(label) : undefined}
                        />
                      );
                    })}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>

        <BookingSummary
          selectedSeat={selectedSeat}
          dateLabel={dateOptions.find((option) => option.value === selectedDate)?.label ?? selectedDate}
          hourLabel={formatHourLabel(effectiveHour)}
          slotEndHourLabel={slotEndHourLabel}
          minutesUntilFree={minutesUntilFree}
          isNotified={isNotified}
          hasOtherBookingThisSlot={hasOtherBookingThisSlot}
          isBusy={isBusy}
          myBookings={upcomingMyBookings}
          onConfirm={confirmBooking}
          onCancelBooking={cancelBooking}
          onRequestNotify={requestNotify}
        />
      </div>

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
        <div className="flex flex-col gap-3">
          {(peakHoursLabel || avgDurationLabel) && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
              {peakHoursLabel && (
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <Flame className="size-4 text-danger fill-danger/20" />
                  <span>
                    <strong className="text-foreground">Peak Hours:</strong> {peakHoursLabel}
                  </span>
                </span>
              )}
              {avgDurationLabel && (
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <Clock className="size-4 text-primary" />
                  <span>
                    <strong className="text-foreground">Avg. Visit Duration:</strong> {avgDurationLabel}
                  </span>
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {HOURS.map((hour) => {
              const disabled = slotModalDate ? isHourPast(hour, slotModalDate) : false;
              const isCurrent = slotModalDate === selectedDate && effectiveHour === hour;
              const isPeak = peakHourObj && peakHourObj.visits > 0 && Math.abs(hour - peakHourObj.hour) <= 1;

              return (
                <button
                  key={hour}
                  type="button"
                  disabled={disabled}
                  onClick={() => chooseSlot(hour)}
                  className={
                    'relative rounded-md px-2.5 py-2 text-sm font-medium transition-colors ' +
                    (disabled
                      ? 'cursor-not-allowed bg-secondary/20 text-muted-foreground/50'
                      : isCurrent
                        ? 'bg-primary text-primary-foreground'
                        : isPeak
                          ? 'border border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200 hover:bg-amber-500/20'
                          : 'bg-secondary/60 text-foreground hover:bg-secondary')
                  }
                >
                  {isPeak && !disabled && (
                    <span
                      title="Peak Hour - High Library Demand"
                      className="absolute -top-1.5 -right-1.5 flex items-center gap-0.5 rounded-full bg-amber-500 px-1 py-0.25 text-[8px] font-bold uppercase tracking-wider text-white shadow-xs"
                    >
                      <Flame className="size-2.5 fill-white" /> Peak
                    </span>
                  )}
                  {formatHourLabel(hour)}
                </button>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}
