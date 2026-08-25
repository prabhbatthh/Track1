import type { ReactNode } from 'react';

import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';

import { AnimatedHeading, type AnimatedHeadingColor } from './AnimatedHeading';
import { AnimatedText } from './AnimatedText';
import { FadeUp } from './FadeUp';

export interface SectionHeadingProps {
  id: string;
  /** Renders the existing `ui/Badge` eyebrow above the heading (outline variant, `w-fit`). */
  eyebrow?: ReactNode;
  title: ReactNode;
  highlight?: ReactNode;
  description?: ReactNode;
  color?: AnimatedHeadingColor;
  wrapperClassName?: string;
  headingClassName?: string;
  descriptionClassName?: string;
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  highlight,
  description,
  color = 'foreground',
  wrapperClassName,
  headingClassName,
  descriptionClassName,
}: SectionHeadingProps) {
  return (
    <div className={wrapperClassName}>
      {eyebrow && (
        <FadeUp>
          <Badge variant="outline" className="w-fit">
            {eyebrow}
          </Badge>
        </FadeUp>
      )}
      <AnimatedHeading
        id={id}
        color={color}
        highlight={highlight}
        delay={eyebrow ? 1 : 0}
        className={cn(eyebrow && 'mt-3', headingClassName)}
      >
        {title}
      </AnimatedHeading>
      {description && (
        <AnimatedText
          tone={color === 'inverted' ? 'inverted' : 'default'}
          delay={eyebrow ? 2 : 1}
          className={descriptionClassName}
        >
          {description}
        </AnimatedText>
      )}
    </div>
  );
}
