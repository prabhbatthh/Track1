import { Card } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface SkeletonCardProps {
  /** Number of skeleton text lines below the title bar. */
  lines?: number;
  className?: string;
}

// Placeholder matching Card's shape (border/radius/padding) — for a card grid still loading.
export function SkeletonCard({ lines = 2, className }: SkeletonCardProps) {
  return (
    <Card className={cn('flex flex-col gap-3 p-5', className)} aria-hidden="true">
      <div className="h-4 w-2/3 animate-pulse rounded bg-secondary" />
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className={cn(
            'h-3 animate-pulse rounded bg-secondary',
            index === lines - 1 ? 'w-1/2' : 'w-full',
          )}
        />
      ))}
    </Card>
  );
}
