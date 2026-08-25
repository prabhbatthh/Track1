import { useTranslation } from 'react-i18next';

import { MultiLineTrendChart } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';

// ponytail: illustrative 6-month sample — swap for a real trend endpoint alongside the
// financial activity log once IT Head has read access to admin's financial data.
const MONTHS = [
  { label: 'Jan', income: 18000, expenses: 11000 },
  { label: 'Feb', income: 21000, expenses: 13000 },
  { label: 'Mar', income: 24000, expenses: 12000 },
  { label: 'Apr', income: 27000, expenses: 16000 },
  { label: 'May', income: 31000, expenses: 15000 },
  { label: 'Jun', income: 35000, expenses: 18000 },
];

export function FinancialTrendChart() {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('itHead.reportsPage.financialTrend.title')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('itHead.reportsPage.financialTrend.subtitle')}</p>
      </CardHeader>
      <CardContent>
        <MultiLineTrendChart
          ariaLabel={t('itHead.reportsPage.financialTrend.title')}
          axisPrefix="₹"
          data={MONTHS.map((m) => ({ label: m.label, values: { income: m.income, expenses: m.expenses } }))}
          series={[
            { key: 'income', label: t('itHead.reportsPage.financialTrend.income'), color: 'var(--color-primary)' },
            { key: 'expenses', label: t('itHead.reportsPage.financialTrend.expenses'), color: 'var(--color-warning)' },
          ]}
        />
      </CardContent>
    </Card>
  );
}
