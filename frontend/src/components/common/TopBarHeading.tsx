import type { ReactNode } from 'react';

export interface TopBarHeadingProps {
  title: ReactNode;
  description?: ReactNode;
}

/**
 * The compact form a page heading takes once it sits in the 4rem TopBar: text-base rather
 * than text-2xl, and both lines truncated so a long title or description can't push the
 * bell/language/theme controls off the right edge. Still an h1 — moving the heading up
 * shouldn't cost the page its document outline.
 */
export function TopBarHeading({ title, description }: TopBarHeadingProps) {
  return (
    <div className="flex min-w-0 flex-col justify-center">
      <h1 className="truncate text-base font-semibold leading-tight text-foreground">{title}</h1>
      {description && (
        <p className="hidden truncate text-xs leading-tight text-muted-foreground sm:block">
          {description}
        </p>
      )}
    </div>
  );
}
