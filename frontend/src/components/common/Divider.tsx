import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type DividerSpacing = 'sm' | 'md' | 'lg';

const spacingClasses: Record<DividerSpacing, string> = {
  sm: 'mt-2 pt-2',
  md: 'mt-4 pt-4',
  lg: 'mt-8 pt-8',
};

export interface DividerProps {
  /** 'ul' for semantic list content (e.g. a feature list), 'div' (default) otherwise. */
  as?: 'div' | 'ul';
  spacing?: DividerSpacing;
  /** `border-border-muted` (default, most call sites) vs the plain `border-border` token. */
  muted?: boolean;
  className?: string;
  children: ReactNode;
}

// A `border-t` wrapper around trailing content — the repeated "divider row" idiom (trust
// stats under a hero, a stats/legend row, an extra-features list) rather than a standalone `<hr>`.
export function Divider({
  as = 'div',
  spacing = 'md',
  muted = true,
  className,
  children,
}: DividerProps) {
  const As = as;

  return (
    <As
      className={cn(
        'border-t',
        muted ? 'border-border-muted' : 'border-border',
        spacingClasses[spacing],
        className,
      )}
    >
      {children}
    </As>
  );
}
