import { useTranslation } from 'react-i18next';

import { Section } from '@/components/common';
import platformPreview from '@/assets/platform-preview.png';

import { ContainerScroll } from './ContainerScroll';

export function PlatformPreview() {
  const { t } = useTranslation();

  return (
    <Section ariaLabelledBy="platform-preview-heading" containerClassName="max-w-7xl">
      <ContainerScroll
        titleComponent={
          <h2 id="platform-preview-heading" className="text-3xl font-semibold text-foreground md:text-4xl">
            {t('landing.preview.title')}
          </h2>
        }
      >
        <img
          src={platformPreview}
          alt={t('landing.preview.imgAlt')}
          className="mx-auto aspect-1635/962 w-full rounded-2xl object-cover"
          draggable={false}
        />
      </ContainerScroll>
    </Section>
  );
}
