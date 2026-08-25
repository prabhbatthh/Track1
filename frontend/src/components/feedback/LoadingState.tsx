import { Loader, type LoaderSize } from '@/components/ui';
import { cn } from '@/lib/cn';

export type LoadingStateVariant = 'page' | 'section' | 'inline';

const variantClasses: Record<LoadingStateVariant, string> = {
  page: 'flex min-h-[60vh] w-full flex-1 items-center justify-center p-8',
  section: 'flex min-h-40 w-full items-center justify-center p-6',
  inline: 'inline-flex items-center',
};

const variantSize: Record<LoadingStateVariant, LoaderSize> = {
  page: 'lg',
  section: 'md',
  inline: 'sm',
};

export interface LoadingStateProps {
  variant?: LoadingStateVariant;
  label?: string;
  className?: string;
}

// Full-page (route Suspense fallback), section (a card/panel still loading), or inline
// (small, next to other content) loading indicator — all wrapping the same ui/Loader spinner.
export function LoadingState({ variant = 'section', label, className }: LoadingStateProps) {
  return (
    <div className={cn(variantClasses[variant], className)}>
      <Loader size={variantSize[variant]} label={label} />
    </div>
  );
}
