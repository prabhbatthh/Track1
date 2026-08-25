import { Star } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button, Modal } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';

export interface LeaveLibraryReviewModalProps {
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}

export function LeaveLibraryReviewModal({
  open,
  onClose,
  onSubmitted,
}: LeaveLibraryReviewModalProps) {
  const { t } = useTranslation();
  const { getMyLibraryReview, submitLibraryReview } = useAuth();

  const [prevOpen, setPrevOpen] = useState(false);
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [quote, setQuote] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (open && !prevOpen) {
    setPrevOpen(true);
    setRating(5);
    setQuote('');
    setError(null);
    // ponytail: pre-fill from the member's latest submission (any status) so re-opening
    // the modal after a pending/rejected review doesn't start from a blank slate.
    getMyLibraryReview()
      .then((existing) => {
        if (existing) {
          setRating(existing.rating);
          setQuote(existing.comment);
        }
      })
      .catch(() => {});
  } else if (!open && prevOpen) {
    setPrevOpen(false);
  }

  const displayRating = hoverRating ?? rating;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!quote.trim() || quote.trim().length < 5) {
      setError(t('reviews.libraryReviewModal.errorMinLength', 'Please write a review of at least 5 characters.'));
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      await submitLibraryReview({ rating, comment: quote.trim() });

      toast.success(
        t(
          'reviews.libraryReviewModal.successToast',
          "Thank you! Your review is awaiting admin approval before it appears on the homepage.",
        ),
      );
      onSubmitted?.();
      onClose();
    } catch {
      toast.error(t('common.errors.generic', 'Something went wrong. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('reviews.libraryReviewModal.title', 'Rate & Review Our Library')}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {t(
            'reviews.libraryReviewModal.description',
            "Share your experience with our community! Approved reviews are featured in 'What Our Members Say' on the homepage.",
          )}
        </p>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">
            {t('reviews.libraryReviewModal.ratingLabel', 'Overall Rating')}
          </label>
          <div className="flex items-center gap-1" onMouseLeave={() => setHoverRating(null)}>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                className="p-1 text-warning focus:outline-none transition-transform hover:scale-110"
                aria-label={t('reviews.libraryReviewModal.starAria', { count: star, defaultValue: `Rate ${star} star` })}
              >
                <Star
                  className={`size-7 ${
                    star <= displayRating
                      ? 'fill-warning text-warning'
                      : 'text-border fill-transparent'
                  }`}
                />
              </button>
            ))}
            <span className="ml-2 text-sm font-semibold text-foreground">
              {displayRating}.0 / 5.0
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="library-review-quote" className="text-sm font-medium text-foreground">
            {t('reviews.libraryReviewModal.reviewLabel', 'Your Review')}
          </label>
          <textarea
            id="library-review-quote"
            rows={4}
            value={quote}
            onChange={(e) => {
              setQuote(e.target.value);
              if (error) setError(null);
            }}
            placeholder={t(
              'reviews.libraryReviewModal.placeholder',
              'What do you love most about our library, collection, seat reservations, or atmosphere?',
            )}
            className="w-full rounded-md border border-border bg-surface p-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {t('reviews.libraryReviewModal.submitButton', 'Submit Review')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
