import { useEffect, useState } from 'react';

import { useAuth } from '@/providers/AuthProvider';

export interface PlanOption {
  value: string;
  label: string;
  price: number;
  months: number;
}

const MONTH_LABEL: Record<string, string> = {
  '1m': '1 Month',
  '3m': '3 Months',
  '6m': '6 Months',
  '12m': '12 Months',
};

const DEFAULT_PLAN_OPTIONS: PlanOption[] = [
  { value: '1m', label: '1 Month — ₹699', price: 699, months: 1 },
  { value: '3m', label: '3 Months — ₹1,899', price: 1899, months: 3 },
  { value: '6m', label: '6 Months — ₹3,499', price: 3499, months: 6 },
  { value: '12m', label: '12 Months — ₹6,299', price: 6299, months: 12 },
];

// ponytail: reuses the Pricing page's real, backend-seeded plan prices instead of the
// old unpriced basic/standard/premium tiers, so Payment always gets a real amount.
export function usePlanOptions(): { options: PlanOption[]; isLoading: boolean } {
  const { getPricingPlans } = useAuth();
  const [options, setOptions] = useState<PlanOption[]>(DEFAULT_PLAN_OPTIONS);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPricingPlans()
      .then((plans) => {
        if (cancelled) return;
        setOptions(
          plans.map((plan) => ({
            value: plan.plan_id,
            label: `${MONTH_LABEL[plan.plan_id] ?? plan.plan_id} — ₹${plan.price.toLocaleString('en-IN')}`,
            price: plan.price,
            months: plan.months,
          })),
        );
      })
      .catch(() => !cancelled && setOptions([]))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { options, isLoading };
}
