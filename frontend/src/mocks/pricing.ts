import {
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Calendar,
  CalendarCheck,
  CalendarDays,
  GraduationCap,
  LayoutDashboard,
  type LucideIcon,
  QrCode,
  Rocket,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';

// Display copy lives in i18n locale files (src/i18n/locales/*.json) under "pricing",
// keyed by plan id. Price/discount/badge now come from the backend-seeded PricingPlan
// table (see providers/AuthProvider's getPricingPlans) — these mocks hold only
// structural data that isn't part of "adjust pricing": which bonus features a plan
// unlocks, and icon/id references for purely decorative sections.

export type ExtraFeatureId = 'prioritySupport' | 'earlyAccess' | 'freeOnboarding';

export const EXTRA_FEATURES_BY_PLAN: Record<string, ExtraFeatureId[]> = {
  '1m': [],
  '3m': [],
  '6m': ['prioritySupport'],
  '12m': ['prioritySupport', 'earlyAccess', 'freeOnboarding'],
};

// Every plan includes this same core feature set (see pricing.coreFeatures.* in i18n).
export const coreFeatureIds = [
  'unlimitedBooks',
  'unlimitedMembers',
  'qrBorrowing',
  'seatReservation',
  'aiRecommendations',
  'readingChallenges',
  'events',
  'emailNotifications',
  'basicAnalytics',
] as const;

export interface IncludedFeature {
  id: string;
  icon: LucideIcon;
}

export const includedFeatures: IncludedFeature[] = [
  { id: 'bookManagement', icon: BookOpen },
  { id: 'memberManagement', icon: Users },
  { id: 'qrBorrowing', icon: QrCode },
  { id: 'aiRecommendations', icon: Bot },
  { id: 'seatReservation', icon: CalendarCheck },
  { id: 'eventManagement', icon: CalendarDays },
  { id: 'readingChallenges', icon: Trophy },
  { id: 'notifications', icon: Bell },
  { id: 'analytics', icon: BarChart3 },
  { id: 'multiDevice', icon: Smartphone },
  { id: 'secureAuth', icon: ShieldCheck },
  { id: 'responsiveDashboard', icon: LayoutDashboard },
];

export interface WhyLongerPlanCard {
  id: string;
  icon: LucideIcon;
}

export const whyLongerPlans: WhyLongerPlanCard[] = [
  { id: '1m', icon: Rocket },
  { id: '3m', icon: GraduationCap },
  { id: '6m', icon: Calendar },
  { id: '12m', icon: Sparkles },
];

export interface PricingFaq {
  id: string;
}

export const pricingFaqs: PricingFaq[] = [
  { id: 'upgrade' },
  { id: 'cancel' },
  { id: 'discount' },
  { id: 'support' },
  { id: 'switchLonger' },
  { id: 'freeTrial' },
];
