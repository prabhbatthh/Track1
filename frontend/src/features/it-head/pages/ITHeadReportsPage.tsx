import { Clock, IndianRupee, TrendingDown, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PageHeader, StatisticCard } from '@/components/common';
import { formatCurrency } from '@/lib/format';

import { ExpenseBreakdownDonut } from '../components/ExpenseBreakdownDonut';
import { FinancialActivityLog } from '../components/FinancialActivityLog';
import { FinancialInsights } from '../components/FinancialInsights';
import { FinancialTrendChart } from '../components/FinancialTrendChart';
import { ITHeadReportsList } from '../components/ITHeadReportsList';

export function ITHeadReportsPage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('itHead.reportsPage.pageTitle')}
        description={t('itHead.reportsPage.pageDescription')}
      />

      <h2 className="sr-only">{t('common.dashboardSectionsHeading')}</h2>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatisticCard
          icon={IndianRupee}
          label={t('itHead.reportsPage.kpis.totalIncome')}
          value={formatCurrency(842500)}
          trend={{ direction: 'up', percent: 12, sentiment: 'positive' }}
        />
        <StatisticCard
          icon={TrendingDown}
          label={t('itHead.reportsPage.kpis.totalExpenses')}
          value={formatCurrency(563200)}
          trend={{ direction: 'up', percent: 7, sentiment: 'negative' }}
        />
        <StatisticCard
          icon={Wallet}
          label={t('itHead.reportsPage.kpis.netBalance')}
          value={formatCurrency(279300)}
          trend={{ direction: 'up', percent: 18, sentiment: 'positive' }}
        />
        <StatisticCard
          icon={Clock}
          label={t('itHead.reportsPage.kpis.pendingApprovals')}
          value="4"
          trend={{ direction: 'down', percent: 2, sentiment: 'positive', displayValue: '-2' }}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FinancialActivityLog />
        <ITHeadReportsList />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FinancialTrendChart />
        <ExpenseBreakdownDonut />
      </div>

      <FinancialInsights />
    </div>
  );
}
