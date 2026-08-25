import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ReviewCard, Section, SectionHeading } from '@/components/common';
import { testimonials } from '@/mocks/landing';
import { useAuth, type LibraryReviewRecord } from '@/providers/AuthProvider';
import { useActiveSection } from '@/providers/ActiveSectionProvider';

import { Marquee } from './Marquee';

const SECTION_ID = 'testimonials';

export function Testimonials() {
  const { t } = useTranslation();
  const { setActiveSection } = useActiveSection();
  const { getApprovedLibraryReviews } = useAuth();
  const [reviewsList, setReviewsList] = useState<LibraryReviewRecord[]>([]);

  useEffect(() => {
    getApprovedLibraryReviews()
      .then(setReviewsList)
      .catch(() => setReviewsList([]));
  }, [getApprovedLibraryReviews]);

  // Marks "testimonials" as the active nav section only while it's actually visible in the
  // viewport, so the "Reviews" header link highlights on scroll — not just on the home route.
  useEffect(() => {
    const node = document.getElementById(SECTION_ID);
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => setActiveSection(entry.isIntersecting ? SECTION_ID : null),
      { threshold: 0.4 },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      setActiveSection(null);
    };
  }, [setActiveSection]);

  const displayReviews =
    reviewsList.length > 0
      ? reviewsList.map((item) => ({
          id: item.id,
          name: item.member_name,
          role: t(`auth.login.roles.${item.member_role}`, { defaultValue: item.member_role }),
          quote: item.comment,
          rating: item.rating,
        }))
      : testimonials.map((item) => ({
          id: item.id,
          name: item.name,
          role: t(`landing.testimonials.items.${item.id}.role`),
          quote: t(`landing.testimonials.items.${item.id}.quote`),
          rating: 5,
        }));

  return (
    <Section id="testimonials" ariaLabelledBy="testimonials-heading">
      <SectionHeading
        id="testimonials-heading"
        title={t('landing.testimonials.heading')}
        headingClassName="mb-8"
      />

      <Marquee gap={16} duration={30}>
        {displayReviews.map((item) => (
          <div key={item.id} className="w-72 sm:w-80">
            <ReviewCard
              name={item.name}
              role={item.role}
              quote={item.quote}
              rating={item.rating}
            />
          </div>
        ))}
      </Marquee>
    </Section>
  );
}
