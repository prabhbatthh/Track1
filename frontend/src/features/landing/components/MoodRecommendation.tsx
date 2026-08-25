import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

import moodIllustration from '@/assets/mood.png';
import { Section, SectionHeading, type IconBadgeTone } from '@/components/common';
import { Card } from '@/components/ui';
import { cn } from '@/lib/cn';
import { moodRecommendations } from '@/mocks/landing';

import { fadeUp, viewportOnce } from '../motion';

const emojiClasses: Record<IconBadgeTone, string> = {
  'primary-tint': 'bg-primary/10',
  'primary-solid': 'bg-primary/10',
  success: 'bg-success/10',
  warning: 'bg-warning/10',
  info: 'bg-info/10',
  danger: 'bg-danger/10',
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

export function MoodRecommendation() {
  const { t } = useTranslation();

  return (
    <Section ariaLabelledBy="mood-heading">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
        <motion.div initial="hidden" whileInView="visible" viewport={viewportOnce} variants={fadeUp}>
          <SectionHeading
            id="mood-heading"
            title={t('landing.mood.heading')}
            description={t('landing.mood.subheading')}
            descriptionClassName="max-w-lg"
          />

          <div
            className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2"
            role="list"
            aria-label={t('landing.mood.ariaLabel')}
          >
            {moodRecommendations.map((mood) => (
              <motion.div
                key={mood.id}
                role="listitem"
                initial="hidden"
                whileInView="visible"
                viewport={viewportOnce}
                variants={fadeUp}
              >
                <Card className={cn('flex h-full flex-col gap-3 p-5', cardClasses[mood.tone])}>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-11 items-center justify-center rounded-full text-lg',
                      emojiClasses[mood.tone],
                    )}
                  >
                    {mood.emoji}
                  </span>
                  <div>
                    <p className={cn('font-semibold', titleClasses[mood.tone])}>
                      {t(`landing.mood.moods.${mood.id}`)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t(`landing.mood.captions.${mood.id}`)}
                    </p>
                  </div>
                  <ul className="mt-auto flex flex-col gap-1">
                    {mood.books.map((book) => (
                      <li
                        key={book}
                        className="truncate text-sm text-muted-foreground"
                        title={book}
                      >
                        {book}
                      </li>
                    ))}
                  </ul>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={viewportOnce}
          variants={fadeUp}
          transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
        >
          <img
            src={moodIllustration}
            alt={t('landing.mood.imgAlt')}
            className="w-full object-contain"
          />
        </motion.div>
      </div>
    </Section>
  );
}
