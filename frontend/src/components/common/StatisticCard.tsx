import { Minus, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { Card } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface StatisticTrend {
  direction: 'up' | 'down';
  percent: number;
  /** Color the trend green/red by real-world sentiment, not just arrow direction — a drop in
   * expenses is good news. Defaults to matching direction (up = positive, down = negative). */
  sentiment?: 'positive' | 'negative' | 'neutral';
  /** Overrides the trailing "vs last month" caption — for a stat compared against a
   * different baseline (e.g. yesterday) rather than the default month-over-month one. */
  caption?: string;
  /** Overrides the leading "{percent}%" — for a trend expressed as a raw count delta
   * (e.g. "+3") rather than a percentage. `percent` still drives up/down + sentiment. */
  displayValue?: string;
}

export interface StatisticCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  trend?: StatisticTrend;
  /** Makes the card interactive (button semantics, hover state, keyboard support). */
  onClick?: () => void;
  /** Highlights the card, e.g. while its detail modal is open. */
  selected?: boolean;
  className?: string;
}

export function StatisticCard({
  icon: Icon,
  label,
  value,
  trend,
  onClick,
  selected,
  className,
}: StatisticCardProps) {
  const { t } = useTranslation();
  const sentiment = trend
    ? (trend.sentiment ?? (trend.direction === 'up' ? 'positive' : 'negative'))
    : null;
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
        // Two statistic cards share a row on narrow phones. Stack the icon above the
        // content there so long labels and currency values stay inside their column.
        'flex min-w-0 flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:gap-3.5 sm:p-5',
        interactive &&
          'cursor-pointer text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md',
        selected && 'border-primary ring-2 ring-primary/40',
        className,
      )}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? (selected ?? false) : undefined}
      onClick={onClick}
      onKeyDown={interactive ? handleKeyDown : undefined}
    >
      <span
        className={cn(
          'inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors',
          selected && 'bg-primary text-primary-foreground',
        )}
      >
        <Icon className="size-5" />
      </span>
      {/* min-w-0: without it, a long label (e.g. "Late Fines Outstanding") sets the flex
          item's minimum width to its unwrapped text width, pushing the card past its grid
          column instead of wrapping. */}
      <div className="min-w-0 max-w-full">
        <p className="break-words text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {value}
        </p>
        <p className="break-words text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {trend && (
          <p
            className={cn(
              'mt-1 flex items-center gap-1 text-xs font-medium',
              sentiment === 'neutral'
                ? 'text-muted-foreground'
                : sentiment === 'positive'
                  ? 'text-success'
                  : 'text-danger',
            )}
          >
            {sentiment === 'neutral' ? (
              <Minus className="size-3.5" aria-hidden="true" />
            ) : trend.direction === 'up' ? (
              <TrendingUp className="size-3.5" aria-hidden="true" />
            ) : (
              <TrendingDown className="size-3.5" aria-hidden="true" />
            )}
            {trend.displayValue ?? `${trend.percent}%`}
            <span className="font-normal text-muted-foreground">
              {trend.caption ?? t('common.trend.vsLastMonth')}
            </span>
          </p>
        )}
      </div>
    </Card>
  );
}
