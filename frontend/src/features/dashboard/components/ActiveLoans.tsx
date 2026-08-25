import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Pagination, TableToolbar } from '@/components/common';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui';
import { usePagination } from '@/hooks';
import { getErrorMessage } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { type LoanRecord } from '@/providers/AuthProvider';

export interface ActiveLoansProps {
  loans: LoanRecord[];
  onReturn: (id: string) => Promise<unknown>;
  onRemind: (id: string) => Promise<unknown>;
}

export function ActiveLoans({ loans, onReturn, onRemind }: ActiveLoansProps) {
  const { t } = useTranslation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortValue, setSortValue] = useState('due-date');

  const filteredLoans = useMemo(() => {
    const items = [...loans].filter((loan) => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'due-today') {
        return loan.status === 'active' && new Date(loan.due_date).toDateString() === new Date().toDateString();
      }
      if (statusFilter === 'overdue') return loan.status === 'overdue';
      if (statusFilter === 'active') return loan.status === 'active';
      return true;
    });

    switch (sortValue) {
      case 'member':
        return items.sort((a, b) => a.member_name.localeCompare(b.member_name));
      case 'book':
        return items.sort((a, b) => a.book_title.localeCompare(b.book_title));
      case 'due-date':
      default:
        return items.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
    }
  }, [loans, statusFilter, sortValue]);

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(filteredLoans, 5);

  async function handleReturn(loan: LoanRecord) {
    setBusyId(loan.id);
    try {
      await onReturn(loan.id);
      toast.success(t('managerDashboard.activeLoans.returnedToast', { name: loan.member_name }));
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemind(loan: LoanRecord) {
    setBusyId(loan.id);
    try {
      await onRemind(loan.id);
      toast.success(t('managerDashboard.activeLoans.reminderToast', { name: loan.member_name }));
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle>{t('managerDashboard.activeLoans.title')}</CardTitle>
        <TableToolbar
          variant="icon-only"
          filters={[
            {
              label: t('managerDashboard.activeLoans.filters.statusLabel'),
              value: statusFilter,
              onChange: (value) => {
                setStatusFilter(value);
                setPage(1);
              },
              options: [
                { value: 'all', label: t('managerDashboard.activeLoans.filters.all') },
                { value: 'due-today', label: t('managerDashboard.activeLoans.filters.dueToday') },
                { value: 'overdue', label: t('managerDashboard.activeLoans.filters.overdue') },
                { value: 'active', label: t('managerDashboard.activeLoans.filters.activeLoans') },
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
              { value: 'due-date', label: t('managerDashboard.activeLoans.sort.dueDate') },
              { value: 'member', label: t('managerDashboard.activeLoans.sort.memberName') },
              { value: 'book', label: t('managerDashboard.activeLoans.sort.bookTitle') },
            ],
          }}
          onReset={() => {
            setStatusFilter('all');
            setSortValue('due-date');
            setPage(1);
          }}
          resetLabel={t('common.actions.reset')}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {filteredLoans.length === 0 ? (
          <EmptyState
            title={t('managerDashboard.activeLoans.emptyTitle')}
            description={t('managerDashboard.activeLoans.emptyDescription')}
          />
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {paginatedItems.map((loan) => (
                <li
                  key={loan.id}
                  className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{loan.book_title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('managerDashboard.activeLoans.borrowedBy', { name: loan.member_name })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('managerDashboard.activeLoans.dueDate', { date: formatDate(loan.due_date) })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {loan.status === 'overdue' && !loan.fine_paid && (
                      <>
                        <Badge variant="danger">
                          {t('managerDashboard.activeLoans.daysLate', { count: loan.days_late })}
                        </Badge>
                        <span className="text-sm font-medium text-foreground">
                          {formatCurrency(loan.fine_amount)}
                        </span>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      isLoading={busyId === loan.id}
                      onClick={() => handleRemind(loan)}
                    >
                      {t('managerDashboard.activeLoans.sendReminder')}
                    </Button>
                    <Button size="sm" isLoading={busyId === loan.id} onClick={() => handleReturn(loan)}>
                      {t('managerDashboard.activeLoans.markReturned')}
                    </Button>
                  </div>
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
