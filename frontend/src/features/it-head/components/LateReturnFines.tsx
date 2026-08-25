import { BookOpen, Calendar, CheckCircle2, Clock, Mail } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Pagination, TableToolbar } from '@/components/common';
import { NoResults } from '@/components/feedback';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { usePagination } from '@/hooks';
import { getErrorMessage } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import { useAuth, type LoanRecord } from '@/providers/AuthProvider';

export function LateReturnFines({ entries, onChanged }: { entries: LoanRecord[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const { sendFineReminder, markFinePaid } = useAuth();
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortValue, setSortValue] = useState('amount');

  // /loans/fines keeps every late-return row forever (fine_paid included) so the
  // dashboard total can still be computed from it — this view is the "still owe
  // money" queue though, so a paid fine has no reason to keep taking up a row here.
  const unpaid = useMemo(() => {
    const items = [...entries].filter((entry) => !entry.fine_paid);
    const filtered = items.filter((entry) => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'unpaid') return !entry.fine_paid;
      if (statusFilter === 'paid') return entry.fine_paid;
      return true;
    });

    switch (sortValue) {
      case 'member':
        return filtered.sort((a, b) => a.member_name.localeCompare(b.member_name));
      case 'amount-desc':
        return filtered.sort((a, b) => b.fine_amount - a.fine_amount);
      case 'amount':
      default:
        return filtered.sort((a, b) => a.fine_amount - b.fine_amount);
    }
  }, [entries, sortValue, statusFilter]);

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(unpaid, 3);

  async function handleRemind(entry: LoanRecord) {
    try {
      await sendFineReminder(entry.id);
      toast.success(t('itHead.lateFines.reminderToast', { name: entry.member_name }));
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    }
  }

  async function handleMarkPaid(entry: LoanRecord) {
    try {
      await markFinePaid(entry.id);
      toast.success(t('itHead.lateFines.markedPaidToast', { name: entry.member_name }));
      onChanged();
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle>{t('itHead.lateFines.title')}</CardTitle>
        <TableToolbar
          variant="icon-only"
          filters={[
            {
              label: t('itHead.lateFines.filters.statusLabel'),
              value: statusFilter,
              onChange: (value) => {
                setStatusFilter(value);
                setPage(1);
              },
              options: [
                { value: 'all', label: t('itHead.lateFines.filters.all') },
                { value: 'unpaid', label: t('itHead.lateFines.status.unpaid') },
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
              { value: 'amount', label: t('itHead.lateFines.sort.amountLowToHigh') },
              { value: 'amount-desc', label: t('itHead.lateFines.sort.amountHighToLow') },
              { value: 'member', label: t('itHead.lateFines.sort.memberName') },
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
        {unpaid.length === 0 ? (
          <NoResults title={t('itHead.lateFines.empty')} />
        ) : (
          <>
            {paginatedItems.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5 shadow-xs transition-colors hover:border-border/80"
              >
                {/* Top Row: Book & Borrower Info + Overdue Days & Fine Amount */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <BookOpen className="size-4 shrink-0 text-primary" />
                      <h4 className="truncate font-semibold text-foreground">{entry.book_title}</h4>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t('itHead.lateFines.borrowedBy', { name: entry.member_name })}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
                      <Clock className="size-3" />
                      {t('itHead.lateFines.daysLate', { count: entry.days_late })}
                    </span>
                    <span className="text-sm font-bold text-foreground">
                      {formatCurrency(entry.fine_amount)}
                    </span>
                  </div>
                </div>

                {/* Bottom Row: Due Date + Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="size-3.5 shrink-0 text-muted-foreground/70" />
                    <span>{t('itHead.lateFines.dueDate', { date: formatDate(entry.due_date) })}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 whitespace-nowrap text-xs"
                      onClick={() => handleRemind(entry)}
                    >
                      <Mail className="size-3.5" />
                      {t('itHead.lateFines.sendReminder')}
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 gap-1.5 whitespace-nowrap text-xs"
                      onClick={() => handleMarkPaid(entry)}
                    >
                      <CheckCircle2 className="size-3.5" />
                      {t('itHead.lateFines.markPaid')}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {totalPages > 1 && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={totalItems}
                pageSize={3}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
