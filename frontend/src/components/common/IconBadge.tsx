import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

export type IconBadgeShape = 'circle' | 'square';
export type IconBadgeSize = 7 | 8 | 9 | 10 | 11 | 12;
export type IconBadgeTone =
  | 'primary-tint'
  | 'primary-solid'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

const shapeClasses: Record<IconBadgeShape, string> = {
  circle: 'rounded-full',
  square: 'rounded-lg',
};

// Tailwind's scanner needs literal class strings, so sizes are a lookup map rather than an
// interpolated `size-${n}` (which would silently fail to generate the utility).
const outerSizeClasses: Record<IconBadgeSize, string> = {
  7: 'size-7',
  8: 'size-8',
  9: 'size-9',
  10: 'size-10',
  11: 'size-11',
  12: 'size-12',
};

// Matches the observed pattern: size-11/12 badges use a size-5 icon, everything smaller uses size-4.
const iconSizeClasses: Record<IconBadgeSize, string> = {
  7: 'size-4',
  8: 'size-4',
  9: 'size-4',
  10: 'size-4',
  11: 'size-5',
  12: 'size-5',
};

// Mirrors ui/Badge's `bg-{color}/10 text-{color}` tint formula so IconBadge and Badge share
// one color vocabulary.
const toneClasses: Record<IconBadgeTone, string> = {
  'primary-tint': 'bg-primary/10 text-primary',
  'primary-solid': 'bg-primary text-primary-foreground',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-info/10 text-info',
};

export interface IconBadgeProps {
  icon: LucideIcon;
  shape?: IconBadgeShape;
  size?: IconBadgeSize;
  tone?: IconBadgeTone;
  className?: string;
}

export function IconBadge({
  icon: Icon,
  shape = 'circle',
  size = 10,
  tone = 'primary-tint',
  className,
}: IconBadgeProps) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center',
        outerSizeClasses[size],
        shapeClasses[shape],
        toneClasses[tone],
        className,
      )}
    >
      <Icon className={iconSizeClasses[size]} />
    </span>
  );
}
