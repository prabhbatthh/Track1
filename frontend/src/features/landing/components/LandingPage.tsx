import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { preferredScrollBehavior } from '@/lib/scroll';

import { Community } from './Community';
import { CTA } from './CTA';
import { FAQ } from './FAQ';
import { Features } from './Features';
import { Hero } from './Hero';
import { HowItWorks } from './HowItWorks';
import { MoodRecommendation } from './MoodRecommendation';
import { PlatformPreview } from './PlatformPreview';
import { SeatAvailability } from './SeatAvailability';
import { Testimonials } from './Testimonials';
import { Footer } from './Footer';

export function LandingPage() {
  const location = useLocation();

  useEffect(() => {
    const hash = location.hash?.slice(1);
    if (!hash) return;

    const section = document.getElementById(hash);
    if (!section) return;

    section.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' });
  }, [location.hash]);

  return (
    <>
      <Hero />
      <PlatformPreview />
      <Features />
      <HowItWorks />
      <MoodRecommendation />
      <SeatAvailability />
      <Community />
      <Testimonials />
      <FAQ />
      <CTA />
      <Footer />
    </>
  );
}
