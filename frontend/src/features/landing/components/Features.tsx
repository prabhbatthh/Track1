import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

import featuresIllustration from '@/assets/digital-library.png';
import { FeatureCard, Section, SectionHeading } from '@/components/common';
import { features } from '@/mocks/landing';

import { fadeUp, viewportOnce } from '../motion';

export function Features() {
  const { t } = useTranslation();

  return (
    <Section ariaLabelledBy="features-heading" tone="secondary">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={fadeUp}>
          <SectionHeading
            id="features-heading"
            title={
              <>
                {t('landing.features.headingPrefix')}{' '}
                <span className="text-primary">{t('landing.features.headingHighlight')}</span>{' '}
                {t('landing.features.headingSuffix')}
              </>
            }
            description={t('landing.features.subheading')}
            descriptionClassName="max-w-lg"
          />
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={fadeUp}
          transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
        >
          <img
            src={featuresIllustration}
            alt={t('landing.features.imgAlt')}
            className="w-full object-contain"
          />
        </motion.div>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((feature) => (
          <motion.div
            key={feature.id}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            variants={fadeUp}
            whileHover={{ y: -2 }}
          >
            <FeatureCard
              icon={feature.icon}
              title={t(`landing.features.items.${feature.id}.title`)}
              description={t(`landing.features.items.${feature.id}.description`)}
            />
          </motion.div>
        ))}
      </div>
    </Section>
  );
}
