import {
  Armchair,
  BookOpen,
  Building2,
  HelpCircle,
  IndianRupee,
  ShieldAlert,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';

import type { SupportTicketCategory } from '@/providers/AuthProvider';

// Mirrors backend/src/app/modules/support_tickets/constants.py's CATEGORIES_BY_ROLE —
// keep both in sync if the category set ever changes.
export const MEMBER_CATEGORIES: SupportTicketCategory[] = [
  'book_reservation',
  'payment',
  'seat_booking',
  'harassment',
  'offline_library',
  'other',
];

export const GUARDIAN_CATEGORIES: SupportTicketCategory[] = [
  'attendance',
  'seat_booking',
  'payment',
  'other',
];

export const CATEGORY_ICONS: Record<SupportTicketCategory, LucideIcon> = {
  book_reservation: BookOpen,
  payment: IndianRupee,
  seat_booking: Armchair,
  harassment: ShieldAlert,
  offline_library: Building2,
  attendance: UserCheck,
  other: HelpCircle,
};
