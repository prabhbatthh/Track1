import { motion } from 'framer-motion';
import { Check, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { AnimatedNumber, Divider } from '@/components/common';
import { Badge, Button, Card } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/lib/cn';
import { fadeUp, viewportOnce } from '@/lib/motion';
import { coreFeatureIds, EXTRA_FEATURES_BY_PLAN } from '@/mocks/pricing';
import { useAuth, type PricingPlan } from '@/providers/AuthProvider';

export interface PricingCardProps {
  duration: PricingPlan;
  isActive: boolean;
  index: number;
  onSelect?: () => void;
}

export function PricingCard({ duration, isActive, index, onSelect }: PricingCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const isHighlighted = duration.badge === 'mostPopular';
  const planLabel = t(`pricing.durations.${duration.plan_id}.label`);
  const ctaLabel = t('pricing.chooseCta', { plan: planLabel });
  const extraFeatureIds = EXTRA_FEATURES_BY_PLAN[duration.plan_id] ?? [];

  function handleChoosePlan() {
    if (!isAuthenticated) {
      navigate(ROUTES.LOGIN);
      return;
    }
    navigate(`${ROUTES.PAYMENT}?plan=${duration.plan_id}&label=${encodeURIComponent(planLabel)}`);
  }

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      variants={fadeUp}
      transition={{ duration: 0.4, ease: 'easeOut', delay: index * 0.08 }}
      className="h-full"
    >
      <motion.div
        animate={{ scale: isActive ? 1.03 : 1 }}
        whileHover={{ y: -6 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        className="relative h-full"
      >
        {duration.badge && (
          <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-panel">
            {t(`pricing.badges.${duration.badge}`)}
          </span>
        )}

        {/* Plain onClick, no role="button"/tabIndex — this card wraps a real,
        independently focusable "Choose plan" Button below, and a nested interactive
        control breaks WCAG 4.1.2 for keyboard/screen-reader users. onSelect only
        toggles which tier looks highlighted; it's not required to actually choose a
        plan (see handleChoosePlan, which reads `duration` from props, not `active`),
        so keyboard users lose nothing — they can go straight to the CTA button. */}
        <Card
          onClick={onSelect}
          className={cn(
            'flex h-full flex-col rounded-2xl p-6 sm:p-8',
            onSelect && 'cursor-pointer',
            isHighlighted ? 'border-primary/50 shadow-panel md:scale-105' : 'border-border',
            isActive && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
          )}
        >
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t(`pricing.durations.${duration.plan_id}.label`)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(`pricing.durations.${duration.plan_id}.suitableFor`)}
          </p>

          <div className="mt-6 flex items-baseline gap-1">
            <span className="text-xl font-semibold text-foreground">₹</span>
            <AnimatedNumber
              value={duration.price}
              className="text-4xl font-extrabold tracking-tight text-foreground"
            />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {duration.months === 1
              ? t('pricing.perMonth')
              : t('pricing.billedEvery', { months: duration.months })}
          </p>

          {duration.save_percent > 0 ? (
            <Badge variant="success" className="mt-3 w-fit">
              {t('pricing.toggle.save', { percent: duration.save_percent })}
            </Badge>
          ) : (
            <Badge variant="outline" className="mt-3 w-fit">
              {t('pricing.toggle.noDiscount')}
            </Badge>
          )}

          <ul className="mt-6 flex flex-col gap-2.5 text-sm text-foreground">
            {coreFeatureIds.map((id) => (
              <li key={id} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-success" />
                {t(`pricing.coreFeatures.${id}`)}
              </li>
            ))}
          </ul>

          {extraFeatureIds.length > 0 && (
            <Divider as="ul" className="flex flex-col gap-2.5 text-sm font-medium text-foreground">
              {extraFeatureIds.map((id) => (
                <li key={id} className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                  {t(`pricing.extraFeatures.${id}`)}
                </li>
              ))}
            </Divider>
          )}

          <Button
            onClick={handleChoosePlan}
            variant={isActive ? 'primary' : 'outline'}
            className="mt-8 w-full"
          >
            {ctaLabel}
          </Button>
        </Card>
      </motion.div>
    </motion.div>
  );
}
