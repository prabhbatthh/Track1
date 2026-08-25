import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { FadeUp } from './FadeUp';

export type AnimatedTextSize = 'base' | 'lg';
export type AnimatedTextTone = 'default' | 'inverted';

const variantClasses: Record<`${AnimatedTextSize}-${AnimatedTextTone}`, string> = {
  'base-default': 'text-muted-foreground',
  'lg-default': 'text-lg leading-relaxed text-muted',
  'base-inverted': 'text-primary-foreground',
  'lg-inverted': 'text-lg leading-relaxed text-primary-foreground',
};

export interface AnimatedTextProps {
  size?: AnimatedTextSize;
  tone?: AnimatedTextTone;
  /** Renders the default `mt-2` top margin — disable when a parent's flex `gap` handles spacing. */
  spacing?: boolean;
  /** FadeUp stagger index (not seconds) — defaults to 1 (the slot after a heading's 0). */
  delay?: number;
  className?: string;
  children: ReactNode;
}

export function AnimatedText({
  size = 'base',
  tone = 'default',
  spacing = true,
  delay = 1,
  className,
  children,
}: AnimatedTextProps) {
  return (
    <FadeUp delay={delay}>
      <p className={cn(spacing && 'mt-2', variantClasses[`${size}-${tone}`], className)}>
        {children}
      </p>
    </FadeUp>
  );
}
