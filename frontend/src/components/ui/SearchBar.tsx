import { Search, X } from 'lucide-react';
import type { InputHTMLAttributes, Ref } from 'react';

import { cn } from '@/lib/cn';

export interface SearchBarProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  /** Used as the input's accessible name when no explicit aria-label is passed. */
  label?: string;
  ref?: Ref<HTMLInputElement>;
}

export function SearchBar({
  ref,
  value,
  onChange,
  onClear,
  className,
  placeholder = 'Search…',
  label = 'Search',
  ...props
}: SearchBarProps) {
  return (
    <div
      className={cn(
        'flex h-11 w-full items-center gap-2.5 rounded-full border border-border bg-surface px-4',
        'transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20',
        className,
      )}
    >
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={cn(
          'w-full min-w-0 bg-transparent text-sm text-foreground outline-none',
          'placeholder:text-muted-foreground',
          '[&::-webkit-search-cancel-button]:appearance-none',
        )}
        {...props}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => (onClear ? onClear() : onChange(''))}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
