import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface ListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** A selected-entity summary row (name/title + secondary line + a change/remove action) —
 * the shape used after picking a member or book in a search-and-select field. */
export function ListRow({ title, subtitle, action, className }: ListRowProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2',
        className,
      )}
    >
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
