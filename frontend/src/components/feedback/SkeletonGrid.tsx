import { cn } from '@/lib/cn';

import { SkeletonCard } from './SkeletonCard';

export interface SkeletonGridProps {
  count?: number;
  className?: string;
}

// A grid of SkeletonCard placeholders (matches the app's common card-grid shape) for a
// collection still loading — e.g. the books grid or a dashboard's stat-card row.
export function SkeletonGrid({ count = 6, className }: SkeletonGridProps) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}
