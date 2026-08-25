import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Pagination, TableToolbar } from '@/components/common';
import { NoResults } from '@/components/feedback';
import { Badge, type BadgeVariant, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { usePagination } from '@/hooks';
import { formatCurrency, formatDate } from '@/lib/format';
import type { FeeStatusEntryRecord } from '@/providers/AuthProvider';

const statusBadgeVariant: Record<FeeStatusEntryRecord['status'], BadgeVariant> = {
  paid: 'success',
  due: 'warning',
  overdue: 'danger',
};

export function FeeStatus({ entries }: { entries: FeeStatusEntryRecord[] }) {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortValue, setSortValue] = useState('amount');

  const outstanding = useMemo(() => {
    const items = [...entries].filter((entry) => {
      if (statusFilter === 'all') return entry.status !== 'paid';
      if (statusFilter === 'paid') return entry.status === 'paid';
      return entry.status === statusFilter;
    });

    switch (sortValue) {
      case 'member':
        return items.sort((a, b) => a.member_name.localeCompare(b.member_name));
      case 'amount-desc':
        return items.sort((a, b) => b.amount_due - a.amount_due);
      case 'amount':
      default:
        return items.sort((a, b) => a.amount_due - b.amount_due);
    }
  }, [entries, sortValue, statusFilter]);

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(outstanding, 5);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle>{t('itHead.feeStatus.title')}</CardTitle>
        <TableToolbar
          variant="icon-only"
          filters={[
            {
              label: t('itHead.feeStatus.filters.statusLabel'),
              value: statusFilter,
              onChange: (value) => {
                setStatusFilter(value);
                setPage(1);
              },
              options: [
                { value: 'all', label: t('itHead.feeStatus.filters.all') },
                { value: 'paid', label: t('itHead.feeStatus.status.paid') },
                { value: 'due', label: t('itHead.feeStatus.filters.pending') },
                { value: 'overdue', label: t('itHead.feeStatus.status.overdue') },
              ],
            },
          ]}
          sort={{
            label: t('common.actions.sort'),
            value: sortValue,
            onChange: (value) => {
              setSortValue(value);
              setPage(1);
            },
            options: [
              { value: 'amount', label: t('itHead.feeStatus.sort.amountLowToHigh') },
              { value: 'amount-desc', label: t('itHead.feeStatus.sort.amountHighToLow') },
              { value: 'member', label: t('itHead.feeStatus.sort.memberName') },
            ],
          }}
          onReset={() => {
            setStatusFilter('all');
            setSortValue('amount');
            setPage(1);
          }}
          resetLabel={t('common.actions.reset')}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {outstanding.length === 0 ? (
          <NoResults title={t('itHead.feeStatus.empty')} />
        ) : (
          <>
            {paginatedItems.map((entry) => (
              <div
                key={entry.member_id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-foreground">{entry.member_name}</p>
                  {entry.due_date && (
                    <p className="text-xs text-muted-foreground">
                      {t('itHead.feeStatus.dueDate', { date: formatDate(entry.due_date) })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{formatCurrency(entry.amount_due)}</span>
                  <Badge variant={statusBadgeVariant[entry.status]}>
                    {t(`itHead.feeStatus.status.${entry.status}`)}
                  </Badge>
                </div>
              </div>
            ))}
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
