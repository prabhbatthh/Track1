import { useTranslation } from 'react-i18next';

import { MultiSegmentPie } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';

const CATEGORIES = [
  { key: 'bookProcurement', value: 42, color: 'var(--color-primary)' },
  { key: 'operations', value: 23, color: 'var(--color-info)' },
  { key: 'marketing', value: 15, color: 'var(--color-success)' },
  { key: 'technology', value: 12, color: 'var(--color-warning)' },
  { key: 'other', value: 8, color: 'var(--color-secondary)' },
];

export function ExpenseBreakdownDonut() {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('itHead.reportsPage.expenseBreakdownChart.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <MultiSegmentPie
          ariaLabel={t('itHead.reportsPage.expenseBreakdownChart.title')}
          valueFormatter={(value) => `${value}%`}
          segments={CATEGORIES.map((category) => ({
            key: category.key,
            label: t(`itHead.reportsPage.expenseBreakdownChart.categories.${category.key}`),
            value: category.value,
            color: category.color,
          }))}
        />
      </CardContent>
    </Card>
  );
}
