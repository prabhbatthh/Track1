import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { SeatCard } from '@/components/common';
import { ErrorState } from '@/components/feedback';
import { Button, Loader, Modal, Select } from '@/components/ui';
import { getErrorMessage } from '@/lib/api';
import { useAuth, type MemberSummary, type SeatSlot } from '@/providers/AuthProvider';

import { MemberPicker } from './MemberPicker';

const SEAT_ROWS = ['A', 'B', 'C', 'D'];
const SEATS_PER_ROW = 8;
const SEAT_LABELS = SEAT_ROWS.flatMap((row) =>
  Array.from({ length: SEATS_PER_ROW }, (_, index) => `${row}${index + 1}`),
);
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MAX_DAYS_AHEAD = 2;

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatHourLabel(hour: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour}:00 ${period}`;
}

const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export interface BookSeatForMemberModalProps {
  open: boolean;
  onClose: () => void;
  onBooked?: () => void;
}

export function BookSeatForMemberModal({ open, onClose, onBooked }: BookSeatForMemberModalProps) {
  const { t } = useTranslation();
  const { getSeatSchedule, bookSeatForMember } = useAuth();
  const [selectedMember, setSelectedMember] = useState<MemberSummary | null>(null);

  const dateOptions = useMemo(() => {
    const today = new Date();
    return Array.from({ length: MAX_DAYS_AHEAD + 1 }, (_, offset) => {
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
  const [seats, setSeats] = useState<SeatSlot[] | null>(null);
  const [isLoadingSeats, setIsLoadingSeats] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [selectedSeatLabel, setSelectedSeatLabel] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSelectedMember(null);
      setSelectedDate(todayValue);
      setSelectedHour(new Date().getHours());
      setSelectedSeatLabel(null);
    }
  }

  const isHourPast = (hour: number) => selectedDate === todayValue && hour < new Date().getHours();
  const effectiveHour = isHourPast(selectedHour) ? new Date().getHours() : selectedHour;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setTimeout(() => {
      if (!cancelled) {
        setIsLoadingSeats(true);
        setScheduleError(null);
      }
    }, 0);
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
  }, [open, selectedDate, effectiveHour, getSeatSchedule, retryKey, t]);

  function changeDate(date: string) {
    setSelectedSeatLabel(null);
    setSeats(null);
    setSelectedDate(date);
  }

  function changeHour(hour: number) {
    setSelectedSeatLabel(null);
    setSeats(null);
    setSelectedHour(hour);
  }

  async function onSubmit() {
    if (!selectedMember || !selectedSeatLabel) return;
    setIsSubmitting(true);
    try {
      await bookSeatForMember({
        member_id: selectedMember.id,
        seat_label: selectedSeatLabel,
        date: selectedDate,
        hour: effectiveHour,
      });
      toast.success(
        t('managerDashboard.bookSeatModal.successToast', {
          seatId: selectedSeatLabel,
          name: selectedMember.full_name,
        }),
      );
      onBooked?.();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSubmit = selectedMember !== null && selectedSeatLabel !== null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('managerDashboard.bookSeatModal.title')}
      className="max-w-2xl"
    >
      <div className="flex flex-col gap-4">
        <MemberPicker
          selectedMember={selectedMember}
          onSelect={setSelectedMember}
          label={t('managerDashboard.bookSeatModal.memberLabel')}
          searchPlaceholder={t('managerDashboard.billingRequest.memberSearchPlaceholder')}
          changeLabel={t('managerDashboard.billingRequest.changeMember')}
          noResultsLabel={t('managerDashboard.billingRequest.noMembersFound')}
          autoFocus
        />

        <div className="flex flex-wrap gap-2">
          {dateOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => changeDate(option.value)}
              className={
                'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ' +
                (selectedDate === option.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary/60 text-foreground hover:bg-secondary')
              }
            >
              {option.label}
            </button>
          ))}
        </div>

        <Select
          label={t('managerDashboard.bookSeatModal.hourLabel')}
          value={String(effectiveHour)}
          onChange={(event) => changeHour(Number(event.target.value))}
          options={HOURS.map((hour) => ({
            value: String(hour),
            label: formatHourLabel(hour),
            disabled: isHourPast(hour),
          }))}
        />

        <div className="flex min-h-64 flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          {isLoadingSeats ? (
            <div className="flex flex-1 items-center justify-center" aria-label="Loading seat availability">
              <Loader />
            </div>
          ) : scheduleError ? (
            <ErrorState
              className="min-h-48"
              title="Seat availability unavailable"
              description={scheduleError}
              onRetry={() => setRetryKey((key) => key + 1)}
            />
          ) : (
          <>
          {SEAT_ROWS.map((row) => (
            <div key={row} className="flex items-center gap-3">
              <span className="w-6 text-sm font-semibold text-muted-foreground">{row}</span>
              <div className="grid flex-1 grid-cols-4 gap-2 sm:grid-cols-8">
                {SEAT_LABELS.filter((label) => label.startsWith(row)).map((label) => {
                  const seat = seats?.find((s) => s.seat_label === label);
                  const visualStatus = !seat
                    ? 'occupied'
                    : seat.status === 'available'
                      ? 'available'
                      : 'reserved';
                  return (
                    <SeatCard
                      key={label}
                      label={label}
                      status={visualStatus}
                      avatarUrl={seat?.booked_by_avatar_url}
                      selected={selectedSeatLabel === label}
                      onSelect={visualStatus === 'available' ? () => setSelectedSeatLabel(label) : undefined}
                    />
                  );
                })}
              </div>
            </div>
          ))}
          </>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="button" isLoading={isSubmitting} disabled={!canSubmit} onClick={onSubmit}>
            {t('managerDashboard.bookSeatModal.submit')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
