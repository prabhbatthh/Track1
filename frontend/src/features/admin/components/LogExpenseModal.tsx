import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button, Input, Modal, Select } from '@/components/ui';
import { getErrorMessage } from '@/lib/api';
import { useAuth, type ExpenseCategory } from '@/providers/AuthProvider';

const AMOUNT_PATTERN = /^[1-9]\d*$/;
const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'staffSalaries',
  'bookProcurement',
  'utilities',
  'marketing',
];

const expenseSchema = z.object({
  category: z.enum(['staffSalaries', 'bookProcurement', 'utilities', 'marketing']),
  amount: z.string().regex(AMOUNT_PATTERN, { message: 'Enter a whole number greater than 0' }),
});

type ExpenseFormValues = z.infer<typeof expenseSchema>;

export interface LogExpenseModalProps {
  open: boolean;
  onClose: () => void;
  /** Preset category (from the Budget & Expenses card row) — omit to let the user pick one. */
  category?: ExpenseCategory | null;
  categoryLabel?: string;
  onLogged: () => void;
}

export function LogExpenseModal({
  open,
  onClose,
  category = null,
  categoryLabel,
  onLogged,
}: LogExpenseModalProps) {
  const { t } = useTranslation();
  const { logExpense } = useAuth();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    values: { category: category ?? 'staffSalaries', amount: '' },
  });

  async function onSubmit(values: ExpenseFormValues) {
    try {
      await logExpense({ category: values.category, amount: Number(values.amount) });
      toast.success(
        t('admin.budget.logExpenseToast', {
          category: category ? categoryLabel : t(`admin.budget.categories.${values.category}`),
        }),
      );
      reset();
      onLogged();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('admin.budget.logExpense')}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        {category ? (
          <Input
            label={categoryLabel}
            inputMode="numeric"
            pattern="[0-9]*"
            error={errors.amount?.message}
            {...register('amount')}
          />
        ) : (
          <>
            <Select
              label={t('admin.budget.categoryLabel')}
              options={EXPENSE_CATEGORIES.map((value) => ({
                value,
                label: t(`admin.budget.categories.${value}`),
              }))}
              {...register('category')}
            />
            <Input
              label={t('admin.budget.amountLabel')}
              inputMode="numeric"
              pattern="[0-9]*"
              error={errors.amount?.message}
              {...register('amount')}
            />
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {t('admin.budget.logExpense')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
