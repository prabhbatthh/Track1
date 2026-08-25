import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface ErrorStateProps {
  title?: string;
  description?: string;
  /** Optional recovery action for retryable failures. */
  onRetry?: () => void;
  className?: string;
}

// Generic error state, modeled on pages/NotFound.tsx's layout for visual consistency.
export function ErrorState({ title, description, onRetry, className }: ErrorStateProps) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        'flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center',
        className,
      )}
    >
      <AlertTriangle className="size-10 text-danger" />
      <div className="flex flex-col gap-1">
        <p className="text-xl font-semibold text-foreground">
          {title ?? t('feedback.error.title')}
        </p>
        <p className="text-muted-foreground">{description ?? t('feedback.error.description')}</p>
      </div>
      {onRetry && <Button onClick={onRetry}>{t('feedback.error.retry')}</Button>}
    </div>
  );
}
