import { AlertCircle, IndianRupee, KeyRound, UploadCloud, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageHeader, QuickActionsCard, StatisticCard } from '@/components/common';
import { formatCurrency } from '@/lib/format';
import {
  useAuth,
  type AdminTrend,
  type BookRecordEntry,
  type ITHeadDashboard,
  type LoanRecord,
  type MemberRecord,
  type PermissionRequestRecord,
  type SupportTicketRecord,
} from '@/providers/AuthProvider';

import { AccessByRoleCard } from '../components/AccessByRoleCard';
import { AccessControl } from '../components/AccessControl';
import { BookRecords } from '../components/BookRecords';
import { FeeCollectionsChart } from '../components/FeeCollectionsChart';
import { FeeStatus } from '../components/FeeStatus';
import { FeeStatusSummaryCard } from '../components/FeeStatusSummaryCard';
import { IssueResolution } from '../components/IssueResolution';
import { IssueResolutionChart } from '../components/IssueResolutionChart';
import { ITHeadAlertsRow } from '../components/ITHeadAlertsRow';
import { ITHeadStatModal, type ITHeadStatKey } from '../components/ITHeadStatModal';
import { LateReturnFines } from '../components/LateReturnFines';
import { LogBookChangeModal } from '../components/LogBookChangeModal';
import { ResolveTicketModal } from '../components/ResolveTicketModal';
import { SystemActivityCard } from '../components/SystemActivityCard';

const STAFF_ROLES = new Set(['member', 'manager']);

// More owed is bad news — same "up = negative" override the admin dashboard applies to
// its own expenses trend, since AdminTrend/_trend() only knows direction, not whether
// that direction is good or bad for this particular metric.
function owedSentiment(trend: AdminTrend): 'positive' | 'negative' {
  return trend.direction === 'up' ? 'negative' : 'positive';
}

export function ITHeadDashboardPage() {
  const { t } = useTranslation();
  const {
    getITHeadDashboard,
    getMembers,
    getPermissionRequests,
    getStaffSupportTickets,
    getLoanFines,
    getBookRecords,
  } = useAuth();

  const [dashboard, setDashboard] = useState<ITHeadDashboard | null>(null);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [permissionRequests, setPermissionRequests] = useState<PermissionRequestRecord[]>([]);
  const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);
  const [fines, setFines] = useState<LoanRecord[]>([]);
  const [bookRecords, setBookRecords] = useState<BookRecordEntry[]>([]);
  const [resolvingTicket, setResolvingTicket] = useState<SupportTicketRecord | null>(null);
  const [logBookChangeOpen, setLogBookChangeOpen] = useState(false);
  const [activeStat, setActiveStat] = useState<ITHeadStatKey | null>(null);

  function refreshDashboard() {
    getITHeadDashboard()
      .then(setDashboard)
      .catch(() => setDashboard(null));
  }

  function refreshAccessControl() {
    getMembers({ page_size: 100 })
      .then((data) => setMembers(data.items.filter((member) => STAFF_ROLES.has(member.role.name))))
      .catch(() => setMembers([]));
    getPermissionRequests()
      .then(setPermissionRequests)
      .catch(() => setPermissionRequests([]));
  }

  function refreshTickets() {
    getStaffSupportTickets()
      .then(setTickets)
      .catch(() => setTickets([]));
  }

  function refreshFines() {
    getLoanFines()
      .then(setFines)
      .catch(() => setFines([]));
  }

  function refreshBookRecords() {
    getBookRecords()
      .then(setBookRecords)
      .catch(() => setBookRecords([]));
  }

  useEffect(refreshDashboard, [getITHeadDashboard]);
  useEffect(refreshAccessControl, [getMembers, getPermissionRequests]);
  useEffect(refreshTickets, [getStaffSupportTickets]);
  useEffect(refreshFines, [getLoanFines]);
  useEffect(refreshBookRecords, [getBookRecords]);

  const stats = dashboard?.stats;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('itHead.pageTitle')} description={t('itHead.pageDescription')} />

      <h2 className="sr-only">{t('common.dashboardSectionsHeading')}</h2>

      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatisticCard
            icon={Users}
            label={t('itHead.stats.activeMembers')}
            value={String(stats.active_members)}
            trend={stats.active_members_trend}
            onClick={() => setActiveStat('activeMembers')}
            selected={activeStat === 'activeMembers'}
          />
          <StatisticCard
            icon={AlertCircle}
            label={t('itHead.stats.openIssues')}
            value={String(stats.open_issues)}
            trend={{
              direction: stats.open_issues_delta >= 0 ? 'up' : 'down',
              percent: Math.abs(stats.open_issues_delta),
              sentiment:
                stats.open_issues_delta === 0
                  ? 'neutral'
                  : stats.open_issues_delta > 0
                    ? 'negative'
                    : 'positive',
              displayValue:
                stats.open_issues_delta === 0
                  ? t('itHead.stats.noChange')
                  : `${stats.open_issues_delta > 0 ? '+' : ''}${stats.open_issues_delta}`,
              caption: t('itHead.stats.fromYesterday'),
            }}
            onClick={() => setActiveStat('openIssues')}
            selected={activeStat === 'openIssues'}
          />
          <StatisticCard
            icon={KeyRound}
            label={t('itHead.stats.pendingPermissions')}
            value={String(stats.pending_permissions)}
            trend={{
              direction: stats.pending_permissions_delta >= 0 ? 'up' : 'down',
              percent: Math.abs(stats.pending_permissions_delta),
              sentiment:
                stats.pending_permissions_delta === 0
                  ? 'neutral'
                  : stats.pending_permissions_delta > 0
                    ? 'negative'
                    : 'positive',
              displayValue:
                stats.pending_permissions_delta === 0
                  ? t('itHead.stats.noChange')
                  : `${stats.pending_permissions_delta > 0 ? '+' : ''}${stats.pending_permissions_delta}`,
              caption: t('itHead.stats.fromYesterday'),
            }}
            onClick={() => setActiveStat('pendingPermissions')}
            selected={activeStat === 'pendingPermissions'}
          />
          <StatisticCard
            icon={IndianRupee}
            label={t('itHead.stats.feesOutstanding')}
            value={formatCurrency(stats.fees_outstanding)}
            trend={{ ...stats.fees_outstanding_trend, sentiment: owedSentiment(stats.fees_outstanding_trend) }}
            onClick={() => setActiveStat('feesOutstanding')}
            selected={activeStat === 'feesOutstanding'}
          />
        </div>
      )}

      {dashboard && (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <FeeCollectionsChart months={dashboard.fee_collections} />
            <IssueResolutionChart months={dashboard.issue_resolution} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SystemActivityCard
              days={dashboard.system_activity}
              summary={dashboard.system_activity_summary}
            />
            <AccessByRoleCard roles={dashboard.access_by_role} />
          </div>
        </>
      )}

      <AccessControl
        members={members}
        permissionRequests={permissionRequests}
        onChanged={() => {
          refreshAccessControl();
          refreshDashboard();
        }}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <IssueResolution tickets={tickets} onResolveClick={setResolvingTicket} />
        <BookRecords records={bookRecords} />
        {dashboard && (
          <FeeStatusSummaryCard
            feesOutstanding={dashboard.stats.fees_outstanding}
            lateFinesOutstanding={dashboard.stats.late_fines_outstanding}
            feeStatus={dashboard.fee_status}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FeeStatus entries={dashboard?.fee_status ?? []} />
        <LateReturnFines
          entries={fines}
          onChanged={() => {
            refreshFines();
            refreshDashboard();
          }}
        />
      </div>

      {dashboard && <ITHeadAlertsRow alerts={dashboard.alerts} />}

      <QuickActionsCard
        actions={[
          {
            label: t('itHead.quickActions.logBookChange'),
            icon: UploadCloud,
            onClick: () => setLogBookChangeOpen(true),
          },
        ]}
      />

      <ResolveTicketModal
        ticket={resolvingTicket}
        onClose={() => setResolvingTicket(null)}
        onResolved={() => {
          refreshTickets();
          refreshDashboard();
        }}
      />

      <LogBookChangeModal
        open={logBookChangeOpen}
        onClose={() => setLogBookChangeOpen(false)}
        onLogged={refreshBookRecords}
      />

      <ITHeadStatModal
        statKey={activeStat}
        onClose={() => setActiveStat(null)}
        members={members}
        permissionRequests={permissionRequests}
        tickets={tickets}
        fines={fines}
        feeEntries={dashboard?.fee_status ?? []}
        onResolveTicket={setResolvingTicket}
        onChanged={() => {
          refreshAccessControl();
          refreshTickets();
          refreshFines();
          refreshDashboard();
        }}
      />
    </div>
  );
}
