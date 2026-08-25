import { CheckCircle2, Clock, HandCoins, XCircle, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { IconBadge, Pagination, TableToolbar } from '@/components/common';
import { Badge, Card, CardContent, CardHeader, CardTitle, type BadgeVariant } from '@/components/ui';
import { usePagination } from '@/hooks';
import { formatCurrency } from '@/lib/format';

type ActivityStatus = 'approved' | 'waived' | 'pending' | 'rejected';

interface FinancialActivityEntry {
  id: string;
  status: ActivityStatus;
  description: string;
  actor: string;
  timeAgo: string;
  amount: number;
}

// ponytail: illustrative sample data — this role has no audit-log endpoint of its own yet
// (admin's /admin/audit-log is admin-only). Swap for a real fetch once IT Head gets read
// access to that data.
const ENTRIES: FinancialActivityEntry[] = [
  { id: '1', status: 'approved', description: 'Approved ₹1,119 expense for Book Procurement', actor: 'Rohan Rao (Admin)', timeAgo: '12 hours ago', amount: 1119 },
  { id: '2', status: 'waived', description: 'Waived a ₹100 fee for Aarav Sharma', actor: 'Rohan Rao (Admin)', timeAgo: '22 hours ago', amount: 100 },
  { id: '3', status: 'approved', description: 'Approved ₹295 expense for Marketing', actor: 'Rohan Rao (Admin)', timeAgo: 'Yesterday', amount: 295 },
  { id: '4', status: 'approved', description: 'Approved ₹492 expense for Utilities & Maintenance', actor: 'Rohan Rao (Admin)', timeAgo: '2 days ago', amount: 492 },
  { id: '5', status: 'rejected', description: 'Rejected a ₹150 refund request from Dev Tiwari', actor: 'Rohan Rao (Admin)', timeAgo: '2 days ago', amount: 150 },
  { id: '6', status: 'approved', description: 'Approved ₹2,350 expense for System Upgrade', actor: 'Rohan Rao (Admin)', timeAgo: '3 days ago', amount: 2350 },
  { id: '7', status: 'pending', description: 'Pending approval for ₹680 expense for Stationery', actor: 'Rohan Rao (Admin)', timeAgo: '3 days ago', amount: 680 },
  { id: '8', status: 'approved', description: 'Approved ₹1,860 expense for Book Procurement', actor: 'Rohan Rao (Admin)', timeAgo: '4 days ago', amount: 1860 },
  { id: '9', status: 'waived', description: 'Waived a ₹250 late fee for Priya Nair', actor: 'Rohan Rao (Admin)', timeAgo: '5 days ago', amount: 250 },
  { id: '10', status: 'approved', description: 'Approved ₹3,120 expense for Technology Upgrade', actor: 'Rohan Rao (Admin)', timeAgo: '6 days ago', amount: 3120 },
  { id: '11', status: 'rejected', description: 'Rejected a ₹400 reimbursement request from Karan Mehta', actor: 'Rohan Rao (Admin)', timeAgo: '1 week ago', amount: 400 },
  { id: '12', status: 'approved', description: 'Approved ₹610 expense for Marketing', actor: 'Rohan Rao (Admin)', timeAgo: '1 week ago', amount: 610 },
];

const STATUS_ICON: Record<ActivityStatus, LucideIcon> = {
  approved: CheckCircle2,
  waived: HandCoins,
  pending: Clock,
  rejected: XCircle,
};

const STATUS_TONE: Record<ActivityStatus, 'success' | 'warning' | 'danger'> = {
  approved: 'success',
  waived: 'warning',
  pending: 'warning',
  rejected: 'danger',
};

function ActivityRow({ entry }: { entry: FinancialActivityEntry }) {
  const tone = STATUS_TONE[entry.status];

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border p-3">
      <IconBadge icon={STATUS_ICON[entry.status]} tone={tone} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-foreground">{entry.description}</p>
        <p className="text-xs text-muted-foreground">
          {entry.actor} · {entry.timeAgo}
        </p>
      </div>
      <Badge variant={tone as BadgeVariant} className="shrink-0">
        {formatCurrency(entry.amount)}
      </Badge>
    </li>
  );
}

export function FinancialActivityLog() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');

  const filteredEntries = useMemo(() => {
    const items = filter === 'all' ? ENTRIES : ENTRIES.filter((entry) => entry.status === filter);
    return sort === 'oldest' ? [...items].reverse() : items;
  }, [filter, sort]);

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(filteredEntries, 4);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle>{t('itHead.reportsPage.financialActivityLog.title')}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t('itHead.reportsPage.financialActivityLog.subtitle')}
          </p>
        </div>
        <TableToolbar
          variant="icon-only"
          filters={[
            {
              label: t('common.actions.filters'),
              value: filter,
              onChange: (value) => {
                setFilter(value);
                setPage(1);
              },
              options: [
                { value: 'all', label: t('itHead.reportsPage.financialActivityLog.status.all') },
                { value: 'approved', label: t('itHead.reportsPage.financialActivityLog.status.approved') },
                { value: 'waived', label: t('itHead.reportsPage.financialActivityLog.status.waived') },
                { value: 'pending', label: t('itHead.reportsPage.financialActivityLog.status.pending') },
                { value: 'rejected', label: t('itHead.reportsPage.financialActivityLog.status.rejected') },
              ],
            },
          ]}
          sort={{
            label: t('common.actions.sort'),
            value: sort,
            onChange: (value) => {
              setSort(value);
              setPage(1);
            },
            options: [
              { value: 'newest', label: t('itHead.reportsPage.financialActivityLog.sort.newestFirst') },
              { value: 'oldest', label: t('itHead.reportsPage.financialActivityLog.sort.oldestFirst') },
            ],
          }}
          onReset={() => {
            setFilter('all');
            setSort('newest');
            setPage(1);
          }}
          resetLabel={t('common.actions.reset')}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">

        <ul className="flex flex-col gap-2.5">
          {paginatedItems.map((entry) => (
            <ActivityRow key={entry.id} entry={entry} />
          ))}
        </ul>

        {totalPages > 1 && (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={4}
            onPageChange={setPage}
          />
        )}
      </CardContent>
    </Card>
  );
}
