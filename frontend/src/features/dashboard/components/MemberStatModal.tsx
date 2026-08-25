import { BookMarked, BookOpen, CalendarCheck, Flame } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge, Button, EmptyState, Modal, type BadgeVariant } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { LoanRecord, ReadingStreak, Reservation, SeatBookingRecord } from '@/providers/AuthProvider';

export type MemberStatKey = 'booksBorrowed' | 'booksReserved' | 'seatBookings' | 'readingStreak';

export interface MemberStatModalProps {
  statKey: MemberStatKey | null;
  onClose: () => void;
  activeLoans: LoanRecord[];
  reservations: Reservation[];
  seatBookings: SeatBookingRecord[];
  streak: ReadingStreak;
  onBrowseBooks: () => void;
  onViewReservations: () => void;
  onManageSeatBookings: () => void;
  onViewReadingProgress: () => void;
}

const STAT_TITLE_KEYS: Record<MemberStatKey, string> = {
  booksBorrowed: 'dashboard.stats.booksBorrowed',
  booksReserved: 'dashboard.stats.booksReserved',
  seatBookings: 'dashboard.stats.seatBookings',
  readingStreak: 'readingProgress.readingStreak.title',
};

const STAT_ICONS: Record<MemberStatKey, typeof BookOpen> = {
  booksBorrowed: BookOpen,
  booksReserved: BookMarked,
  seatBookings: CalendarCheck,
  readingStreak: Flame,
};

const RESERVATION_BADGE_VARIANT: Record<Reservation['status'], BadgeVariant> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'outline',
};

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Mirrors SeatBookingPage's dateOptions: only today + the next 2 days are ever
// bookable there, so a booking outside that 3-day window is a past booking —
// already happened and no longer actionable — not an upcoming one to surface here.
function bookableDateValues(): Set<string> {
  const today = new Date();
  return new Set(
    [0, 1, 2].map((offset) => {
      const date = new Date(today);
      date.setDate(date.getDate() + offset);
      return toDateInputValue(date);
    }),
  );
}

function formatHour(hour: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${displayHour} ${period}`;
}

function BooksBorrowedBody({
  loans,
  onBrowseBooks,
}: {
  loans: LoanRecord[];
  onBrowseBooks: () => void;
}) {
  const { t } = useTranslation();

  if (loans.length === 0) {
    return (
      <EmptyState
        title={t('dashboard.statModal.booksBorrowed.emptyTitle')}
        description={t('dashboard.statModal.booksBorrowed.emptyDescription')}
        action={<Button onClick={onBrowseBooks}>{t('dashboard.quickActions.browseBooks')}</Button>}
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {loans.map((loan) => (
        <li key={loan.id} className="flex flex-col gap-1 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{loan.book_title}</p>
            {loan.status === 'overdue' && (
              <Badge variant="danger">{t('managerDashboard.activeLoans.daysLate', { count: loan.days_late })}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('managerDashboard.activeLoans.dueDate', { date: formatDate(loan.due_date) })}
          </p>
        </li>
      ))}
    </ul>
  );
}

function BooksReservedBody({
  reservations,
  onViewReservations,
}: {
  reservations: Reservation[];
  onViewReservations: () => void;
}) {
  const { t } = useTranslation();

  if (reservations.length === 0) {
    return (
      <EmptyState
        title={t('dashboard.statModal.booksReserved.emptyTitle')}
        description={t('dashboard.statModal.booksReserved.emptyDescription')}
        action={<Button onClick={onViewReservations}>{t('dashboard.quickActions.viewReservations')}</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {reservations.map((reservation) => (
          <li key={reservation.id} className="flex flex-col gap-1 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{reservation.book_title}</p>
              <Badge variant={RESERVATION_BADGE_VARIANT[reservation.status]}>
                {t(`reservations.status.${reservation.status}`)}
              </Badge>
            </div>
            {reservation.status === 'approved' && reservation.due_date && (
              <p className="text-xs text-muted-foreground">
                {t('reservations.dueBy', { date: formatDate(reservation.due_date) })}
              </p>
            )}
            {reservation.status === 'pending' && reservation.queue_position !== null && (
              <p className="text-xs text-muted-foreground">
                {t('reservations.queue.position', { position: reservation.queue_position })}
              </p>
            )}
          </li>
        ))}
      </ul>
      <Button onClick={onViewReservations}>
        {t('dashboard.quickActions.viewReservations')}
      </Button>
    </div>
  );
}

function SeatBookingsBody({
  bookings,
  onManageSeatBookings,
}: {
  bookings: SeatBookingRecord[];
  onManageSeatBookings: () => void;
}) {
  const { t } = useTranslation();
  const bookableDates = bookableDateValues();
  const upcoming = bookings.filter((booking) => bookableDates.has(booking.date));

  if (upcoming.length === 0) {
    return (
      <EmptyState
        title={t('dashboard.statModal.seatBookings.emptyTitle')}
        description={t('dashboard.statModal.seatBookings.emptyDescription')}
        action={<Button onClick={onManageSeatBookings}>{t('dashboard.quickActions.bookASeat')}</Button>}
      />
    );
  }

  const sorted = [...upcoming].sort(
    (a, b) => new Date(`${a.date}T00:00:00`).getTime() - new Date(`${b.date}T00:00:00`).getTime() || a.hour - b.hour,
  );
  const pastCount = bookings.length - upcoming.length;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {sorted.map((booking) => (
          <li
            key={booking.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-border p-3"
          >
            <p className="text-sm font-medium text-foreground">
              {t('dashboard.statModal.seatBookings.seatLabel', { seat: booking.seat_label })}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDate(booking.date)} · {formatHour(booking.hour)}
            </p>
          </li>
        ))}
      </ul>
      {pastCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('dashboard.statModal.seatBookings.pastNote', { count: pastCount })}
        </p>
      )}
      <Button onClick={onManageSeatBookings}>
        {t('dashboard.quickActions.bookASeat')}
      </Button>
    </div>
  );
}

function ReadingStreakBody({
  streak,
  onViewReadingProgress,
}: {
  streak: ReadingStreak;
  onViewReadingProgress: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <div className="flex items-center gap-2">
        <Flame className="size-8 text-primary" aria-hidden="true" />
        <p className="text-4xl font-semibold tracking-tight text-foreground">
          {t('readingProgress.readingStreak.currentDays', { count: streak.current_streak_days })}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        {t('dashboard.statModal.readingStreak.longest', { count: streak.longest_streak_days })}
      </p>
      <Button onClick={onViewReadingProgress}>{t('dashboard.statModal.readingStreak.viewProgress')}</Button>
    </div>
  );
}

export function MemberStatModal({
  statKey,
  onClose,
  activeLoans,
  reservations,
  seatBookings,
  streak,
  onBrowseBooks,
  onViewReservations,
  onManageSeatBookings,
  onViewReadingProgress,
}: MemberStatModalProps) {
  const { t } = useTranslation();
  const Icon = statKey ? STAT_ICONS[statKey] : null;

  function renderBody() {
    if (!statKey) return null;

    switch (statKey) {
      case 'booksBorrowed':
        return (
          <BooksBorrowedBody
            loans={activeLoans}
            onBrowseBooks={() => {
              onClose();
              onBrowseBooks();
            }}
          />
        );
      case 'booksReserved':
        return (
          <BooksReservedBody
            reservations={reservations}
            onViewReservations={() => {
              onClose();
              onViewReservations();
            }}
          />
        );
      case 'seatBookings':
        return (
          <SeatBookingsBody
            bookings={seatBookings}
            onManageSeatBookings={() => {
              onClose();
              onManageSeatBookings();
            }}
          />
        );
      case 'readingStreak':
        return (
          <ReadingStreakBody
            streak={streak}
            onViewReadingProgress={() => {
              onClose();
              onViewReadingProgress();
            }}
          />
        );
      default:
        return null;
    }
  }

  return (
    <Modal
      open={statKey !== null}
      onClose={onClose}
      title={
        statKey ? (
          <span className="flex items-center gap-2">
            {Icon && <Icon className="size-5 text-primary" aria-hidden="true" />}
            {t(STAT_TITLE_KEYS[statKey])}
          </span>
        ) : undefined
      }
      className="max-w-lg"
    >
      {renderBody()}
    </Modal>
  );
}