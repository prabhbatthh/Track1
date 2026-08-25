import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { Container, type ContainerSize } from './Container';

export type SectionTone = 'surface' | 'secondary' | 'primary' | 'transparent';

const toneClasses: Record<SectionTone, string> = {
  surface: 'bg-surface',
  secondary: 'bg-secondary/40',
  primary: 'bg-primary',
  transparent: '',
};

// The dominant vertical rhythm shared by ~13 marketing sections — override via `spacing`.
const DEFAULT_SPACING = 'py-10 md:py-14 lg:py-16';

export interface SectionProps {
  children: ReactNode;
  id?: string;
  ariaLabelledBy?: string;
  ariaLabel?: string;
  tone?: SectionTone;
  /** Renders the `border-b border-border` idiom used as the de-facto inter-section divider. */
  divider?: boolean;
  size?: ContainerSize;
  /** Full override of the vertical padding classes (default: the standard section rhythm). */
  spacing?: string;
  className?: string;
  /** Extra classes on the inner Container (e.g. grid/flex layout per section). */
  containerClassName?: string;
  /** Decorative elements (e.g. blurred glow circles) rendered before the Container. */
  decorative?: ReactNode;
}

export function Section({
  children,
  id,
  ariaLabelledBy,
  ariaLabel,
  tone = 'transparent',
  divider = true,
  size = '6xl',
  spacing = DEFAULT_SPACING,
  className,
  containerClassName,
  decorative,
}: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={ariaLabelledBy}
      aria-label={ariaLabel}
      className={cn(divider && 'border-b border-border', toneClasses[tone], className)}
    >
      {decorative}
      <Container size={size} className={cn(spacing, containerClassName)}>
        {children}
      </Container>
    </section>
  );
}
