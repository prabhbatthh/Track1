import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useClickOutside } from '@/hooks';
import { cn } from '@/lib/cn';
import type { ToolbarSortConfig } from './TableToolbar';

export interface FiltersMenuOption {
  value: string;
  label: string;
}

export interface FiltersMenuFilter {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FiltersMenuOption[];
}

export interface FiltersMenuProps {
  filters: FiltersMenuFilter[];
  sort?: ToolbarSortConfig;
  onReset?: () => void;
  triggerLabel?: string;
  className?: string;
  iconOnly?: boolean;
}

export function FiltersMenu({
  filters,
  sort,
  onReset,
  triggerLabel,
  className,
  iconOnly = false,
}: FiltersMenuProps) {
  const { t } = useTranslation();
  const label = triggerLabel ?? t('common.actions.filters');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useClickOutside(rootRef, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    }

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  // A filter counts as "active" once it's moved off its first (default) option.
  const activeCount =
    filters.filter((filter) => filter.options.length > 0 && filter.value !== filter.options[0].value)
      .length + (sort && sort.options.length > 0 && sort.value !== sort.options[0].value ? 1 : 0);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        title={label}
        className={cn(
          'relative flex items-center justify-center rounded-md border border-border bg-surface font-medium text-foreground transition-colors hover:bg-secondary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          iconOnly ? 'size-9 p-0' : 'h-10 gap-1.5 px-3 text-sm',
        )}
      >
        <SlidersHorizontal className="size-4" aria-hidden="true" />
        {!iconOnly && <span>{label}</span>}
        {activeCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-primary ring-2 ring-surface"
            aria-hidden="true"
          />
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={label}
          className={cn(
            'absolute z-20 mt-1.5 w-64 max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-surface p-3 shadow-panel',
            iconOnly ? 'right-0' : 'left-0',
          )}
        >
          <div className="flex flex-col gap-3">
            {filters.map((filter) => (
              <div key={filter.label} className="flex flex-col gap-1">
                <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {filter.label}
                </p>
                <div className="flex flex-col gap-0.5">
                  {filter.options.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        filter.onChange(option.value);
                      }}
                      className={cn(
                        'rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                        option.value === filter.value
                          ? 'bg-secondary font-semibold text-foreground'
                          : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {sort && (
              <div className="flex flex-col gap-1 border-t border-border pt-2">
                <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {sort.label}
                </p>
                <div className="flex flex-col gap-0.5">
                  {sort.options.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        sort.onChange(option.value);
                      }}
                      className={cn(
                        'rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                        option.value === sort.value
                          ? 'bg-secondary font-semibold text-foreground'
                          : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {onReset && activeCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  onReset();
                }}
                className="flex items-center justify-center gap-1.5 border-t border-border pt-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <RotateCcw className="size-3.5" />
                {t('common.actions.reset')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
