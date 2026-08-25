import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { FadeUp } from './FadeUp';

export type AnimatedHeadingSize = 'section' | 'hero';
export type AnimatedHeadingColor = 'foreground' | 'inverted';

const sizeClasses: Record<AnimatedHeadingSize, string> = {
  section: 'text-3xl font-semibold',
  // Hero headings vary in exact scale per page — callers supply their own text-size/leading
  // via `className`; only the shared weight/tracking live here.
  hero: 'font-extrabold tracking-tight',
};

const colorClasses: Record<AnimatedHeadingColor, string> = {
  foreground: 'text-foreground',
  inverted: 'text-primary-foreground',
};

export interface AnimatedHeadingProps {
  id?: string;
  as?: 'h1' | 'h2';
  size?: AnimatedHeadingSize;
  color?: AnimatedHeadingColor;
  /** FadeUp stagger index (not seconds) — defaults to 0. */
  delay?: number;
  /** Trailing colored word, e.g. HowItWorks' "...how it <span>works</span>". */
  highlight?: ReactNode;
  /** Overrides the accessible name — for headings whose visible content changes (e.g. rotating words). */
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}

export function AnimatedHeading({
  id,
  as = 'h2',
  size = 'section',
  color = 'foreground',
  delay = 0,
  highlight,
  ariaLabel,
  className,
  children,
}: AnimatedHeadingProps) {
  const As = as;

  return (
    <FadeUp delay={delay}>
      <As id={id} aria-label={ariaLabel} className={cn(sizeClasses[size], colorClasses[color], className)}>
        {children}
        {highlight && (
          <>
            {' '}
            <span className="text-primary">{highlight}</span>
          </>
        )}
      </As>
    </FadeUp>
  );
}
