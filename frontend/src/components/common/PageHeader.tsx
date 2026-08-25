import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/cn';
import { usePageHeadingSlot } from '@/providers/PageHeadingProvider';

import { TopBarHeading } from './TopBarHeading';

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  const headingSlot = usePageHeadingSlot();

  // Inside the app shell the heading belongs in the TopBar, so the card collapses to just
  // its actions (which stay with the page — they're page controls, not chrome). Outside it
  // — public pages, which have no TopBar — the original card still renders.
  if (headingSlot?.slot) {
    return (
      <>
        {createPortal(<TopBarHeading title={title} description={description} />, headingSlot.slot)}
        {actions && (
          <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </>
    );
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-border bg-surface p-6',
        className,
      )}
    >
      <div aria-hidden className="blob -right-16 -top-16 z-0 size-64 opacity-[0.10] blur-2xl" />
      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          {description && <p className="mt-1 text-muted-foreground">{description}</p>}
        </div>
        {actions && (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
