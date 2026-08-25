import { motion } from 'framer-motion';

import { cn } from '@/lib/cn';

export interface DateSliderOption {
  value: string;
  label: string;
  subLabel: string;
  badge?: string;
  badgeTone?: 'success' | 'warning' | 'danger' | 'info';
}

export interface DateSliderProps {
  options: DateSliderOption[];
  active: string;
  ariaLabel: string;
  onChange: (value: string) => void;
}

// Same sliding-pill pattern as the pricing page's DurationToggle: picking a date is a
// single tap on the tab itself (no intermediate modal), so the seat matrix underneath
// updates immediately for that day at whatever hour is currently selected — the time
// picker is a separate, secondary control.
export function DateSlider({ options, active, ariaLabel, onChange }: DateSliderProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-secondary/60 p-1"
    >
      {options.map((option) => {
        const isActive = option.value === active;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative flex flex-col items-center gap-0.5 rounded-md px-3.5 py-2.5 text-sm font-medium transition-colors',
              isActive ? 'text-primary-foreground' : 'text-foreground hover:text-foreground/80',
            )}
          >
            {isActive && (
              <motion.span
                layoutId="seat-booking-date-pill"
                className="absolute inset-0 rounded-md bg-primary"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <div className="relative flex items-center gap-1.5">
              <span>{option.label}</span>
              {option.badge && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none uppercase tracking-wide',
                    isActive
                      ? 'bg-primary-foreground text-primary font-bold'
                      : option.badgeTone === 'danger'
                        ? 'bg-danger/10 text-danger'
                        : option.badgeTone === 'success'
                          ? 'bg-success/10 text-success'
                          : 'bg-primary/10 text-primary',
                  )}
                >
                  {option.badge}
                </span>
              )}
            </div>
            {option.subLabel && option.subLabel !== option.label && (
              <span
                className={cn(
                  'relative text-xs font-normal',
                  isActive ? 'text-primary-foreground/90' : 'text-muted-foreground',
                )}
              >
                {option.subLabel}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
