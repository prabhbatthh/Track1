import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Section, SectionHeading } from '@/components/common';
import { cn } from '@/lib/cn';
import { pricingFaqs } from '@/mocks/pricing';

export function PricingFAQSection() {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const baseId = useId();

  function toggle(index: number) {
    setActiveIndex((current) => (current === index ? null : index));
  }

  return (
    <Section ariaLabelledBy="pricing-faq-heading" tone="surface" size="3xl">
      <SectionHeading
        id="pricing-faq-heading"
        title={t('pricing.faq.heading')}
        headingClassName="mb-8"
      />

      <ul className="m-0 flex list-none flex-col overflow-hidden rounded-xl border border-border bg-surface p-0">
        {pricingFaqs.map((faq, index) => {
          const isActive = activeIndex === index;
          const panelId = `${baseId}-panel-${index}`;
          const buttonId = `${baseId}-button-${index}`;

          return (
            <li
              key={faq.id}
              className="relative w-full border-b border-border-muted last:border-b-0"
            >
              <button
                id={buttonId}
                type="button"
                aria-expanded={isActive}
                aria-controls={panelId}
                onClick={() => toggle(index)}
                className={cn(
                  'relative m-0 flex min-h-15 w-full cursor-pointer flex-row items-center justify-start px-4',
                  'py-4 pl-14 text-left text-base outline-none transition-colors duration-200',
                  'border-l-6 md:border-l-10 md:text-lg',
                  isActive
                    ? 'border-l-primary bg-primary/5 font-semibold text-foreground'
                    : 'border-l-border-muted bg-transparent text-muted-foreground hover:border-l-primary/50 hover:bg-secondary/50 hover:text-foreground',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-normal leading-none transition-all duration-200 md:left-5 md:text-[30px]',
                    isActive ? 'text-primary md:text-[36px]' : 'text-muted-foreground',
                  )}
                >
                  {isActive ? '−' : '+'}
                </span>

                <span className="pr-8">{t(`pricing.faq.items.${faq.id}.question`)}</span>

                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute right-6 block size-2 border-r-3 border-t-3 transition-transform duration-200 ease-in-out',
                    isActive
                      ? 'rotate-[-44deg] border-primary'
                      : 'rotate-[133deg] border-muted-foreground',
                  )}
                />
              </button>

              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                className={cn(
                  'grid border-l-6 transition-all duration-300 ease-in-out md:border-l-10',
                  isActive
                    ? 'grid-rows-[1fr] border-l-primary bg-primary/5'
                    : 'grid-rows-[0fr] border-l-border-muted bg-transparent',
                )}
              >
                <div className="overflow-hidden">
                  <p className="w-full px-4 py-2 pb-6 pl-14 text-sm text-muted-foreground md:text-base">
                    {t(`pricing.faq.items.${faq.id}.answer`)}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
