import { Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Card, CardContent } from '@/components/ui';
import { useAuth, type LibraryReviewRecord } from '@/providers/AuthProvider';

export interface LibraryReviewCardProps {
  onOpenModal: () => void;
  /** Bumped by the parent after a successful submit, to refetch "your review". */
  refreshKey?: number;
}

export function LibraryReviewCard({ onOpenModal, refreshKey }: LibraryReviewCardProps) {
  const { t } = useTranslation();
  const { getMyLibraryReview } = useAuth();
  const [existingReview, setExistingReview] = useState<LibraryReviewRecord | null>(null);

  useEffect(() => {
    getMyLibraryReview()
      .then(setExistingReview)
      .catch(() => setExistingReview(null));
  }, [getMyLibraryReview, refreshKey]);

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-surface to-surface">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Star className="size-6 fill-primary text-primary" />
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="font-semibold text-foreground">
              {existingReview
                ? t('reviews.libraryReviewCard.existingTitle', 'Your Library Review')
                : t('reviews.libraryReviewCard.title', 'Rate Your Library Experience')}
            </h3>
            {existingReview ? (
              <div>
                <div className="flex items-center gap-1.5 text-sm text-warning">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      className={`size-3.5 ${
                        i < existingReview.rating
                          ? 'fill-warning text-warning'
                          : 'text-border fill-transparent'
                      }`}
                    />
                  ))}
                  <span className="font-medium text-foreground text-xs ml-1">
                    {existingReview.rating}.0
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">
                  &ldquo;{existingReview.comment}&rdquo;
                </p>
                {existingReview.status !== 'approved' && (
                  <p className="mt-1 text-[11px] font-medium text-warning">
                    {existingReview.status === 'pending'
                      ? t('reviews.libraryReviewCard.pending', 'Awaiting admin approval')
                      : t('reviews.libraryReviewCard.rejectedNotShown', 'Not approved for the homepage')}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground sm:text-sm">
                {t(
                  'reviews.libraryReviewCard.description',
                  "Share your thoughts about our platform! Your review will be featured in 'What Our Members Say' on our homepage.",
                )}
              </p>
            )}
          </div>
        </div>

        <Button onClick={onOpenModal} variant={existingReview ? 'outline' : 'primary'} size="sm" className="shrink-0 w-fit">
          {existingReview
            ? t('reviews.libraryReviewCard.editButton', 'Edit Review')
            : t('reviews.libraryReviewCard.button', 'Leave a Review')}
        </Button>
      </CardContent>
    </Card>
  );
}
