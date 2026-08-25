import { Armchair, CheckCircle2, Clock, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';

export type SeatStatus = 'available' | 'reserved' | 'occupied' | 'mine' | 'booked_for_child';

export interface SeatCardProps {
  label: string;
  status: SeatStatus;
  className?: string;
  selected?: boolean;
  onSelect?: () => void;
  /** Only meaningful for status === 'reserved', 'mine', or 'booked_for_child' — shown instead of the status icon. */
  avatarUrl?: string | null;
  childName?: string | null;
  guardianName?: string | null;
}

const statusClasses: Record<SeatStatus, string> = {
  available: 'border-success/30 bg-success/10 text-success',
  reserved: 'border-warning/30 bg-warning/10 text-warning',
  occupied: 'border-danger/30 bg-danger/10 text-danger',
  // Deliberately its own color (not the amber used for "reserved by someone else") —
  // two members can end up with visually similar avatars, so the seat itself needs to
  // read as "yours" or "your child's" at a glance without the person having to inspect the avatar.
  mine: 'border-primary/50 bg-primary/10 text-primary',
  booked_for_child: 'border-primary/50 bg-primary/10 text-primary',
};

// Distinct icon shapes per status — color alone (statusClasses above) isn't a reliable
// status cue for colorblind users, so each status also gets its own icon.
const statusIcons: Record<SeatStatus, typeof Armchair> = {
  available: Armchair,
  reserved: Clock,
  occupied: X,
  mine: CheckCircle2,
  booked_for_child: CheckCircle2,
};

export function SeatCard({
  label,
  status,
  className,
  selected,
  onSelect,
  avatarUrl,
  childName,
  guardianName,
}: SeatCardProps) {
  const { t } = useTranslation();
  const [prevAvatarUrl, setPrevAvatarUrl] = useState(avatarUrl);
  const [imgError, setImgError] = useState(false);

  if (prevAvatarUrl !== avatarUrl) {
    setPrevAvatarUrl(avatarUrl);
    setImgError(false);
  }

  const statusText =
    status === 'booked_for_child'
      ? childName
        ? `Booked for ${childName}`
        : 'Booked for Child'
      : status === 'mine' && guardianName
      ? `Booked by Guardian (${guardianName})`
      : t(`landing.seatAvailability.${status}`, { defaultValue: status });
  const StatusIcon = statusIcons[status];

  const isMineOrChild = status === 'mine' || status === 'booked_for_child';
  const showAvatar = (status === 'reserved' || isMineOrChild) && Boolean(avatarUrl) && !imgError;

  const classes = cn(
    'flex flex-col items-center justify-center gap-1 rounded-lg border p-2 text-xs font-medium transition-colors min-h-[68px] sm:min-h-[74px]',
    statusClasses[status],
    isMineOrChild && 'ring-2 ring-primary/70 border-primary',
    selected && 'ring-2 ring-primary ring-offset-1',
    className,
  );

  const marker = showAvatar ? (
    <span className="relative inline-flex shrink-0 rounded-full bg-white p-0.5 shadow-xs">
      <img
        src={avatarUrl ?? ''}
        alt=""
        aria-hidden="true"
        onError={() => setImgError(true)}
        className="size-9 sm:size-10 rounded-full object-cover"
      />
      {isMineOrChild && (
        <CheckCircle2
          aria-hidden="true"
          className="absolute -bottom-1 -right-1 size-4 rounded-full bg-white text-primary fill-primary/10 stroke-[2.5]"
        />
      )}
    </span>
  ) : (
    <StatusIcon className="size-5.5 sm:size-6 shrink-0" />
  );

  if (!onSelect) {
    return (
      <div
        title={t('common.cards.seat.labelWithStatus', { label, status: statusText })}
        className={classes}
      >
        {marker}
        {!showAvatar && <span>{label}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={t('common.cards.seat.seatLabelWithStatus', { label, status: statusText })}
      onClick={onSelect}
      className={cn(classes, !selected && 'hover:opacity-80')}
    >
      {marker}
      {!showAvatar && <span>{label}</span>}
    </button>
  );
}
