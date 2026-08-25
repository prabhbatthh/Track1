import {
  BookMarked,
  BookOpen,
  Calendar,
  CalendarCheck,
  Cpu,
  FileBarChart,
  History,
  LayoutDashboard,
  LifeBuoy,
  type LucideIcon,
  MessageCircle,
  Receipt,
  Settings,
  ShieldCheck,
  Star,
  Ticket,
  Trophy,
  Users,
} from 'lucide-react';

import { ROUTES } from './routes';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

// `label` holds an i18n key (translated at render time in Sidebar), not display text.
export const userNavigation: NavItem[] = [
  { label: 'nav.dashboard', path: ROUTES.DASHBOARD, icon: LayoutDashboard },
  { label: 'nav.books', path: ROUTES.BOOKS, icon: BookOpen },
  { label: 'nav.borrowHistory', path: ROUTES.BORROW_HISTORY, icon: History },
  { label: 'nav.reservations', path: ROUTES.RESERVATIONS, icon: Ticket },
  { label: 'nav.seatBooking', path: ROUTES.SEAT_BOOKING, icon: CalendarCheck },
  { label: 'nav.community', path: ROUTES.COMMUNITY, icon: MessageCircle },
  { label: 'nav.events', path: ROUTES.EVENTS, icon: Calendar },
  { label: 'nav.readingProgress', path: ROUTES.READING_PROGRESS, icon: BookMarked },
  { label: 'nav.leaderboard', path: ROUTES.LEADERBOARD, icon: Trophy },
  { label: 'nav.reviews', path: ROUTES.REVIEWS, icon: Star },
  { label: 'nav.support', path: ROUTES.SUPPORT, icon: LifeBuoy },
  { label: 'nav.settings', path: ROUTES.SETTINGS, icon: Settings },
];

export const adminOverviewNavItem: NavItem = {
  label: 'nav.adminOverview',
  path: ROUTES.ADMIN,
  icon: ShieldCheck,
};

export const adminNavigation: NavItem[] = [
  adminOverviewNavItem,
  { label: 'nav.members', path: ROUTES.ADMIN_MEMBERS, icon: Users },
  { label: 'nav.payments', path: ROUTES.ADMIN_PAYMENTS, icon: Receipt },
  { label: 'nav.community', path: ROUTES.COMMUNITY, icon: MessageCircle },
  { label: 'nav.events', path: ROUTES.EVENTS, icon: Calendar },
  { label: 'nav.leaderboard', path: ROUTES.LEADERBOARD, icon: Trophy },
  { label: 'nav.reviews', path: ROUTES.REVIEWS, icon: Star },
  { label: 'nav.support', path: ROUTES.SUPPORT, icon: LifeBuoy },
  { label: 'nav.settings', path: ROUTES.SETTINGS, icon: Settings },
];

export const managerNavigation: NavItem[] = [
  { label: 'nav.dashboard', path: ROUTES.DASHBOARD, icon: LayoutDashboard },
  { label: 'nav.books', path: ROUTES.MANAGER_BOOKS, icon: BookOpen },
  { label: 'nav.borrowHistory', path: ROUTES.MANAGER_BORROW_HISTORY, icon: History },
  { label: 'nav.community', path: ROUTES.COMMUNITY, icon: MessageCircle },
  { label: 'nav.events', path: ROUTES.EVENTS, icon: Calendar },
  { label: 'nav.leaderboard', path: ROUTES.LEADERBOARD, icon: Trophy },
  { label: 'nav.reviews', path: ROUTES.REVIEWS, icon: Star },
  { label: 'nav.support', path: ROUTES.SUPPORT, icon: LifeBuoy },
  { label: 'nav.settings', path: ROUTES.SETTINGS, icon: Settings },
];

export const itHeadOverviewNavItem: NavItem = {
  label: 'nav.itHeadOverview',
  path: ROUTES.IT_HEAD,
  icon: Cpu,
};

export const itHeadNavigation: NavItem[] = [
  itHeadOverviewNavItem,
  { label: 'nav.itHeadReports', path: ROUTES.IT_HEAD_REPORTS, icon: FileBarChart },
  { label: 'nav.community', path: ROUTES.COMMUNITY, icon: MessageCircle },
  { label: 'nav.events', path: ROUTES.EVENTS, icon: Calendar },
  { label: 'nav.leaderboard', path: ROUTES.LEADERBOARD, icon: Trophy },
  { label: 'nav.reviews', path: ROUTES.REVIEWS, icon: Star },
  { label: 'nav.support', path: ROUTES.SUPPORT, icon: LifeBuoy },
  { label: 'nav.settings', path: ROUTES.SETTINGS, icon: Settings },
];

export const guardianOverviewNavItem: NavItem = {
  label: 'nav.guardianOverview',
  path: ROUTES.GUARDIAN,
  icon: Users,
};

export const guardianNavigation: NavItem[] = [
  guardianOverviewNavItem,
  { label: 'nav.readingProgress', path: ROUTES.READING_PROGRESS, icon: BookMarked },
  { label: 'nav.support', path: ROUTES.SUPPORT, icon: LifeBuoy },
  { label: 'nav.settings', path: ROUTES.SETTINGS, icon: Settings },
];
