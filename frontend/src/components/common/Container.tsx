import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type ContainerSize = '3xl' | '6xl';

const sizeClasses: Record<ContainerSize, string> = {
  '3xl': 'max-w-3xl',
  '6xl': 'max-w-6xl',
};

export interface ContainerProps {
  size?: ContainerSize;
  className?: string;
  children: ReactNode;
}

export function Container({ size = '6xl', className, children }: ContainerProps) {
  return <div className={cn('mx-auto px-6', sizeClasses[size], className)}>{children}</div>;
}
