import { useState } from 'react';
import { Calendar, MapPin, Pencil, Trash2, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge, Button, ConfirmDialog, Drawer } from '@/components/ui';
import type { Event } from '../pages/EventsPage';
import { useAuth } from '@/providers/AuthProvider';

import { EventAnalyticsPanel } from './EventAnalyticsPanel';

export interface EventDetailsDrawerProps {
  event: Event | null;
  onClose: () => void;
  onToggleRegistration: (event: Event) => void;
  registrationBusy?: boolean;
  /** IT Head-only: removes an attendee from the event's registrant list. */
  onRemoveRegistrant?: (eventId: string, memberId: string) => void;
  /** Admin/manager-only: opens the edit form for this event. */
  onEdit?: (event: Event) => void;
  /** Admin/manager-only: deletes this event. */
  onDelete?: (event: Event) => void | Promise<void>;
}

export function EventDetailsDrawer({
  event,
  onClose,
  onToggleRegistration,
  registrationBusy = false,
  onRemoveRegistrant,
  onEdit,
  onDelete,
}: EventDetailsDrawerProps) {
  const { t } = useTranslation();
  const { role, token } = useAuth();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isStaff =
    role === 'admin' || role === 'manager' || role === 'librarian' || role === 'it-head';
  const hasHappened = event ? new Date(event.date).getTime() < new Date().getTime() : false;
  const canModerate = (role === 'admin' || role === 'it-head') && !hasHappened;
  const canManage = role === 'admin' || role === 'manager' || role === 'librarian';
  const isAdmin = role === 'admin';
  const isFull = Boolean(event && event.attendees >= event.capacity);
  const registrationBlocked = Boolean(event && !event.registered && (hasHappened || isFull));

  return (
    <>
      <Drawer
        open={event != null}
        onClose={onClose}
        title={event?.title ?? t('events.details.defaultTitle')}
      >
        {event && (
          <div className="flex flex-col gap-5">
            {canManage && (onEdit || onDelete) && (
              <div className="flex items-center gap-2 self-end">
                {onEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    leadingIcon={<Pencil className="size-4" />}
                    onClick={() => onEdit(event)}
                  >
                    {t('events.details.edit')}
                  </Button>
                )}
                {onDelete && (
                  <Button
                    size="sm"
                    variant="danger"
                    leadingIcon={<Trash2 className="size-4" />}
                    onClick={() => setConfirmDeleteOpen(true)}
                  >
                    {t('events.details.delete', 'Delete')}
                  </Button>
                )}
              </div>
            )}

            <p className="text-sm text-muted-foreground">{event.description}</p>

          <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Calendar className="size-4" />
              {new Date(event.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
            <span className="flex items-center gap-2">
              <MapPin className="size-4" /> {event.location}
            </span>
            <span className="flex items-center gap-2">
              <Users className="size-4" />
              {t('events.details.attending', {
                attendees: event.attendees,
                capacity: event.capacity,
              })}
            </span>
          </div>

          {isStaff ? (
            <div className="rounded-lg border border-border p-3">
              <p className="text-sm font-semibold text-foreground">
                {t('events.details.registeredAttendeesTitle')}
              </p>
              {event.registrants.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('events.details.noRegistrants')}
                </p>
              ) : (
                <ul className="mt-2 flex max-h-56 flex-col gap-1.5 overflow-y-auto">
                  {event.registrants.map((r) => (
                    <li key={r.id} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{r.full_name}</span>
                      {canModerate && onRemoveRegistrant && (
                        <button
                          type="button"
                          onClick={() => onRemoveRegistrant(event.id, r.id)}
                          className="text-xs font-medium text-danger hover:underline"
                        >
                          {t('events.details.removeRegistrant')}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border p-3">
              <p className="text-sm font-semibold text-foreground">
                {t('events.details.registrationTitle')}
              </p>
              <div className="mt-2 flex items-center justify-between">
                {event.registered ? (
                  <Badge variant="success">{t('events.details.registered')}</Badge>
                ) : (
                  <Badge variant="outline">{t('events.details.notRegistered')}</Badge>
                )}
                <Button
                  size="sm"
                  variant={event.registered ? 'outline' : 'primary'}
                  onClick={() => onToggleRegistration(event)}
                  isLoading={registrationBusy}
                  disabled={registrationBlocked}
                >
                  {event.registered
                    ? t('events.details.cancelRegistration')
                    : t('events.details.register')}
                </Button>
              </div>
              {registrationBlocked && (
                <p className="mt-2 text-xs text-muted-foreground" role="status">
                  {hasHappened
                    ? 'Registration is closed because this event has started.'
                    : 'Registration is closed because this event is full.'}
                </p>
              )}
            </div>
          )}

          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-semibold text-foreground">
              {t('events.details.managerAssignmentsTitle')}
            </p>
            {event.assigned_managers.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {t('events.details.noManagersAssigned')}
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                {event.assigned_managers.map((manager) => (
                  <li key={manager.id} className="text-sm text-foreground">
                    {manager.full_name}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {isAdmin && hasHappened && token && (
            <EventAnalyticsPanel eventId={event.id} eventTitle={event.title} token={token} />
          )}
        </div>
      )}
    </Drawer>

    <ConfirmDialog
      open={confirmDeleteOpen}
      title={t('events.details.deleteConfirmTitle', 'Delete Event?')}
      description={
        event
          ? t('events.details.deleteConfirmDescription', {
              title: event.title,
              defaultValue: `Are you sure you want to delete "${event.title}"? This action cannot be undone.`,
            })
          : ''
      }
      confirmLabel={t('events.details.delete', 'Delete')}
      cancelLabel={t('common.actions.cancel', 'Cancel')}
      destructive
      isLoading={isDeleting}
      onCancel={() => setConfirmDeleteOpen(false)}
      onConfirm={async () => {
        if (!event || !onDelete) return;
        setIsDeleting(true);
        try {
          await onDelete(event);
          setConfirmDeleteOpen(false);
        } finally {
          setIsDeleting(false);
        }
      }}
    />
  </>
);
}
