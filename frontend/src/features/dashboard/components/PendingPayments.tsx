import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Pagination, TableToolbar } from '@/components/common';
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui';
import { usePagination } from '@/hooks';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import type { AppNotificationRecord } from '@/providers/AuthProvider';

export interface PendingPaymentsProps {
  payments: AppNotificationRecord[];
  onDismiss: (notificationId: string) => void;
}

// Members who'd rather pay cash at the counter than online — the manager
// collects the cash here and clears the fee/fine (see the "pay at the
// library" option on the payment page, which is what creates these).
export function PendingPayments({ payments, onDismiss }: PendingPaymentsProps) {
  const { t } = useTranslation();
  const [sortValue, setSortValue] = useState('newest');

  const filteredPayments = useMemo(() => {
    const items = [...payments];
    switch (sortValue) {
      case 'oldest':
        return items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      case 'newest':
      default:
        return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
  }, [payments, sortValue]);

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(filteredPayments, 5);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle>{t('managerDashboard.payments.title')}</CardTitle>
        <TableToolbar
          variant="icon-only"
          sort={{
            label: t('common.actions.sort'),
            value: sortValue,
            onChange: (value) => {
              setSortValue(value);
              setPage(1);
            },
            options: [
              { value: 'newest', label: t('managerDashboard.payments.sort.newestFirst') },
              { value: 'oldest', label: t('managerDashboard.payments.sort.oldestFirst') },
            ],
          }}
          onReset={() => {
            setSortValue('newest');
            setPage(1);
          }}
          resetLabel={t('common.actions.reset')}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {filteredPayments.length === 0 ? (
          <EmptyState
            title={t('managerDashboard.payments.emptyTitle')}
            description={t('managerDashboard.payments.emptyDescription')}
          />
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {paginatedItems.map((payment) => (
                <li
                  key={payment.id}
                  className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm text-foreground">{payment.message}</p>
                    <p className="text-xs text-muted-foreground">{formatRelativeTime(payment.created_at)}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => onDismiss(payment.id)}>
                    {t('managerDashboard.payments.dismissRequest', 'Dismiss request')}
                  </Button>
                </li>
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
