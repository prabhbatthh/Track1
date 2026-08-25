import { Pencil, Star, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Avatar, Card, CardContent, CardHeader } from '@/components/ui';
import { cn } from '@/lib/cn';

export interface ReviewCardProps {
  name: string;
  avatarUrl?: string | null;
  role: ReactNode;
  quote: string;
  rating?: number;
  images?: string[];
  className?: string;
  /** Shown as a top-right edit icon (like Google Maps) when the review is the current user's own. */
  onEdit?: () => void;
  /** IT Head-only: lets any review be removed. */
  onDelete?: () => void;
}

export function ReviewCard({
  name,
  avatarUrl,
  role,
  quote,
  rating,
  images,
  className,
  onEdit,
  onDelete,
}: ReviewCardProps) {
  const { t } = useTranslation();

  return (
    <Card className={cn('h-full', className)}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="flex items-center gap-3">
          <Avatar src={avatarUrl ?? undefined} name={name} size="md" />
          <div>
            <p className="text-sm font-semibold text-foreground">{name}</p>
            <p className="text-xs text-muted-foreground">{role}</p>
          </div>
        </div>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={t('common.cards.review.editReview')}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={t('common.cards.review.deleteReview')}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {rating != null && (
          <div
            className="flex"
            role="img"
            aria-label={t('common.cards.review.ratedOutOf5', { rating })}
          >
            {Array.from({ length: 5 }, (_, index) => (
              <Star
                key={index}
                className={cn(
                  'size-4',
                  index < rating ? 'fill-warning text-warning' : 'text-border',
                )}
              />
            ))}
          </div>
        )}
        <p className="text-sm text-muted-foreground">&ldquo;{quote}&rdquo;</p>
        {images && images.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {images.map((src, index) => (
              <img
                key={index}
                src={src}
                alt=""
                className="size-14 rounded-md border border-border object-cover"
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
