import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/cn';

export type LoaderSize = 'sm' | 'md' | 'lg';

export interface LoaderProps {
  size?: LoaderSize;
  className?: string;
  label?: string;
}

const sizeClasses: Record<LoaderSize, string> = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-8',
};

export function Loader({ size = 'md', className, label = 'Loading' }: LoaderProps) {
  return (
    <span role="status" aria-label={label} className="inline-flex">
      <Loader2 className={cn('animate-spin text-current', sizeClasses[size], className)} />
    </span>
  );
}
