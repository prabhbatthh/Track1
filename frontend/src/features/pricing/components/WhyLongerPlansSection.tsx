import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

import { IconBadge, Section, SectionHeading } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { fadeUp, viewportOnce } from '@/lib/motion';
import { whyLongerPlans } from '@/mocks/pricing';

export function WhyLongerPlansSection() {
  const { t } = useTranslation();

  return (
    <Section ariaLabelledBy="why-longer-heading" tone="secondary">
      <SectionHeading
        id="why-longer-heading"
        title={t('pricing.whyLonger.heading')}
        description={t('pricing.whyLonger.subheading')}
        wrapperClassName="mx-auto max-w-2xl text-center"
      />

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {whyLongerPlans.map((plan, index) => (
          <motion.div
            key={plan.id}
            initial="hidden"
            whileInView="visible"
            viewport={viewportOnce}
            variants={fadeUp}
            transition={{ duration: 0.4, ease: 'easeOut', delay: index * 0.08 }}
            whileHover={{ y: -2 }}
          >
            <Card className="h-full rounded-2xl">
              <CardHeader>
                <IconBadge icon={plan.icon} shape="square" size={11} />
                <CardTitle className="mt-3">{t(`pricing.durations.${plan.id}.label`)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {t(`pricing.whyLonger.items.${plan.id}`)}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}
