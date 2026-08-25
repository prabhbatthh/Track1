import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, CalendarPlus, CalendarX, Percent, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { StatisticCard, EventCard, PageHeader, Pagination } from '@/components/common';
import { ErrorState } from '@/components/feedback';
import { Button, EmptyState, Loader, Select } from '@/components/ui';
import { apiGet, apiPost, apiDelete, getErrorMessage } from '@/lib/api';
import { usePagedList } from '@/lib/usePagedList';
import { useAuth } from '@/providers/AuthProvider';
import { toast } from 'sonner';

import { CreateEventModal } from '../components/CreateEventModal';
import { EventDetailsDrawer } from '../components/EventDetailsDrawer';

const EVENTS_PAGE_SIZE = 10;
type EventTimeFilter = 'all' | 'upcoming' | 'past';
type EventSort = 'dateAsc' | 'dateDesc' | 'attendeesDesc' | 'attendeesAsc';

interface Registrant {
  id: string;
  full_name: string;
  email: string;
}

export interface Event {
  id: string;
  title: string;
  date: string;
  location: string;
  description: string;
  attendees: number;
  capacity: number;
  registered: boolean;
  registrants: Registrant[];
  assigned_managers: Registrant[];
}

interface EventListResponse {
  items: Event[];
  total: number;
}

interface AttendanceSummary {
  total_events_this_month: number;
  total_attendees: number;
  average_attendance_rate: number;
}

function getEventStatus(eventDate: string, now: number): 'ongoing' | 'upcoming' | 'closed' {
  const start = new Date(eventDate).getTime();
  const nowDate = new Date(now);
  const startDate = new Date(start);
  const isSameDay =
    startDate.getFullYear() === nowDate.getFullYear() &&
    startDate.getMonth() === nowDate.getMonth() &&
    startDate.getDate() === nowDate.getDate();

  if (isSameDay && start <= now) return 'ongoing';
  if (start > now) return 'upcoming';
  return 'closed';
}

const STATUS_PRIORITY: Record<'ongoing' | 'upcoming' | 'closed', number> = {
  ongoing: 0,
  upcoming: 1,
  closed: 2,
};

export function EventsPage() {
  const { t } = useTranslation();
  const { token, role } = useAuth();
  const canManage = role === 'admin' || role === 'manager' || role === 'librarian';
  const [events, setEvents] = useState<Event[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary>({
    total_events_this_month: 0,
    total_attendees: 0,
    average_attendance_rate: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [registrationBusyId, setRegistrationBusyId] = useState<string | null>(null);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [timeFilter, setTimeFilter] = useState<EventTimeFilter>('all');
  const [eventSort, setEventSort] = useState<EventSort>('dateAsc');

  const activeEvent = events.find((e) => e.id === activeEventId) ?? null;
  const now = new Date().getTime();

  // timeFilter is a dependency because the server does the filtering now: events are
  // paginated by date across the whole table, so filtering a fetched page client-side
  // meant filtering the oldest 100 events and showing nothing under "Upcoming".
  useEffect(fetchEvents, [token, t, timeFilter]);

  function fetchEvents() {
    setLoading(true);
    setLoadError(null);
    Promise.all([
      apiGet<EventListResponse>(
        `/events?page_size=100&timeframe=${timeFilter}`,
        token ?? undefined,
      ),
      apiGet<AttendanceSummary>('/events/summary'),
    ])
      .then(([list, s]) => {
        setEvents(list.items);
        setSummary(s);
      })
      .catch((error) => setLoadError(getErrorMessage(error, t('common.errors.generic'))))
      .finally(() => setLoading(false));
  }

  async function toggleRegistration(event: Event) {
    if (!token) return;
    const hasStarted = new Date(event.date).getTime() <= Date.now();
    if (!event.registered && (hasStarted || event.attendees >= event.capacity)) return;
    setRegistrationBusyId(event.id);
    try {
      let updated: Event;
      if (event.registered) {
        updated = await apiDelete<Event>(`/events/${event.id}/register`, token);
      } else {
        updated = await apiPost<Event>(`/events/${event.id}/register`, undefined, token);
      }
      setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    } finally {
      setRegistrationBusyId(null);
    }
  }

  async function removeRegistrant(eventId: string, memberId: string) {
    if (!token) return;
    try {
      const updated = await apiDelete<Event>(`/events/${eventId}/registrants/${memberId}`, token);
      setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    }
  }

  async function deleteEvent(event: Event) {
    if (!token) return;
    try {
      await apiDelete(`/events/${event.id}`, token);
      toast.success(t('events.details.deleteSuccessToast', { title: event.title, defaultValue: `Event "${event.title}" deleted` }));
      setEvents((prev) => prev.filter((e) => e.id !== event.id));
      setActiveEventId(null);
    } catch (err) {
      toast.error(getErrorMessage(err, t('events.details.deleteError', 'Failed to delete event')));
    }
  }



  const visibleEvents = useMemo(() => {
    // No timeframe filter here — the server already applied it. Sorting stays local
    // because it only reorders what this page received.
    return [...events].sort((a, b) => {
      const statusDiff =
        STATUS_PRIORITY[getEventStatus(a.date, now)] - STATUS_PRIORITY[getEventStatus(b.date, now)];
      if (statusDiff !== 0) return statusDiff;

      switch (eventSort) {
        case 'dateDesc':
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        case 'attendeesDesc':
          return b.attendees - a.attendees;
        case 'attendeesAsc':
          return a.attendees - b.attendees;
        case 'dateAsc':
        default:
          return new Date(a.date).getTime() - new Date(b.date).getTime();
      }
    });
  }, [events, eventSort, now]);

  const { page, setPage, totalPages, pageItems: pagedEvents } = usePagedList(
    visibleEvents,
    EVENTS_PAGE_SIZE,
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (loadError) {
    return (
      <ErrorState
        title="Events unavailable"
        description={loadError}
        onRetry={fetchEvents}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('events.pageTitle')}
        description={t('events.pageDescription')}
        actions={
          canManage ? (
            <Button leadingIcon={<CalendarPlus className="size-4" />} onClick={() => setCreateOpen(true)}>
              {t('events.form.createTitle')}
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatisticCard
          icon={CalendarCheck}
          label={t('events.stats.eventsThisMonth')}
          value={String(summary.total_events_this_month)}
        />
        <StatisticCard
          icon={Users}
          label={t('events.stats.totalAttendees')}
          value={String(summary.total_attendees)}
        />
        <StatisticCard
          icon={Percent}
          label={t('events.stats.avgAttendanceRate')}
          value={`${Math.round(summary.average_attendance_rate * 100)}%`}
        />
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title={t('events.empty.title')}
          description={t('events.empty.description')}
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Select
              label={t('events.filters.timeLabel')}
              value={timeFilter}
              onChange={(event) => {
                setTimeFilter(event.target.value as EventTimeFilter);
                setPage(1);
              }}
              className="w-full sm:w-44"
              options={[
                { value: 'all', label: t('events.filters.timeAll') },
                { value: 'upcoming', label: t('events.filters.timeUpcoming') },
                { value: 'past', label: t('events.filters.timePast') },
              ]}
            />

            <Select
              label={t('events.sort.label')}
              value={eventSort}
              onChange={(event) => {
                setEventSort(event.target.value as EventSort);
                setPage(1);
              }}
              className="w-full sm:w-48"
              options={[
                { value: 'dateAsc', label: t('events.sort.dateAsc') },
                { value: 'dateDesc', label: t('events.sort.dateDesc') },
                { value: 'attendeesDesc', label: t('events.sort.attendeesDesc') },
                { value: 'attendeesAsc', label: t('events.sort.attendeesAsc') },
              ]}
            />
          </div>

          {visibleEvents.length === 0 ? (
            <EmptyState
              icon={CalendarX}
              title={t('events.empty.title')}
              description={t('events.empty.description')}
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pagedEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    title={event.title}
                    date={new Date(event.date).toLocaleString('en-IN', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                    location={event.location}
                    attendees={event.attendees}
                    capacity={event.capacity}
                    registered={event.registered}
                    status={getEventStatus(event.date, now)}
                    onViewDetails={() => setActiveEventId(event.id)}
                  />
                ))}
              </div>

              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={visibleEvents.length}
                pageSize={EVENTS_PAGE_SIZE}
                onPageChange={setPage}
              />
            </>
          )}
        </>
      )}

      <EventDetailsDrawer
        event={activeEvent}
        onClose={() => setActiveEventId(null)}
        onToggleRegistration={toggleRegistration}
        registrationBusy={registrationBusyId === activeEvent?.id}
        onRemoveRegistrant={removeRegistrant}
        onEdit={(event) => {
          setActiveEventId(null);
          setEditingEvent(event);
        }}
        onDelete={deleteEvent}
      />

      <CreateEventModal
        open={createOpen || editingEvent !== null}
        event={editingEvent}
        onClose={() => {
          setCreateOpen(false);
          setEditingEvent(null);
        }}
        onSaved={fetchEvents}
      />
    </div>
  );
}
