import { ChevronDown } from 'lucide-react';
import { useRef, useState } from 'react';

import { useClickOutside } from '@/hooks';
import { cn } from '@/lib/cn';

export interface SortMenuOption {
  value: string;
  label: string;
}

export interface SortMenuProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SortMenuOption[];
  className?: string;
}

export function SortMenu({ label, value, onChange, options, className }: SortMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useClickOutside(rootRef, () => setOpen(false));

  const current = options.find((option) => option.value === value);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3',
          'text-sm font-medium text-foreground hover:bg-secondary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        )}
      >
        <span className="truncate">{current?.label ?? label}</span>
        <ChevronDown
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-150', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="absolute left-0 z-20 mt-1.5 w-56 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg border border-border bg-surface py-1.5 shadow-panel"
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={cn(
                'block w-full px-3.5 py-2 text-left text-sm',
                option.value === value
                  ? 'bg-secondary font-semibold text-foreground'
                  : 'text-foreground hover:bg-secondary/60',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
