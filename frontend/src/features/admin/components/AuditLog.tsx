/* eslint-disable react-refresh/only-export-components */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Pagination, TableToolbar } from '@/components/common';
import { NoResults } from '@/components/feedback';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { usePagination } from '@/hooks';
import { formatCurrency } from '@/lib/format';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { useAuth, type AuditLogEntry } from '@/providers/AuthProvider';

export function useActionText(entry: AuditLogEntry) {
  const { t } = useTranslation();
  const { action, params } = entry;
  const amount = formatCurrency(Number(params.amount));

  switch (action) {
    case 'expenseApproved':
      return t('admin.auditLog.actions.expenseApproved', {
        amount,
        category: t(`admin.budget.categories.${params.category}`),
      });
    case 'refundIssued':
      return t('admin.auditLog.actions.refundIssued', { amount, name: params.memberName });
    case 'refundRejected':
      return t('admin.auditLog.actions.refundRejected', { amount, name: params.memberName });
    case 'feeWaived':
      return t('admin.auditLog.actions.feeWaived', { amount, name: params.memberName });
    case 'feeWaiverRejected':
      return t('admin.auditLog.actions.feeWaiverRejected', { amount, name: params.memberName });
    case 'pricingPlanUpdated':
      return t('admin.auditLog.actions.pricingPlanUpdated', {
        plan: t(`pricing.durations.${params.planId}.label`),
        amount,
      });
    case 'announcementSent':
      return t('admin.auditLog.actions.announcementSent', { count: Number(params.recipientCount) });
    case 'couponGenerated':
      return t('admin.auditLog.actions.couponGenerated', {
        code: params.code,
        percent: params.discountPercent,
        maxUses: params.maxUses,
      });
    default:
      return null;
  }
}

export function useActorText(entry: AuditLogEntry) {
  const { t } = useTranslation();
  const { userId } = useAuth();
  if (userId === entry.actor_id) return t('common.you');
  return `${entry.actor_name} (${t(`auth.login.roles.${entry.actor_role}`)})`;
}

function AuditLogItem({ entry }: { entry: AuditLogEntry }) {
  const actionText = useActionText(entry);
  const actorText = useActorText(entry);

  return (
    <li className="rounded-lg border border-border p-3 text-sm">
      <p className="text-foreground">{actionText}</p>
      <p className="text-muted-foreground">
        {actorText} · {formatRelativeTime(entry.created_at)}
      </p>
    </li>
  );
}

export function AuditLog({ entries }: { entries: AuditLogEntry[] }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');

  const filteredEntries = useMemo(() => {
    const items = [...entries].filter((entry) => {
      if (filter === 'all') return true;
      if (filter === 'credits') {
        return ['pricingPlanUpdated'].includes(entry.action);
      }
      if (filter === 'debits') {
        return ['expenseApproved'].includes(entry.action);
      }
      if (filter === 'refunds') {
        return ['refundIssued', 'refundRejected', 'feeWaived', 'feeWaiverRejected'].includes(entry.action);
      }
      return true;
    });

    switch (sort) {
      case 'oldest':
        return items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      case 'newest':
      default:
        return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
  }, [entries, filter, sort]);

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(filteredEntries, 5);

  function resetToolbar() {
    setFilter('all');
    setSort('newest');
    setPage(1);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle>{t('admin.auditLog.title')}</CardTitle>
        <TableToolbar
          variant="icon-only"
          filters={[
            {
              label: t('admin.auditLog.filters.typeLabel'),
              value: filter,
              onChange: (value) => {
                setFilter(value);
                setPage(1);
              },
              options: [
                { value: 'all', label: t('admin.auditLog.filters.typeOptions.all') },
                { value: 'credits', label: t('admin.auditLog.filters.typeOptions.credits') },
                { value: 'debits', label: t('admin.auditLog.filters.typeOptions.debits') },
                { value: 'refunds', label: t('admin.auditLog.filters.typeOptions.refunds') },
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
              { value: 'newest', label: t('admin.auditLog.sort.newestFirst') },
              { value: 'oldest', label: t('admin.auditLog.sort.oldestFirst') },
            ],
          }}
          onReset={resetToolbar}
          resetLabel={t('common.actions.reset')}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">

        {filteredEntries.length === 0 ? (
          <NoResults title={t('admin.auditLog.empty')} />
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {paginatedItems.map((entry) => (
                <AuditLogItem key={entry.id} entry={entry} />
              ))}
            </ul>
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={5}
              onPageChange={setPage}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
