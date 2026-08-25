import { useEffect, useState } from 'react';

import { FadeUp, Section } from '@/components/common';
import { ErrorState } from '@/components/feedback';
import { Loader } from '@/components/ui';
import { useAuth, type PricingPlan } from '@/providers/AuthProvider';

import { DurationToggle } from './DurationToggle';
import { PricingCard } from './PricingCard';

export function PricingCardsSection() {
  const { getPricingPlans } = useAuth();
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Defaults to the "Most Popular" plan so first-time visitors see the recommended option highlighted.
  const [active, setActive] = useState('3m');

  useEffect(() => {
    let cancelled = false;
    getPricingPlans()
      .then((data) => {
        if (cancelled) return;
        setPlans(data);
      })
      .catch(() => {
        if (cancelled) return;
        setHasError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  function handleRetry() {
    setIsLoading(true);
    setHasError(false);
    setReloadKey((key) => key + 1);
  }

  return (
    <Section ariaLabel="Pricing plans" tone="secondary">
      <FadeUp>
        <div className="flex justify-center">
          <DurationToggle plans={plans} active={active} onChange={setActive} />
        </div>
      </FadeUp>

      {isLoading ? (
        <div className="mt-12 flex justify-center">
          <Loader />
        </div>
      ) : hasError ? (
        <ErrorState className="mt-12 min-h-0 py-8" onRetry={handleRetry} />
      ) : (
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4 lg:items-start">
          {plans.map((plan, index) => (
            <PricingCard
              key={plan.plan_id}
              duration={plan}
              isActive={plan.plan_id === active}
              index={index}
              onSelect={() => setActive(plan.plan_id)}
            />
          ))}
        </div>
      )}
    </Section>
  );
}
