import {
  ArrowRight,
  BarChart3,
  BookMarked,
  PieChart,
  ShieldCheck,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { IconBadge, Pagination, TableToolbar, type IconBadgeTone } from '@/components/common';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { usePagination } from '@/hooks';
import { comingSoonToast } from '@/lib/comingSoonToast';

type ReportKey =
  | 'expenseBreakdown'
  | 'membershipGrowth'
  | 'profitAndLoss'
  | 'revenueByPlan'
  | 'bookProcurement'
  | 'accessControl';

const REPORTS: { key: ReportKey; icon: LucideIcon; tone: IconBadgeTone; lastGenerated: string; frequency: string }[] = [
  { key: 'expenseBreakdown', icon: PieChart, tone: 'primary-tint', lastGenerated: 'May 16, 2026', frequency: 'Monthly' },
  { key: 'membershipGrowth', icon: Users, tone: 'info', lastGenerated: 'May 16, 2026', frequency: 'Monthly' },
  { key: 'profitAndLoss', icon: BarChart3, tone: 'warning', lastGenerated: 'May 16, 2026', frequency: 'Monthly' },
  { key: 'revenueByPlan', icon: TrendingUp, tone: 'success', lastGenerated: 'May 16, 2026', frequency: 'Monthly' },
  { key: 'bookProcurement', icon: BookMarked, tone: 'primary-tint', lastGenerated: 'May 16, 2026', frequency: 'Monthly' },
  { key: 'accessControl', icon: ShieldCheck, tone: 'info', lastGenerated: 'May 16, 2026', frequency: 'Weekly' },
];

export function ITHeadReportsList() {
  const { t } = useTranslation();
  const [sort, setSort] = useState('name-asc');

  const sortedReports = useMemo(() => {
    const items = [...REPORTS];
    items.sort((a, b) => {
      const nameA = t(`itHead.reportsPage.reportsList.items.${a.key}.name`);
      const nameB = t(`itHead.reportsPage.reportsList.items.${b.key}.name`);
      return sort === 'name-desc' ? nameB.localeCompare(nameA) : nameA.localeCompare(nameB);
    });
    return items;
  }, [sort, t]);

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(sortedReports, 3);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle>{t('itHead.reportsPage.reportsList.title')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('itHead.reportsPage.reportsList.subtitle')}</p>
        </div>
        <TableToolbar
          variant="icon-only"
          sort={{
            label: t('common.actions.sort'),
            value: sort,
            onChange: (value) => {
              setSort(value);
              setPage(1);
            },
            options: [
              { value: 'name-asc', label: t('itHead.reportsPage.reportsList.sort.nameAsc') },
              { value: 'name-desc', label: t('itHead.reportsPage.reportsList.sort.nameDesc') },
            ],
          }}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2.5">
          {paginatedItems.map((report) => (
            <li key={report.key} className="flex items-center gap-3 rounded-lg border border-border p-3">
              <IconBadge icon={report.icon} tone={report.tone} shape="square" size={11} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {t(`itHead.reportsPage.reportsList.items.${report.key}.name`)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {t(`itHead.reportsPage.reportsList.items.${report.key}.description`)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t('itHead.reportsPage.reportsList.lastGenerated', {
                    date: report.lastGenerated,
                    frequency: report.frequency,
                  })}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 text-primary hover:text-primary"
                trailingIcon={<ArrowRight className="size-3.5" />}
                onClick={() => comingSoonToast(t(`itHead.reportsPage.reportsList.items.${report.key}.name`))}
              >
                {t('common.actions.viewReport')}
              </Button>
            </li>
          ))}
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
      </CardContent>
    </Card>
  );
}
