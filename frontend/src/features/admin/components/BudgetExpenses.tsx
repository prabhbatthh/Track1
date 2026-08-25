import { BookOpen, Megaphone, Pencil, Users, Wrench, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Badge, IconBadge, ProgressBar, type IconBadgeTone, type ProgressBarTone } from '@/components/common';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import type { BudgetCategory, ExpenseCategory } from '@/providers/AuthProvider';

export interface BudgetExpensesProps {
  categories: BudgetCategory[];
  onLogExpense: (category: ExpenseCategory) => void;
  onEditBudget?: () => void;
}

const CATEGORY_ICONS: Record<ExpenseCategory, LucideIcon> = {
  staffSalaries: Users,
  bookProcurement: BookOpen,
  utilities: Wrench,
  marketing: Megaphone,
};

type BudgetStatus = 'onTrack' | 'nearLimit' | 'overBudget';

const STATUS_TONE: Record<BudgetStatus, { icon: IconBadgeTone; bar: ProgressBarTone }> = {
  onTrack: { icon: 'primary-tint', bar: 'primary' },
  nearLimit: { icon: 'warning', bar: 'warning' },
  overBudget: { icon: 'danger', bar: 'danger' },
};

function statusFor(percent: number): BudgetStatus {
  if (percent >= 100) return 'overBudget';
  if (percent >= 80) return 'nearLimit';
  return 'onTrack';
}

export function BudgetExpenses({ categories, onLogExpense, onEditBudget }: BudgetExpensesProps) {
  const { t } = useTranslation();

  const totalBudgeted = categories.reduce((sum, category) => sum + category.budgeted, 0);
  const totalSpent = categories.reduce((sum, category) => sum + category.spent, 0);
  const overallPercent = totalBudgeted > 0 ? (totalSpent / totalBudgeted) * 100 : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle>{t('admin.budget.title')}</CardTitle>
        {onEditBudget && (
          <button
            type="button"
            onClick={onEditBudget}
            aria-label={t('admin.budget.editAllocations', 'Edit Allocations')}
            title={t('admin.budget.editAllocations', 'Edit Allocations')}
            className="inline-flex size-8 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary transition-all hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-xs"
          >
            <Pencil className="size-4" />
          </button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5 rounded-lg bg-secondary/50 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">{t('admin.budget.overallLabel')}</span>
            <span className="text-muted-foreground">
              {t('admin.budget.spentOfBudgeted', {
                spent: formatCurrency(totalSpent),
                budgeted: formatCurrency(totalBudgeted),
              })}
            </span>
          </div>
          <ProgressBar
            percent={overallPercent}
            tone={STATUS_TONE[statusFor(overallPercent)].bar}
          />
        </div>

        <div className="flex flex-col gap-4">
          {categories.map((category) => {
            const percent = category.budgeted > 0 ? (category.spent / category.budgeted) * 100 : 0;
            const status = statusFor(percent);
            const tone = STATUS_TONE[status];
            const remaining = category.budgeted - category.spent;
            const Icon = CATEGORY_ICONS[category.category];

            return (
              <div key={category.category} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-3">
                  <IconBadge icon={Icon} tone={tone.icon} size={9} shape="square" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {t(`admin.budget.categories.${category.category}`)}
                      </span>
                      {status !== 'onTrack' && (
                        <Badge variant={status === 'overBudget' ? 'danger' : 'warning'}>
                          {t(`admin.budget.status.${status}`)}
                        </Badge>
                      )}
                    </div>
                    <ProgressBar percent={percent} tone={tone.bar} className="mt-1.5" />
                  </div>
                </div>
                <div className="flex items-center justify-between pl-12 text-xs text-muted-foreground">
                  <span>
                    {t('admin.budget.spentOfBudgeted', {
                      spent: formatCurrency(category.spent),
                      budgeted: formatCurrency(category.budgeted),
                    })}
                    {' · '}
                    {remaining >= 0
                      ? t('admin.budget.remaining', { amount: formatCurrency(remaining) })
                      : t('admin.budget.overBudgetBy', { amount: formatCurrency(Math.abs(remaining)) })}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => onLogExpense(category.category)}>
                    {t('admin.budget.logExpense')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
