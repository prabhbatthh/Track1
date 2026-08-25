import { CheckCircle2, Clock, IndianRupee, KeyRound, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Pagination } from '@/components/common';
import { Avatar, Badge, Button, EmptyState, Modal } from '@/components/ui';
import { usePagination } from '@/hooks';
import { formatCurrency, formatDate } from '@/lib/format';
import { getErrorMessage } from '@/lib/api';
import {
  useAuth,
  type ITHeadDashboard,
  type LoanRecord,
  type MemberRecord,
  type PermissionRequestRecord,
  type SupportTicketCategory,
  type SupportTicketRecord,
} from '@/providers/AuthProvider';

export type ITHeadStatKey =
  | 'activeMembers'
  | 'openIssues'
  | 'pendingPermissions'
  | 'feesOutstanding'
  | 'lateFinesOutstanding';

export interface ITHeadStatModalProps {
  statKey: ITHeadStatKey | null;
  onClose: () => void;
  members: MemberRecord[];
  permissionRequests: PermissionRequestRecord[];
  tickets: SupportTicketRecord[];
  fines: LoanRecord[];
  feeEntries: ITHeadDashboard['fee_status'];
  onResolveTicket: (ticket: SupportTicketRecord) => void;
  onChanged: () => void;
}

const STAT_TITLE_KEYS: Record<ITHeadStatKey, string> = {
  activeMembers: 'itHead.stats.activeMembers',
  openIssues: 'itHead.stats.openIssues',
  pendingPermissions: 'itHead.stats.pendingPermissions',
  feesOutstanding: 'itHead.stats.feesOutstanding',
  lateFinesOutstanding: 'itHead.stats.lateFinesOutstanding',
};

const categoryLabelKey: Record<SupportTicketCategory, string> = {
  book_reservation: 'itHead.issueResolution.categories.bookReservation',
  payment: 'itHead.issueResolution.categories.payment',
  seat_booking: 'itHead.issueResolution.categories.seatBooking',
  harassment: 'itHead.issueResolution.categories.harassment',
  offline_library: 'itHead.issueResolution.categories.offlineLibrary',
  attendance: 'itHead.issueResolution.categories.attendance',
  other: 'itHead.issueResolution.categories.other',
};

function ActiveMembersBody({ members = [] }: { members?: MemberRecord[] }) {
  const { t } = useTranslation();
  const activeList = (members || []).filter((m) => m?.is_active);
  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(activeList, 5);

  if (activeList.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={t('itHead.accessControl.empty', { defaultValue: 'No active members' })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {paginatedItems.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between rounded-lg border border-border bg-surface p-3"
          >
            <div className="flex items-center gap-3">
              <Avatar src={m.avatar_url ?? undefined} name={m.full_name || 'Member'} size="sm" />
              <div>
                <p className="text-sm font-semibold text-foreground">{m.full_name || 'Unknown'}</p>
                <p className="text-xs text-muted-foreground">{m.email}</p>
              </div>
            </div>
            <Badge variant="outline">{m.role?.name || 'member'}</Badge>
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={5}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

function OpenIssuesBody({
  tickets = [],
  onResolveTicket,
}: {
  tickets?: SupportTicketRecord[];
  onResolveTicket: (ticket: SupportTicketRecord) => void;
}) {
  const { t } = useTranslation();
  const openList = (tickets || []).filter((t) => t?.status === 'open');
  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(openList, 3);

  if (openList.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title={t('itHead.issueResolution.empty', { defaultValue: 'No open support issues' })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {paginatedItems.map((ticket) => {
          const catKey = categoryLabelKey[ticket.category] || ticket.category;
          const raiserName = ticket.raised_by_name || 'User';
          return (
            <li
              key={ticket.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-sm"
            >
              <div className="flex items-center justify-between">
                <Badge variant="warning">
                  {t(catKey, { defaultValue: ticket.category })}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {ticket.created_at ? formatDate(ticket.created_at) : ''}
                </span>
              </div>
              <p className="text-foreground">{ticket.description}</p>
              <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
                <span>{t('itHead.issueResolution.from', { name: raiserName })}</span>
                <Button size="sm" onClick={() => onResolveTicket(ticket)}>
                  {t('itHead.issueResolution.resolve')}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={3}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

function PendingPermissionsBody({
  requests = [],
  onChanged,
}: {
  requests?: PermissionRequestRecord[];
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { grantPermissionRequest, denyPermissionRequest } = useAuth();
  const pendingList = (requests || []).filter((r) => r?.status === 'pending');
  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(pendingList, 5);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleGrant(req: PermissionRequestRecord) {
    setBusyId(req.id);
    try {
      await grantPermissionRequest(req.id);
      toast.success(t('itHead.accessControl.grantedToast', { name: req.requested_by_name }));
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeny(req: PermissionRequestRecord) {
    setBusyId(req.id);
    try {
      await denyPermissionRequest(req.id);
      toast.success(t('itHead.accessControl.deniedToast', { name: req.requested_by_name }));
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    } finally {
      setBusyId(null);
    }
  }

  if (pendingList.length === 0) {
    return (
      <EmptyState
        icon={KeyRound}
        title={t('itHead.accessControl.empty', { defaultValue: 'No pending permission requests' })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {paginatedItems.map((req) => (
          <li
            key={req.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-sm"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">{req.requested_by_name || 'User'}</span>
              <Badge variant="warning">{req.permission}</Badge>
            </div>
            {req.reason && <p className="text-xs text-muted-foreground">{req.reason}</p>}
            <div className="flex items-center justify-end gap-2 border-t border-border pt-2">
              <Button
                size="sm"
                variant="outline"
                isLoading={busyId === req.id}
                onClick={() => handleDeny(req)}
              >
                {t('itHead.accessControl.deny')}
              </Button>
              <Button
                size="sm"
                isLoading={busyId === req.id}
                onClick={() => handleGrant(req)}
              >
                {t('itHead.accessControl.grantAccess')}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={5}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

function FeesOutstandingBody({ entries = [] }: { entries?: ITHeadDashboard['fee_status'] }) {
  const { t } = useTranslation();
  const outstanding = (entries || []).filter((e) => e?.status !== 'paid');
  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(outstanding, 5);

  if (outstanding.length === 0) {
    return (
      <EmptyState
        icon={IndianRupee}
        title={t('itHead.feeStatus.empty', { defaultValue: 'No outstanding fees' })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {paginatedItems.map((entry) => (
          <li
            key={entry.member_id}
            className="flex items-center justify-between rounded-lg border border-border bg-surface p-3 text-sm"
          >
            <div>
              <p className="font-semibold text-foreground">{entry.member_name}</p>
              {entry.due_date && (
                <p className="text-xs text-muted-foreground">
                  Due: {formatDate(entry.due_date)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold text-foreground">{formatCurrency(entry.amount_due || 0)}</span>
              <Badge variant={entry.status === 'overdue' ? 'danger' : 'warning'}>
                {t(`itHead.feeStatus.status.${entry.status}`, { defaultValue: entry.status })}
              </Badge>
            </div>
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={5}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

function LateFinesOutstandingBody({
  fines = [],
  onChanged,
}: {
  fines?: LoanRecord[];
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { markFinePaid } = useAuth();
  const unpaidList = (fines || []).filter((f) => f && f.fine_amount > 0 && !f.fine_paid);
  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(unpaidList, 5);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleSettle(loanId: string, memberName: string) {
    setBusyId(loanId);
    try {
      await markFinePaid(loanId);
      toast.success(t('itHead.lateFines.markedPaidToast', { name: memberName }));
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    } finally {
      setBusyId(null);
    }
  }

  if (unpaidList.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title={t('lateFines.empty', { defaultValue: 'No unpaid late return fines' })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {paginatedItems.map((loan) => (
          <li
            key={loan.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground">{loan.member_name}</p>
                <p className="text-xs text-muted-foreground">{loan.book_title}</p>
              </div>
              <span className="font-semibold text-danger">
                {formatCurrency(loan.fine_amount)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
              <span>Due: {loan.due_date ? formatDate(loan.due_date) : ''}</span>
              <Button
                size="sm"
                isLoading={busyId === loan.id}
                onClick={() => handleSettle(loan.id, loan.member_name)}
              >
                Mark Paid
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={5}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

export function ITHeadStatModal({
  statKey,
  onClose,
  members,
  permissionRequests,
  tickets,
  fines,
  feeEntries,
  onResolveTicket,
  onChanged,
}: ITHeadStatModalProps) {
  const { t } = useTranslation();

  if (!statKey) return null;

  const titleKey = STAT_TITLE_KEYS[statKey];
  const title = titleKey ? t(titleKey) : statKey;

  return (
    <Modal open={statKey !== null} onClose={onClose} title={title}>
      {statKey === 'activeMembers' && <ActiveMembersBody members={members} />}
      {statKey === 'openIssues' && (
        <OpenIssuesBody tickets={tickets} onResolveTicket={onResolveTicket} />
      )}
      {statKey === 'pendingPermissions' && (
        <PendingPermissionsBody requests={permissionRequests} onChanged={onChanged} />
      )}
      {statKey === 'feesOutstanding' && <FeesOutstandingBody entries={feeEntries} />}
      {statKey === 'lateFinesOutstanding' && (
        <LateFinesOutstandingBody fines={fines} onChanged={onChanged} />
      )}
    </Modal>
  );
}
