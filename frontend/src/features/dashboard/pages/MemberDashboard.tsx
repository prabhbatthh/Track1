import { BookMarked, BookOpen, CalendarCheck, Flame, Star, Ticket } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { PageHeader, QuickActionsCard } from '@/components/common';
import { ROUTES } from '@/constants/routes';
import { useMembershipQuery } from '@/features/payment/hooks/useMembershipQuery';
import { LeaveLibraryReviewModal } from '@/features/reviews/components/LeaveLibraryReviewModal';
import { LibraryReviewCard } from '@/features/reviews/components/LibraryReviewCard';
import { apiGet, getErrorMessage } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import type { DueBook } from '@/mocks/dashboard';
import {
  useAuth,
  type LoanRecord,
  type MemberVisitStatus,
  type ReadingStreak,
  type Reservation,
  type SeatBookingRecord,
} from '@/providers/AuthProvider';

import { useNotificationsQuery } from '../../notifications/hooks/useNotificationsQuery';
import { BooksDueSoon } from '../components/BooksDueSoon';
import { CurrentlyBorrowed } from '../components/CurrentlyBorrowed';
import { MemberStatCard } from '../components/MemberStatCard';
import { MemberStatModal, type MemberStatKey } from '../components/MemberStatModal';
import { MemberSubscription } from '../components/MemberSubscription';
import { RecentNotifications, UpcomingEvents } from '../components/RecentActivity';

// Calendar-day difference (ignores time-of-day) so "3 days left" doesn't flicker
// to "2 days left" a few hours before midnight.
function daysUntil(iso: string): number {
  const due = new Date(iso);
  const now = new Date();
  const dueMidnight = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const nowMidnight = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((dueMidnight - nowMidnight) / (24 * 60 * 60 * 1000));
}

const EMPTY_STREAK: ReadingStreak = { current_streak_days: 0, longest_streak_days: 0 };

interface EventItem {
  id: string;
  title: string;
  date: string;
}

export function MemberDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    token,
    fullName,
    getMyLoans,
    getMyReservations,
    getMySeatBookings,
    getReadingStreak,
    getMyVisitStatus,
  } = useAuth();

  // Shared with the notification bell and panel — this page no longer refetches a list
  // the bell already has cached.
  const { notifications } = useNotificationsQuery();

  const { membership } = useMembershipQuery();
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [seatBookings, setSeatBookings] = useState<SeatBookingRecord[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const eventsRequestId = useRef(0);
  const [streak, setStreak] = useState<ReadingStreak>(EMPTY_STREAK);
  const [visitStatus, setVisitStatus] = useState<MemberVisitStatus | null>(null);
  const [activeStat, setActiveStat] = useState<MemberStatKey | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewRefreshKey, setReviewRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    getMyLoans().then((data) => {
      if (!cancelled) setLoans(data);
    }).catch(() => {
      if (!cancelled) setLoans([]);
    });
    getMyReservations().then((data) => {
      if (!cancelled) setReservations(data);
    }).catch(() => {
      if (!cancelled) setReservations([]);
    });
    getMySeatBookings().then((data) => {
      if (!cancelled) setSeatBookings(data);
    }).catch(() => {
      if (!cancelled) setSeatBookings([]);
    });
    getReadingStreak().then((data) => {
      if (!cancelled) setStreak(data);
    }).catch(() => {
      if (!cancelled) setStreak(EMPTY_STREAK);
    });
    getMyVisitStatus().then((data) => {
      if (!cancelled) setVisitStatus(data);
    }).catch(() => {
      if (!cancelled) setVisitStatus(null);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadEvents = useCallback(async () => {
    const requestId = ++eventsRequestId.current;
    setEventsLoading(true);
    setEventsError(null);

    try {
      // The event catalogue is public. Avoid coupling this dashboard card to
      // access-token refresh when it only needs the event title and date.
      const data = await apiGet<{ items: EventItem[] }>('/events?page_size=100');
      if (requestId === eventsRequestId.current) setEvents(data.items ?? []);
    } catch (error) {
      if (requestId === eventsRequestId.current) {
        setEventsError(getErrorMessage(error, t('dashboard.upcomingEvents.loadError')));
      }
    } finally {
      if (requestId === eventsRequestId.current) setEventsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadEvents(), 0);

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadEvents();
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.clearTimeout(initialLoad);
      eventsRequestId.current += 1;
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [loadEvents]);

  const activeLoans = useMemo(() => loans.filter((loan) => loan.status !== 'returned'), [loans]);
  const currentlyBorrowed = useMemo(
    () =>
      activeLoans.map((loan) => ({
        id: loan.id,
        title: loan.book_title,
        borrowedOn: formatDate(loan.borrowed_at),
      })),
    [activeLoans],
  );
  const booksDueSoon: DueBook[] = useMemo(
    () =>
      loans
        .filter((loan) => loan.status === 'active')
        .map((loan) => ({
          id: loan.id,
          title: loan.book_title,
          dueDate: formatDate(loan.due_date),
          daysLeft: daysUntil(loan.due_date),
        }))
        .sort((a, b) => a.daysLeft - b.daysLeft)
        .slice(0, 5),
    [loans],
  );

  const [now] = useState(Date.now);
  const upcomingEvents = useMemo(
    () =>
      events
        .filter((e) => new Date(e.date).getTime() >= now)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 5)
        .map((e) => ({
          id: e.id,
          title: e.title,
          date: formatDate(e.date),
        })),
    [events, now],
  );

  const unpaidFines = useMemo(
    () => loans.filter((loan) => loan.fine_amount > 0 && !loan.fine_paid),
    [loans],
  );
  const totalFine = useMemo(
    () => unpaidFines.reduce((sum, loan) => sum + loan.fine_amount, 0),
    [unpaidFines],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2.5">
            <span>{t('dashboard.welcomeBack', { name: (fullName ?? '').split(' ')[0] || 'there' })}</span>
            <Badge
              variant={visitStatus?.is_in_library ? 'success' : 'outline'}
              className="gap-1.5 text-xs font-normal"
              title={
                visitStatus?.is_in_library && visitStatus.checked_in_at
                  ? `Checked in at ${formatDate(visitStatus.checked_in_at)}`
                  : visitStatus?.last_checked_out_at
                  ? `Left at ${formatDate(visitStatus.last_checked_out_at)}`
                  : undefined
              }
            >
              <span
                className={cn(
                  'size-2 rounded-full',
                  visitStatus?.is_in_library ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/50',
                )}
              />
              {visitStatus?.is_in_library ? 'In Library' : 'Not in Library'}
            </Badge>
          </span>
        }
        description={membership ? membership.plan_label : t('dashboard.subscription.noPlan')}
      />

      <h2 className="sr-only">{t('common.dashboardSectionsHeading')}</h2>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
        <MemberSubscription
          className="lg:col-span-2"
          planLabel={membership ? membership.plan_label : 'No active plan'}
          expiresOn={membership ? formatDate(membership.expires_at) : undefined}
          purchasedAtIso={membership?.purchased_at}
          expiresAtIso={membership?.expires_at}
          isActive={membership?.is_active}
          outstandingFine={formatCurrency(totalFine)}
          fineReasonKey={unpaidFines.length > 0 ? 'lateReturn' : undefined}
          fineBookTitle={unpaidFines[0]?.book_title}
        />

        <MemberStatCard
          icon={BookOpen}
          tone="primary"
          label={t('dashboard.stats.booksBorrowed')}
          subtitle={t('dashboard.stats.booksBorrowedSubtitle')}
          value={String(activeLoans.length)}
          onClick={() => setActiveStat('booksBorrowed')}
          selected={activeStat === 'booksBorrowed'}
        />
        <MemberStatCard
          icon={BookMarked}
          tone="info"
          label={t('dashboard.stats.booksReserved')}
          subtitle={t('dashboard.stats.booksReservedSubtitle')}
          value={String(reservations.length)}
          onClick={() => setActiveStat('booksReserved')}
          selected={activeStat === 'booksReserved'}
        />
        <MemberStatCard
          icon={CalendarCheck}
          tone="success"
          label={t('dashboard.stats.seatBookings')}
          subtitle={t('dashboard.stats.seatBookingsSubtitle')}
          value={String(seatBookings.length)}
          onClick={() => setActiveStat('seatBookings')}
          selected={activeStat === 'seatBookings'}
        />
        <MemberStatCard
          icon={Flame}
          tone="warning"
          label={t('readingProgress.readingStreak.title')}
          subtitle={t('dashboard.stats.readingStreakSubtitle')}
          value={t('readingProgress.readingStreak.currentDays', {
            count: streak.current_streak_days,
          })}
          onClick={() => setActiveStat('readingStreak')}
          selected={activeStat === 'readingStreak'}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BooksDueSoon books={booksDueSoon} />
        <CurrentlyBorrowed books={currentlyBorrowed} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecentNotifications notifications={notifications.slice(0, 5)} />
        <UpcomingEvents
          events={upcomingEvents}
          isLoading={eventsLoading}
          error={eventsError}
          onRetry={loadEvents}
        />
      </div>

      <LibraryReviewCard onOpenModal={() => setIsReviewModalOpen(true)} refreshKey={reviewRefreshKey} />

      <QuickActionsCard
        title={t('dashboard.quickActions.title')}
        actions={[
          {
            label: t('dashboard.quickActions.browseBooks'),
            icon: BookOpen,
            onClick: () => navigate(ROUTES.BOOKS),
          },
          {
            label: t('dashboard.quickActions.bookASeat'),
            icon: CalendarCheck,
            onClick: () => navigate(ROUTES.SEAT_BOOKING),
          },
          {
            label: t('dashboard.quickActions.viewReservations'),
            icon: Ticket,
            onClick: () => navigate(ROUTES.RESERVATIONS),
          },
          {
            label: t('dashboard.quickActions.writeReview', 'Write Library Review'),
            icon: Star,
            onClick: () => setIsReviewModalOpen(true),
          },
        ]}
      />

      <LeaveLibraryReviewModal
        open={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        onSubmitted={() => setReviewRefreshKey((key) => key + 1)}
      />

      <MemberStatModal
        statKey={activeStat}
        onClose={() => setActiveStat(null)}
        activeLoans={activeLoans}
        reservations={reservations}
        seatBookings={seatBookings}
        streak={streak}
        onBrowseBooks={() => navigate(ROUTES.BOOKS)}
        onViewReservations={() => navigate(ROUTES.RESERVATIONS)}
        onManageSeatBookings={() => navigate(ROUTES.SEAT_BOOKING)}
        onViewReadingProgress={() => navigate(ROUTES.READING_PROGRESS)}
      />
    </div>
  );
}
