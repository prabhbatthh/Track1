import { BookOpen, IndianRupee, UserCheck, Users, type LucideIcon } from 'lucide-react';

export interface GuardianStat {
  icon: LucideIcon;
  labelKey: string;
  value: string;
}

// ponytail: linkedChildren is overridden with the real count wherever this is used
// (GuardianChild has no presence/loan/fine fields server-side yet) — the other three
// stay at their honest zero rather than a fabricated number.
export const guardianStats: GuardianStat[] = [
  { icon: Users, labelKey: 'guardian.stats.linkedChildren', value: '0' },
  { icon: UserCheck, labelKey: 'guardian.stats.currentlyInLibrary', value: '0' },
  { icon: BookOpen, labelKey: 'guardian.stats.booksBorrowed', value: '0' },
  { icon: IndianRupee, labelKey: 'guardian.stats.totalDues', value: '₹0' },
];

export type ChildPresenceStatus = 'in-library' | 'left';

export interface Child {
  id: string;
  name: string;
  membershipId: string;
  presenceStatus: ChildPresenceStatus;
  presenceTime: string;
  subscriptionExpiresOn: string;
  outstandingFine: string;
  /** Only set when outstandingFine is non-zero — powers the fine details modal. */
  fineReasonKey?: string;
  fineBookTitle?: string;
  fineDueDate?: string;
  fineDailyPenalty?: string;
  fineEscalatedAmount?: string;
}

export type BorrowedBookStatus = 'on-time' | 'due-soon' | 'overdue';

export interface ChildBorrowedBook {
  id: string;
  childId: string;
  title: string;
  author: string;
  dueDate: string;
  status: BorrowedBookStatus;
  fineAccrued?: string;
}

