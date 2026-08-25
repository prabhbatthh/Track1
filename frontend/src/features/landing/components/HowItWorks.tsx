import { ArrowRight, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

import stepBorrowImage from '@/assets/step-borrow.png';
import stepReadImage from '@/assets/step-read.png';
import stepRegisterImage from '@/assets/step-register.png';
import stepSearchImage from '@/assets/step-search.png';
import { IconBadge, type IconBadgeTone, Section, SectionHeading } from '@/components/common';
import { Avatar, Card } from '@/components/ui';
import { cn } from '@/lib/cn';
import { howItWorksSteps, testimonials } from '@/mocks/landing';

import { fadeUp, viewportOnce } from '../motion';

const stepImages: Record<number, string> = {
  1: stepRegisterImage,
  2: stepSearchImage,
  3: stepBorrowImage,
  4: stepReadImage,
};

// Solid fill (number badge + connector arrow) and text/tint variants per step tone.
const solidClasses: Record<IconBadgeTone, string> = {
  'primary-tint': 'bg-primary text-primary-foreground',
  'primary-solid': 'bg-primary text-primary-foreground',
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  info: 'bg-info text-info-foreground',
  danger: 'bg-danger text-danger-foreground',
};

const titleClasses: Record<IconBadgeTone, string> = {
  'primary-tint': 'text-primary',
  'primary-solid': 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-info',
  danger: 'text-danger',
};

const cardClasses: Record<IconBadgeTone, string> = {
  'primary-tint': 'bg-primary/5 border-primary/15',
  'primary-solid': 'bg-primary/5 border-primary/15',
  success: 'bg-success/5 border-success/15',
  warning: 'bg-warning/5 border-warning/15',
  info: 'bg-info/5 border-info/15',
  danger: 'bg-danger/5 border-danger/15',
};

export function HowItWorks() {
  const { t } = useTranslation();

  return (
    <Section ariaLabelledBy="how-it-works-heading" divider={false} className="bg-background">
      <SectionHeading
        id="how-it-works-heading"
        eyebrow={t('landing.howItWorks.badge')}
        title={t('landing.howItWorks.titlePrefix')}
        highlight={t('landing.howItWorks.titleHighlight')}
        wrapperClassName="max-w-2xl"
      />

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {howItWorksSteps.map((item, index) => {
          const isLast = index === howItWorksSteps.length - 1;
          return (
            <motion.div
              key={item.step}
              initial="hidden"
              whileInView="visible"
              viewport={viewportOnce}
              variants={fadeUp}
              className="relative"
            >
              <div
                className={cn(
                  'flex h-full flex-col gap-3 rounded-2xl border p-5',
                  cardClasses[item.tone],
                )}
              >
                <span
                  className={cn(
                    'flex size-9 items-center justify-center rounded-full text-sm font-semibold',
                    solidClasses[item.tone],
                  )}
                >
                  {item.step}
                </span>
                <div>
                  <p className={cn('font-semibold', titleClasses[item.tone])}>
                    {t(`landing.howItWorks.steps.${item.step}.title`)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t(`landing.howItWorks.steps.${item.step}.description`)}
                  </p>
                </div>
                <img
                  src={stepImages[item.step]}
                  alt={t(`landing.howItWorks.imgAlt.${item.step}`)}
                  className="mt-auto w-full rounded-xl object-cover"
                />
              </div>

              {!isLast && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute -bottom-3 -right-3 z-10 hidden size-8 items-center justify-center rounded-full shadow-panel sm:flex',
                    solidClasses[item.tone],
                  )}
                >
                  <ArrowRight className="size-4" />
                </span>
              )}
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
        variants={fadeUp}
        transition={{ duration: 0.4, ease: 'easeOut', delay: 0.15 }}
      >
        <Card className="mt-8 flex flex-col items-stretch gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <IconBadge icon={Users} tone="primary-tint" size={12} />
            <div>
              <p className="font-semibold text-foreground">
                {t('landing.howItWorks.community.headingPrefix')}{' '}
                <span className="text-primary">
                  {t('landing.howItWorks.community.headingHighlight')}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                {t('landing.howItWorks.community.subheading')}
              </p>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-center gap-3 sm:flex-nowrap lg:justify-end">
            <div className="flex shrink-0 -space-x-2" role="group" aria-label="Community members">
              {testimonials.map((person) => (
                <Avatar
                  key={person.id}
                  name={person.name}
                  size="sm"
                  className="ring-2 ring-surface"
                />
              ))}
              <span className="relative flex h-8 min-w-11 items-center justify-center rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground ring-2 ring-surface">
                {t('landing.howItWorks.community.memberCount')}
              </span>
            </div>
            <p className="text-center text-sm text-muted-foreground sm:text-left">
              {t('landing.howItWorks.community.memberCaption')}
            </p>
          </div>
        </Card>
      </motion.div>
    </Section>
  );
}
