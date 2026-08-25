import { AlertCircle, Clock, IndianRupee, KeyRound, Users, type LucideIcon } from 'lucide-react';

export interface ITHeadStat {
  icon: LucideIcon;
  labelKey: string;
  value: string;
}

export const itHeadStats: ITHeadStat[] = [
  { icon: Users, labelKey: 'itHead.stats.activeMembers', value: '127' },
  { icon: AlertCircle, labelKey: 'itHead.stats.openIssues', value: '6' },
  { icon: KeyRound, labelKey: 'itHead.stats.pendingPermissions', value: '3' },
  { icon: IndianRupee, labelKey: 'itHead.stats.feesOutstanding', value: '₹4,250' },
  { icon: Clock, labelKey: 'itHead.stats.lateFinesOutstanding', value: '₹610' },
];

export interface AccessEntry {
  id: string;
  name: string;
  email: string;
  role: 'member' | 'manager';
  status: 'active' | 'deactivated';
  pendingPermission?: string;
}

export const accessEntries: AccessEntry[] = [
  {
    id: 'ac1',
    name: 'Simran Kaur',
    email: 'simran.kaur@example.com',
    role: 'manager',
    status: 'active',
    pendingPermission: 'Fine waiver approval',
  },
  {
    id: 'ac2',
    name: 'Devansh Rao',
    email: 'devansh.rao@example.com',
    role: 'member',
    status: 'active',
  },
  {
    id: 'ac3',
    name: 'Meher Chawla',
    email: 'meher.chawla@example.com',
    role: 'manager',
    status: 'active',
    pendingPermission: 'Event budget approval',
  },
  {
    id: 'ac4',
    name: 'Yash Kulkarni',
    email: 'yash.kulkarni@example.com',
    role: 'member',
    status: 'deactivated',
  },
];

export type IssueCategory = 'technical' | 'account' | 'book-access' | 'other';

export interface IssueTicket {
  id: string;
  reporter: string;
  category: IssueCategory;
  summary: string;
  submittedOn: string;
  status: 'open' | 'resolved';
}

export const issueTickets: IssueTicket[] = [
  {
    id: 'it1',
    reporter: 'Ananya Iyer',
    category: 'technical',
    summary: 'QR scanner not working on the front desk kiosk',
    submittedOn: 'Jul 16, 2026',
    status: 'open',
  },
  {
    id: 'it2',
    reporter: 'Rohan Verma',
    category: 'account',
    summary: 'Cannot log in after password reset',
    submittedOn: 'Jul 15, 2026',
    status: 'open',
  },
  {
    id: 'it3',
    reporter: 'Priya Sharma',
    category: 'book-access',
    summary: 'Reserved book missing from pickup shelf',
    submittedOn: 'Jul 14, 2026',
    status: 'resolved',
  },
];

export type BookRecordType = 'lost' | 'donated' | 'purchased';

export interface BookRecordEntry {
  id: string;
  type: BookRecordType;
  title: string;
  detail: string;
  date: string;
}

export interface FeeStatusEntry {
  id: string;
  studentName: string;
  membershipPlan: string;
  amountDue: string;
  status: 'paid' | 'due' | 'overdue';
  dueDate?: string;
}

export const feeStatusEntries: FeeStatusEntry[] = [
  {
    id: 'fs1',
    studentName: 'Devansh Rao',
    membershipPlan: 'Standard Member',
    amountDue: '₹0',
    status: 'paid',
  },
  {
    id: 'fs2',
    studentName: 'Yash Kulkarni',
    membershipPlan: 'Basic Member',
    amountDue: '₹750',
    status: 'due',
    dueDate: 'Jul 25, 2026',
  },
  {
    id: 'fs3',
    studentName: 'Arjun Mehta',
    membershipPlan: 'Premium Member',
    amountDue: '₹1,500',
    status: 'overdue',
    dueDate: 'Jul 5, 2026',
  },
];

const FINE_PER_DAY = 10;

export interface LateReturnEntry {
  id: string;
  borrowerName: string;
  bookTitle: string;
  dueDate: string;
  daysLate: number;
  status: 'unpaid' | 'paid';
}

export function fineAmount(daysLate: number): string {
  return `₹${daysLate * FINE_PER_DAY}`;
}

export const lateReturnEntries: LateReturnEntry[] = [
  {
    id: 'lr1',
    borrowerName: 'Arjun Mehta',
    bookTitle: 'The Silent Patient',
    dueDate: 'Jul 8, 2026',
    daysLate: 10,
    status: 'unpaid',
  },
  {
    id: 'lr2',
    borrowerName: 'Yash Kulkarni',
    bookTitle: 'Educated: A Memoir',
    dueDate: 'Jul 12, 2026',
    daysLate: 6,
    status: 'unpaid',
  },
  {
    id: 'lr3',
    borrowerName: 'Priya Sharma',
    bookTitle: 'Sapiens: A Brief History of Humankind',
    dueDate: 'Jul 15, 2026',
    daysLate: 3,
    status: 'paid',
  },
];
