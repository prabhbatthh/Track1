import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Input, Modal } from '@/components/ui';
import type { BudgetCategory, ExpenseCategory } from '@/providers/AuthProvider';

export interface EditBudgetModalProps {
  open: boolean;
  onClose: () => void;
  categories: BudgetCategory[];
  onSaveAllocations: (allocations: Record<ExpenseCategory, number>) => Promise<void> | void;
}

const CATEGORIES: { key: ExpenseCategory; labelKey: string }[] = [
  { key: 'staffSalaries', labelKey: 'admin.budget.categories.staffSalaries' },
  { key: 'bookProcurement', labelKey: 'admin.budget.categories.bookProcurement' },
  { key: 'utilities', labelKey: 'admin.budget.categories.utilities' },
  { key: 'marketing', labelKey: 'admin.budget.categories.marketing' },
];

export function EditBudgetModal({
  open,
  onClose,
  categories,
  onSaveAllocations,
}: EditBudgetModalProps) {
  const { t } = useTranslation();
  const [allocations, setAllocations] = useState<Record<ExpenseCategory, number>>({
    staffSalaries: 6000,
    bookProcurement: 2500,
    utilities: 900,
    marketing: 700,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prevCategories, setPrevCategories] = useState(categories);
  const [prevOpen, setPrevOpen] = useState(open);

  if (prevCategories !== categories || prevOpen !== open) {
    setPrevCategories(categories);
    setPrevOpen(open);
    if (categories.length > 0) {
      const initial: Record<ExpenseCategory, number> = {
        staffSalaries: 6000,
        bookProcurement: 2500,
        utilities: 900,
        marketing: 700,
      };
      categories.forEach((cat) => {
        initial[cat.category] = cat.budgeted;
      });
      setAllocations(initial);
    }
  }

  function handleChange(category: ExpenseCategory, value: string) {
    const parsed = parseFloat(value);
    setAllocations((prev) => ({
      ...prev,
      [category]: isNaN(parsed) ? 0 : parsed,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSaveAllocations(allocations);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  const totalBudgeted = Object.values(allocations).reduce((sum, val) => sum + (val || 0), 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('admin.budget.editModalTitle', 'Edit Budget Allocations')}
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          {t(
            'admin.budget.editModalSubtitle',
            'Adjust monthly target allocations per category. Changes instantly update status thresholds.',
          )}
        </p>

        <div className="flex flex-col gap-3">
          {CATEGORIES.map(({ key, labelKey }) => (
            <div key={key} className="flex flex-col gap-1">
              <label htmlFor={`budget-${key}`} className="text-xs font-medium text-foreground">
                {t(labelKey)}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-muted-foreground">₹</span>
                <Input
                  id={`budget-${key}`}
                  type="number"
                  min="0"
                  step="100"
                  value={allocations[key] ?? 0}
                  onChange={(e) => handleChange(key, e.target.value)}
                  className="pl-7 text-xs"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-secondary/50 p-2.5 text-xs">
          <span className="font-medium text-foreground">
            {t('admin.budget.totalBudgeted', 'Total Monthly Budget')}
          </span>
          <span className="font-semibold text-primary">₹{totalBudgeted.toLocaleString()}</span>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            {t('common.actions.cancel', 'Cancel')}
          </Button>
          <Button type="submit" size="sm" isLoading={isSubmitting} leadingIcon={<Pencil className="size-3.5" />}>
            {t('admin.budget.saveAllocations', 'Save Allocations')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
