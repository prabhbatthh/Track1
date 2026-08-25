import { IncludedFeaturesSection } from './IncludedFeaturesSection';
import { PricingCardsSection } from './PricingCardsSection';
import { PricingCTASection } from './PricingCTASection';
import { PricingFAQSection } from './PricingFAQSection';
import { PricingHero } from './PricingHero';
import { WhyLongerPlansSection } from './WhyLongerPlansSection';

export function PricingPage() {
  return (
    <>
      <PricingHero />
      <PricingCardsSection />
      <IncludedFeaturesSection />
      <WhyLongerPlansSection />
      <PricingFAQSection />
      <PricingCTASection />
    </>
  );
}
