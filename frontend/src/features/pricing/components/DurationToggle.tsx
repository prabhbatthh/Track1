import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { PricingPlan } from '@/providers/AuthProvider';

export interface DurationToggleProps {
  plans: PricingPlan[];
  active: string;
  onChange: (id: string) => void;
}

export function DurationToggle({ plans, active, onChange }: DurationToggleProps) {
  const { t } = useTranslation();
  const activePlan = plans.find((plan) => plan.plan_id === active);

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        role="tablist"
        aria-label={t('pricing.toggle.ariaLabel')}
        className="grid w-full max-w-72 grid-cols-2 rounded-2xl border border-border bg-secondary/60 p-1 sm:inline-flex sm:w-auto sm:max-w-none sm:rounded-full"
      >
        {plans.map((plan) => {
          const isActive = plan.plan_id === active;
          return (
            <button
              key={plan.plan_id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(plan.plan_id)}
              className={cn(
                'relative rounded-full px-3 py-2 text-sm font-medium transition-colors sm:px-5',
                isActive
                  ? 'text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="duration-toggle-pill"
                  className="absolute inset-0 rounded-full bg-primary"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative">{t(`pricing.durations.${plan.plan_id}.label`)}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {activePlan && activePlan.save_percent > 0 && (
          <motion.div
            key={activePlan.plan_id}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <Badge variant="success">
              {t('pricing.toggle.save', { percent: activePlan.save_percent })}
            </Badge>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
