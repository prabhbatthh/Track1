import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AnimatedHeading, AnimatedText, FadeUp, Section } from '@/components/common';

const badgeKeys = ['noHiddenCharges', 'cancelAnytime', 'educationalDiscounts'] as const;

export function PricingHero() {
  const { t } = useTranslation();

  return (
    <Section
      ariaLabelledBy="pricing-hero-heading"
      tone="surface"
      size="3xl"
      spacing="py-20 md:py-28"
      containerClassName="text-center"
    >
      <AnimatedHeading
        as="h1"
        size="hero"
        id="pricing-hero-heading"
        className="text-4xl md:text-5xl"
      >
        {t('pricing.hero.heading')}
      </AnimatedHeading>
      <AnimatedText size="lg" spacing={false} delay={1} className="mx-auto mt-5 max-w-xl">
        {t('pricing.hero.subtitle')}
      </AnimatedText>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {badgeKeys.map((key, index) => (
          <FadeUp key={key} delay={index + 2}>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-3.5 py-1.5 text-sm font-medium text-foreground">
              <CheckCircle2 className="size-4 text-success" />
              {t(`pricing.hero.badges.${key}`)}
            </span>
          </FadeUp>
        ))}
      </div>
    </Section>
  );
}
