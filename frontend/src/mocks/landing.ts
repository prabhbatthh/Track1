import {
  Award,
  BarChart3,
  BookMarked,
  BookOpen,
  Bot,
  CalendarCheck,
  CalendarDays,
  Flame,
  Gift,
  type LucideIcon,
  MessagesSquare,
  QrCode,
  Star,
  Target,
  Trophy,
  Users,
} from 'lucide-react';

import type { IconBadgeTone } from '@/components/common';

// Display copy for everything below lives in i18n locale files (src/i18n/locales/*.json),
// keyed by `id`. These mocks hold only structural/icon data plus real-world proper nouns
// (book titles, person names) that a real backend wouldn't translate either.

export interface Statistic {
  id: string;
  icon: LucideIcon;
  value: string;
}

export const statistics: Statistic[] = [
  { id: 'booksAvailable', icon: BookOpen, value: '4,600+' },
  { id: 'members', icon: Users, value: '140+' },
  { id: 'readingClubs', icon: MessagesSquare, value: '6' },
  { id: 'eventsHosted', icon: CalendarDays, value: '52' },
  { id: 'booksBorrowed', icon: BookMarked, value: '6,800+' },
  { id: 'studySeats', icon: CalendarCheck, value: '24' },
];

export interface Feature {
  id: string;
  icon: LucideIcon;
}

export const features: Feature[] = [
  { id: 'digitalLibrary', icon: BookOpen },
  { id: 'qrBorrowing', icon: QrCode },
  { id: 'seatBooking', icon: CalendarCheck },
  { id: 'aiRecommendations', icon: Bot },
  { id: 'readingChallenges', icon: Trophy },
  { id: 'communityDiscussions', icon: MessagesSquare },
  { id: 'bookDonations', icon: Gift },
  { id: 'analyticsDashboard', icon: BarChart3 },
];

export interface HowItWorksStep {
  step: number;
  tone: IconBadgeTone;
}

export const howItWorksSteps: HowItWorksStep[] = [
  { step: 1, tone: 'primary-tint' },
  { step: 2, tone: 'success' },
  { step: 3, tone: 'info' },
  { step: 4, tone: 'warning' },
];

export interface AIRecommendedBook {
  id: string;
  title: string;
  available: boolean;
}

export const aiRecommendedBooks: AIRecommendedBook[] = [
  { id: 'atomicHabits', title: 'Atomic Habits', available: true },
  { id: 'psychologyOfMoney', title: 'The Psychology of Money', available: false },
  { id: 'ikigai', title: 'Ikigai', available: true },
];

export interface MoodRecommendation {
  id: string;
  emoji: string;
  tone: IconBadgeTone;
  books: string[];
}

export const moodRecommendations: MoodRecommendation[] = [
  {
    id: 'happy',
    emoji: '\u{1F60A}',
    tone: 'primary-tint',
    books: ['The House in the Cerulean Sea', 'Anne of Green Gables'],
  },
  {
    id: 'relaxed',
    emoji: '\u{1F60C}',
    tone: 'warning',
    books: ['Norwegian Wood', 'The Overstory'],
  },
  {
    id: 'curious',
    emoji: '\u{1F92F}',
    tone: 'success',
    books: ['Sapiens', 'A Short History of Nearly Everything'],
  },
  {
    id: 'motivated',
    emoji: '\u{1F60E}',
    tone: 'danger',
    books: ['Atomic Habits', 'Can’t Hurt Me'],
  },
  {
    id: 'studyMode',
    emoji: '\u{1F4DA}',
    tone: 'info',
    books: ['Deep Work', 'How to Read a Book'],
  },
];

export interface Achievement {
  id: string;
  icon: LucideIcon;
  /** Tailwind bg/text pair — a fixed distinct color per badge, not a semantic status. */
  colorClass: string;
}

export const achievements: Achievement[] = [
  { id: 'firstBook', icon: BookOpen, colorClass: 'bg-success/10 text-success' },
  { id: 'bookWorm', icon: BookMarked, colorClass: 'bg-warning/10 text-warning' },
  { id: 'topReader', icon: Star, colorClass: 'bg-info/10 text-info' },
  { id: 'monthlyChampion', icon: Trophy, colorClass: 'bg-primary/15 text-foreground' },
];

export interface ReadingChallengeStep {
  id: string;
  icon: LucideIcon;
}

export const readingChallengeSteps: ReadingChallengeStep[] = [
  { id: 'setGoals', icon: Target },
  { id: 'trackProgress', icon: BookOpen },
  { id: 'earnBadges', icon: Award },
];

export interface ReadingChallengeStat {
  id: string;
  icon: LucideIcon;
  value: string;
}

export const readingChallengeStats: ReadingChallengeStat[] = [
  { id: 'booksRead', icon: BookOpen, value: '24' },
  { id: 'dayStreak', icon: Flame, value: '12' },
  { id: 'pointsEarned', icon: Trophy, value: '850' },
  { id: 'badgesUnlocked', icon: Star, value: '8' },
];

export interface CommunityHighlight {
  id: string;
  icon: LucideIcon;
  tone: IconBadgeTone;
}

export const communityHighlights: CommunityHighlight[] = [
  { id: 'bookDiscussions', icon: MessagesSquare, tone: 'primary-tint' },
  { id: 'reviews', icon: Star, tone: 'warning' },
  { id: 'readingClubs', icon: Users, tone: 'info' },
  { id: 'volunteerPrograms', icon: Gift, tone: 'success' },
];

export interface Testimonial {
  id: string;
  name: string;
}

export const testimonials: Testimonial[] = [
  { id: 'priyaSharma', name: 'Priya Sharma' },
  { id: 'rahulNair', name: 'Rahul Nair' },
  { id: 'ananyaIyer', name: 'Ananya Iyer' },
  { id: 'karanMalhotra', name: 'Karan Malhotra' },
];

export interface FaqItem {
  id: string;
}

export const faqs: FaqItem[] = [
  { id: 'reservations' },
  { id: 'seatBookings' },
  { id: 'donations' },
  { id: 'aiRecommendations' },
];
