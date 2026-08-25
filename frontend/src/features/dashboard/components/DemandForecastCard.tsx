import { useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Pagination, TableToolbar } from '@/components/common';
import { EmptyState } from '@/components/feedback';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { usePagination } from '@/hooks';
import type { DemandForecastItem } from '@/providers/AuthProvider';

export function DemandForecastCard({ items }: { items: DemandForecastItem[] }) {
  const { t } = useTranslation();
  const [demandFilter, setDemandFilter] = useState('all');
  const [sortValue, setSortValue] = useState('demand-desc');

  const filteredItems = useMemo(() => {
    let result = [...items];
    if (demandFilter !== 'all') {
      result = result.filter((item) => item.demand_level === demandFilter);
    }
    switch (sortValue) {
      case 'title-asc':
        return result.sort((a, b) => a.title.localeCompare(b.title));
      case 'author-asc':
        return result.sort((a, b) => a.author.localeCompare(b.author));
      case 'demand-asc':
        return result.sort((a) => (a.demand_level === 'high' ? 1 : -1));
      case 'demand-desc':
      default:
        return result.sort((a) => (a.demand_level === 'high' ? -1 : 1));
    }
  }, [items, demandFilter, sortValue]);

  const { page, setPage, totalPages, paginatedItems } = usePagination(filteredItems, 4);

  return (
    <Card className="flex flex-col justify-between">
      <div>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
          <div>
            <CardTitle>{t('managerDashboard.demandForecast.title')}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {t('managerDashboard.demandForecast.subtitle')}
            </p>
          </div>
          <TableToolbar
            variant="icon-only"
            filters={[
              {
                label: t('common.filters.demandLevel', { defaultValue: 'Demand Level' }),
                value: demandFilter,
                onChange: setDemandFilter,
                options: [
                  { value: 'all', label: t('common.filters.all', { defaultValue: 'All Levels' }) },
                  {
                    value: 'high',
                    label: t('managerDashboard.demandForecast.level.high', { defaultValue: 'High' }),
                  },
                  {
                    value: 'medium',
                    label: t('managerDashboard.demandForecast.level.medium', { defaultValue: 'Medium' }),
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
                  value: 'demand-desc',
                  label: t('common.sort.highestDemand', { defaultValue: 'Highest Demand' }),
                },
                {
                  value: 'demand-asc',
                  label: t('common.sort.lowestDemand', { defaultValue: 'Lowest Demand' }),
                },
                {
                  value: 'title-asc',
                  label: t('common.sort.titleAsc', { defaultValue: 'Book Title A-Z' }),
                },
                {
                  value: 'author-asc',
                  label: t('common.sort.authorAsc', { defaultValue: 'Author A-Z' }),
                },
              ],
            }}
            onReset={() => {
              setDemandFilter('all');
              setSortValue('demand-desc');
            }}
          />
        </CardHeader>
        <CardContent>
          {filteredItems.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title={t('managerDashboard.demandForecast.emptyTitle')}
              description={t('managerDashboard.demandForecast.emptyDescription')}
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {paginatedItems.map((item) => {
                const formattedReason = item.reason
                  .replace(/loan\(s\)\/reservation\(s\)/g, 'loans & reservations')
                  .replace(/loan\(s\)/g, 'loans')
                  .replace(/reservation\(s\)/g, 'reservations')
                  .replace(/day\(s\)/g, 'days');

                return (
                  <li
                    key={item.book_id}
                    className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground leading-snug">{item.title}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {item.author} <span className="mx-1 text-muted-foreground/40">•</span> <span className="font-medium text-foreground/80">{item.category}</span>
                        </p>
                      </div>
                      <Badge
                        variant={item.demand_level === 'high' ? 'danger' : 'warning'}
                        className="shrink-0 px-2.5 py-0.5 text-xs font-semibold"
                      >
                        {t(`managerDashboard.demandForecast.level.${item.demand_level}`)}
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
