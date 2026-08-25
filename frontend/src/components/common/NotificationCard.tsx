import {
  AlertCircle,
  Armchair,
  BellRing,
  BookMarked,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock,
  Flag,
  Gift,
  Heart,
  IndianRupee,
  KeyRound,
  LifeBuoy,
  Megaphone,
  MessageCircle,
  PackageX,
  Trophy,
  type LucideIcon,
  UploadCloud,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

export type NotificationType =
  | 'book-due'
  | 'reservation-ready'
  | 'new-book'
  | 'reading-challenge'
  | 'membership-expiry'
  | 'pending-request'
  | 'reported-comment'
  | 'low-stock'
  | 'walk-in-request'
  | 'registration-request'
  | 'payment-pending'
  | 'access-request'
  | 'issue-ticket'
  | 'fee-overdue'
  | 'book-record'
  | 'seat-available'
  | 'seat-booked'
  | 'post-comment'
  | 'post-like'
  | 'payment-received'
  | 'announcement'
  | 'support-ticket'
  | 'support-ticket-resolved'
  | 'support-ticket-reopened'
  | 'fine-reminder'
  | 'reading-digest';

export interface NotificationCardProps {
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  onMarkAsRead?: () => void;
  className?: string;
}

export const notificationTypeIcon: Record<NotificationType, LucideIcon> = {
  'book-due': BookMarked,
  'reservation-ready': BellRing,
  'new-book': Gift,
  'reading-challenge': Trophy,
  'membership-expiry': UserCheck,
  'pending-request': ClipboardList,
  'reported-comment': Flag,
  'low-stock': PackageX,
  'walk-in-request': Armchair,
  'registration-request': UserPlus,
  'payment-pending': IndianRupee,
  'access-request': KeyRound,
  'issue-ticket': AlertCircle,
  'fee-overdue': IndianRupee,
  'book-record': UploadCloud,
  'seat-available': Armchair,
  'seat-booked': Armchair,
  'post-comment': MessageCircle,
  'post-like': Heart,
  'payment-received': IndianRupee,
  announcement: Megaphone,
  'support-ticket': LifeBuoy,
  'support-ticket-resolved': CheckCircle2,
  'support-ticket-reopened': AlertCircle,
  'fine-reminder': Clock,
  'reading-digest': BookOpen,
};

export function NotificationCard({
  type,
  title,
  message,
  timestamp,
  read,
  onMarkAsRead,
  className,
}: NotificationCardProps) {
  // `type` ultimately comes from the backend's free-text Notification.type column
  // (see NotificationsPanel's `as NotificationType` cast) — not something TS can
  // actually guarantee matches this union, so fall back rather than crash on an
  // unrecognized value.
  const Icon = notificationTypeIcon[type] ?? BellRing;
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border border-border p-4',
        read ? 'bg-surface' : 'bg-primary/5',
        className,
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium text-foreground">{title}</p>
          {!read && (
            <span
              className="size-2 rounded-full bg-primary"
              aria-label={t('common.cards.notification.unread')}
            />
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        <p className="mt-1 text-xs text-muted-foreground">{timestamp}</p>
      </div>
      {!read && onMarkAsRead && (
        <Button size="sm" variant="ghost" onClick={onMarkAsRead}>
          {t('common.cards.notification.markAsRead')}
        </Button>
      )}
    </div>
  );
}
