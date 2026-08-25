import type { KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';

import { Card } from '@/components/ui';
import { cn } from '@/lib/cn';

export type MemberStatTone = 'primary' | 'info' | 'success' | 'warning';

const TONE_CLASSES: Record<MemberStatTone, string> = {
  primary: 'bg-primary/10 text-primary',
  info: 'bg-info/10 text-info',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
};

export interface MemberStatCardProps {
  icon: LucideIcon;
  tone: MemberStatTone;
  value: string;
  label: string;
  subtitle?: string;
  onClick?: () => void;
  selected?: boolean;
}

// A vertical-layout sibling of StatisticCard (icon-over-text, plus an optional
// subtitle) — kept separate rather than folded into StatisticCard, which other
// dashboards rely on with its horizontal layout untouched. Shared by the member and
// manager dashboards despite the name; not worth a rename for a purely cosmetic reuse.
export function MemberStatCard({
  icon: Icon,
  tone,
  value,
  label,
  subtitle,
  onClick,
  selected,
}: MemberStatCardProps) {
  const interactive = Boolean(onClick);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!onClick) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  }

  return (
    <Card
      className={cn(
        'flex flex-col gap-3 p-4',
        interactive &&
          'cursor-pointer transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md',
        selected && 'border-primary ring-2 ring-primary/40',
      )}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? (selected ?? false) : undefined}
      onClick={onClick}
      onKeyDown={interactive ? handleKeyDown : undefined}
    >
      <span
        className={cn(
          'inline-flex size-10 shrink-0 items-center justify-center rounded-lg',
          TONE_CLASSES[tone],
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </Card>
  );
}
