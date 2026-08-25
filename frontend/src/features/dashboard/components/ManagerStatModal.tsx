import { Armchair, BookPlus, ClipboardList, UserPlus } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, Button, EmptyState, Modal } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type {
  LoanRecord,
  ManagerDashboardStats,
  PendingReservationRequest,
} from '@/providers/AuthProvider';

export type ManagerStatKey =
  | 'seatsBookedToday'
  | 'booksIssuedToday'
  | 'newRegistrationsToday'
  | 'pendingTasks';

export interface ManagerStatModalProps {
  statKey: ManagerStatKey | null;
  onClose: () => void;
  stats: ManagerDashboardStats | null;
  activeLoans: LoanRecord[];
  pendingReservations: PendingReservationRequest[];
  pendingPaymentsCount: number;
  onBookSeat: () => void;
  onIssueBook: () => void;
  onRegisterMember: () => void;
}

const STAT_TITLE_KEYS: Record<ManagerStatKey, string> = {
  seatsBookedToday: 'managerDashboard.stats.seatsBookedToday',
  booksIssuedToday: 'managerDashboard.stats.booksIssuedToday',
  newRegistrationsToday: 'managerDashboard.stats.newRegistrationsToday',
  pendingTasks: 'managerDashboard.stats.pendingTasks',
};

function isToday(iso: string): boolean {
  return new Date(iso).toDateString() === new Date().toDateString();
}

// No walk-in seat log or same-day registration list exists on the backend yet (only
// today's count), so those two views summarize the number and hand off to the same
// counter-service action a manager would take next, instead of faking a list.
function SummaryBody({
  count,
  description,
  actionLabel,
  onAction,
}: {
  count: number;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <p className="text-4xl font-semibold tracking-tight text-foreground">{count}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{description}</p>
      <Button onClick={onAction}>{actionLabel}</Button>
    </div>
  );
}

function BooksIssuedTodayBody({
  loans,
  totalToday,
  onIssueBook,
}: {
  loans: LoanRecord[];
  totalToday: number;
  onIssueBook: () => void;
}) {
  const { t } = useTranslation();
  const issuedToday = useMemo(
    () => loans.filter((loan) => isToday(loan.borrowed_at)),
    [loans],
  );

  if (issuedToday.length === 0) {
    return (
      <EmptyState
        title={t('managerDashboard.statModal.booksIssuedToday.emptyTitle')}
        description={t('managerDashboard.statModal.booksIssuedToday.emptyDescription')}
        action={<Button onClick={onIssueBook}>{t('managerDashboard.quickActions.issueBookForMember')}</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {issuedToday.map((loan) => (
          <li key={loan.id} className="flex flex-col gap-1 rounded-lg border border-border p-3">
            <p className="text-sm font-medium text-foreground">{loan.book_title}</p>
            <p className="text-xs text-muted-foreground">
              {t('managerDashboard.activeLoans.borrowedBy', { name: loan.member_name })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('managerDashboard.activeLoans.dueDate', { date: formatDate(loan.due_date) })}
            </p>
          </li>
        ))}
      </ul>
      {totalToday > issuedToday.length && (
        <p className="text-xs text-muted-foreground">
          {t('managerDashboard.statModal.booksIssuedToday.returnedNote', {
            count: totalToday - issuedToday.length,
          })}
        </p>
      )}
    </div>
  );
}

function PendingTasksBody({
  stats,
  pendingReservations,
  pendingPaymentsCount,
}: {
  stats: ManagerDashboardStats;
  pendingReservations: PendingReservationRequest[];
  pendingPaymentsCount: number;
}) {
  const { t } = useTranslation();
  const accountedFor = pendingReservations.length + pendingPaymentsCount;
  const other = Math.max(stats.pending_tasks - accountedFor, 0);

  const rows = [
    {
      key: 'pendingReservations',
      label: t('managerDashboard.pendingReservations.title'),
      count: pendingReservations.length,
    },
    {
      key: 'pendingPayments',
      label: t('managerDashboard.payments.title'),
      count: pendingPaymentsCount,
    },
    ...(other > 0
      ? [
          {
            key: 'other',
            label: t('managerDashboard.statModal.pendingTasks.other'),
            count: other,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
        <span className="text-sm font-medium text-foreground">
          {t('managerDashboard.statModal.pendingTasks.total')}
        </span>
        <Badge variant="warning">{stats.pending_tasks}</Badge>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between text-sm">
            <span className="text-foreground">{row.label}</span>
            <span className="font-medium text-muted-foreground">{row.count}</span>
          </li>
        ))}
      </ul>
      {other > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('managerDashboard.statModal.pendingTasks.otherHint')}
        </p>
      )}
    </div>
  );
}

const STAT_ICONS: Record<ManagerStatKey, typeof Armchair> = {
  seatsBookedToday: Armchair,
  booksIssuedToday: BookPlus,
  newRegistrationsToday: UserPlus,
  pendingTasks: ClipboardList,
};

export function ManagerStatModal({
  statKey,
  onClose,
  stats,
  activeLoans,
  pendingReservations,
  pendingPaymentsCount,
  onBookSeat,
  onIssueBook,
  onRegisterMember,
}: ManagerStatModalProps) {
  const { t } = useTranslation();
  const Icon = statKey ? STAT_ICONS[statKey] : null;

  function renderBody() {
    if (!statKey || !stats) return null;

    switch (statKey) {
      case 'seatsBookedToday':
        return (
          <SummaryBody
            count={stats.seats_booked_today}
            description={t('managerDashboard.statModal.seatsBookedToday.description')}
            actionLabel={t('managerDashboard.quickActions.bookSeatForMember')}
            onAction={() => {
              onClose();
              onBookSeat();
            }}
          />
        );
      case 'booksIssuedToday':
        return (
          <BooksIssuedTodayBody
            loans={activeLoans}
            totalToday={stats.books_issued_today}
            onIssueBook={() => {
              onClose();
              onIssueBook();
            }}
          />
        );
      case 'newRegistrationsToday':
        return (
          <SummaryBody
            count={stats.new_registrations_today}
            description={t('managerDashboard.statModal.newRegistrationsToday.description')}
            actionLabel={t('managerDashboard.quickActions.registerNewMember')}
            onAction={() => {
              onClose();
              onRegisterMember();
            }}
          />
        );
      case 'pendingTasks':
        return (
          <PendingTasksBody
            stats={stats}
            pendingReservations={pendingReservations}
            pendingPaymentsCount={pendingPaymentsCount}
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