import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

interface MarqueeProps {
  children: ReactNode[];
  reverse?: boolean;
  duration?: number;
  gap?: number;
}

export function Marquee({ children, reverse = false, duration = 25, gap = 16 }: MarqueeProps) {
  const prefersReducedMotion = useReducedMotion();
  const items = prefersReducedMotion ? children : [...children, ...children];

  return (
    <div
      data-overflow-viewport="marquee"
      className="overflow-hidden"
      style={{
        maskImage: 'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
        WebkitMaskImage:
          'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
      }}
    >
      <motion.div
        className="flex"
        style={{ gap }}
        animate={prefersReducedMotion ? undefined : { x: reverse ? ['-50%', '0%'] : ['0%', '-50%'] }}
        transition={{ duration, ease: 'linear', repeat: Infinity }}
      >
        {items.map((child, index) => (
          <div key={index} className="shrink-0">
            {child}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
