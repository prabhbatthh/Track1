import { ArrowRight, Phone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { AnimatedHeading, AnimatedText, FadeUp, Section } from '@/components/common';
import { Button } from '@/components/ui';
import { ROUTES } from '@/constants/routes';

export function PricingCTASection() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Section
      ariaLabelledBy="pricing-cta-heading"
      tone="primary"
      divider={false}
      size="3xl"
      className="relative overflow-hidden"
      containerClassName="relative flex flex-col items-center gap-6 text-center"
      decorative={
        // .blob is tinted with --color-primary, which would vanish against this section's
        // primary background — use a plain soft white glow instead for the same "subtle
        // abstract shape" effect.
        <>
          <div
            aria-hidden
            className="absolute -right-20 -top-24 size-96 rounded-full bg-primary-foreground/10 blur-3xl"
          />
          <div
            aria-hidden
            className="absolute -left-16 bottom-0 size-72 rounded-full bg-primary-foreground/10 blur-3xl"
          />
        </>
      }
    >
      <AnimatedHeading id="pricing-cta-heading" color="inverted">
        {t('pricing.cta.heading')}
      </AnimatedHeading>
      <AnimatedText tone="inverted" spacing={false} className="max-w-xl">
        {t('pricing.cta.subheading')}
      </AnimatedText>
      <FadeUp delay={2}>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            size="lg"
            variant="secondary"
            trailingIcon={<ArrowRight className="size-4" />}
            onClick={() => navigate(ROUTES.REGISTER)}
          >
            {t('pricing.cta.primaryButton')}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
            leadingIcon={<Phone className="size-4" />}
            onClick={() => navigate(`${ROUTES.CONTACT_US}#contact-us`)}
          >
            {t('pricing.cta.secondaryButton')}
          </Button>
        </div>
      </FadeUp>
    </Section>
  );
}
