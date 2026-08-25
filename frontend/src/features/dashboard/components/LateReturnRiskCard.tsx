import { useMemo, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Pagination, TableToolbar } from '@/components/common';
import { EmptyState } from '@/components/feedback';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { usePagination } from '@/hooks';
import { formatDate } from '@/lib/format';
import type { LateReturnRiskItem } from '@/providers/AuthProvider';

const RISK_VARIANT = {
  high: 'danger',
  medium: 'warning',
  low: 'success',
} as const;

export function LateReturnRiskCard({ items }: { items: LateReturnRiskItem[] }) {
  const { t } = useTranslation();
  const [riskFilter, setRiskFilter] = useState('all');
  const [sortValue, setSortValue] = useState('risk-desc');

  const filteredItems = useMemo(() => {
    let result = [...items];
    if (riskFilter !== 'all') {
      result = result.filter((item) => item.risk_level === riskFilter);
    }
    switch (sortValue) {
      case 'book-asc':
        return result.sort((a, b) => a.book_title.localeCompare(b.book_title));
      case 'member-asc':
        return result.sort((a, b) => a.member_name.localeCompare(b.member_name));
      case 'dueDate-asc':
        return result.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
      case 'risk-asc':
        return result.sort((a, b) => a.risk_score - b.risk_score);
      case 'risk-desc':
      default:
        return result.sort((a, b) => b.risk_score - a.risk_score);
    }
  }, [items, riskFilter, sortValue]);

  const { page, setPage, totalPages, paginatedItems } = usePagination(filteredItems, 4);

  return (
    <Card className="flex flex-col justify-between">
      <div>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
          <div>
            <CardTitle>{t('managerDashboard.lateReturnRisk.title')}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {t('managerDashboard.lateReturnRisk.subtitle')}
            </p>
          </div>
          <TableToolbar
            variant="icon-only"
            filters={[
              {
                label: t('common.filters.riskLevel', { defaultValue: 'Risk Level' }),
                value: riskFilter,
                onChange: setRiskFilter,
                options: [
                  { value: 'all', label: t('common.filters.all', { defaultValue: 'All Levels' }) },
                  {
                    value: 'high',
                    label: t('managerDashboard.lateReturnRisk.levelShort.high', { defaultValue: 'High Risk' }),
                  },
                  {
                    value: 'medium',
                    label: t('managerDashboard.lateReturnRisk.levelShort.medium', { defaultValue: 'Medium Risk' }),
                  },
                  {
                    value: 'low',
                    label: t('managerDashboard.lateReturnRisk.levelShort.low', { defaultValue: 'Low Risk' }),
                  },
                ],
              },
            ]}
            sort={{
              label: t('common.sort.sortBy', { defaultValue: 'Sort By' }),
              value: sortValue,
              onChange: setSortValue,
              options: [
                {
                  value: 'risk-desc',
                  label: t('common.sort.highestRisk', { defaultValue: 'Highest Risk Score' }),
                },
                {
                  value: 'risk-asc',
                  label: t('common.sort.lowestRisk', { defaultValue: 'Lowest Risk Score' }),
                },
                {
                  value: 'dueDate-asc',
                  label: t('common.sort.dueDateSoonest', { defaultValue: 'Due Date (Soonest)' }),
                },
                {
                  value: 'book-asc',
                  label: t('common.sort.titleAsc', { defaultValue: 'Book Title A-Z' }),
                },
                {
                  value: 'member-asc',
                  label: t('common.sort.borrowerAsc', { defaultValue: 'Borrower A-Z' }),
                },
              ],
            }}
            onReset={() => {
              setRiskFilter('all');
              setSortValue('risk-desc');
            }}
          />
        </CardHeader>
        <CardContent>
          {filteredItems.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title={t('managerDashboard.lateReturnRisk.emptyTitle')}
              description={t('managerDashboard.lateReturnRisk.emptyDescription')}
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {paginatedItems.map((item) => {
                const formattedReason = item.reason
                  .replace(/loan\(s\)/g, 'loans')
                  .replace(/day\(s\)/g, 'days')
                  .replace(/;\s*already/g, ' — already');

                return (
                  <li
                    key={item.loan_id}
                    className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground leading-snug">{item.book_title}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {t('managerDashboard.lateReturnRisk.borrower', { name: item.member_name })}
                          <span className="mx-1.5 text-muted-foreground/40">•</span>
                          <span className="font-medium text-foreground/80">
                            {t('managerDashboard.lateReturnRisk.dueDate', { date: formatDate(item.due_date) })}
                          </span>
                        </p>
                      </div>
                      <Badge
                        variant={RISK_VARIANT[item.risk_level]}
                        className="shrink-0 px-2.5 py-0.5 text-xs font-semibold"
                      >
                        {t(`managerDashboard.lateReturnRisk.level.${item.risk_level}`, {
                          score: item.risk_score,
                        })}
                      </Badge>
                    </div>
                    <p className="border-t border-border/50 pt-2.5 text-xs leading-relaxed text-muted-foreground">
                      {formattedReason}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </div>
      {totalPages > 1 && (
        <div className="p-4 pt-0">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={filteredItems.length}
            pageSize={4}
          />
        </div>
      )}
    </Card>
  );
}
