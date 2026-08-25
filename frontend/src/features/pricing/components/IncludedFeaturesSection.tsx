import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

import { IconBadge, Section, SectionHeading } from '@/components/common';
import { fadeUp, viewportOnce } from '@/lib/motion';
import { includedFeatures } from '@/mocks/pricing';

export function IncludedFeaturesSection() {
  const { t } = useTranslation();

  return (
    <Section ariaLabelledBy="included-features-heading" tone="surface">
      <SectionHeading
        id="included-features-heading"
        title={t('pricing.included.heading')}
        description={t('pricing.included.subheading')}
        wrapperClassName="mx-auto max-w-2xl text-center"
      />

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {includedFeatures.map((feature, index) => (
          <motion.div
            key={feature.id}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            variants={fadeUp}
            transition={{ duration: 0.4, ease: 'easeOut', delay: (index % 3) * 0.08 }}
            whileHover={{ y: -2 }}
            className="flex items-start gap-3 rounded-2xl border border-border p-5"
          >
            <IconBadge icon={feature.icon} size={10} />
            <div>
              <p className="font-semibold text-foreground">
                {t(`pricing.included.items.${feature.id}.title`)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(`pricing.included.items.${feature.id}.description`)}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}
