import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { AnimatedHeading, AnimatedText, Section } from '@/components/common';
import { Button } from '@/components/ui';
import { ROUTES } from '@/constants/routes';

import { fadeUp, viewportOnce } from '../motion';

export function CTA() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Section
      ariaLabelledBy="cta-heading"
      tone="primary"
      size="3xl"
      containerClassName="flex flex-col items-center gap-6 text-center"
    >
      <AnimatedHeading id="cta-heading" color="inverted">
        {t('landing.cta.heading')}
      </AnimatedHeading>
      <AnimatedText tone="inverted" spacing={false} className="max-w-xl">
        {t('landing.cta.subheading')}
      </AnimatedText>
      <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={fadeUp}>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" variant="secondary" onClick={() => navigate(ROUTES.REGISTER)}>
            {t('landing.cta.button')}
          </Button>
        </div>
      </motion.div>
    </Section>
  );
}
