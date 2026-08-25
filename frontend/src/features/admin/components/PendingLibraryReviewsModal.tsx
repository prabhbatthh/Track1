import { Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button, Dialog, Modal } from '@/components/ui';
import { getErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useAuth, type LibraryReviewRecord } from '@/providers/AuthProvider';

type PendingAction = { review: LibraryReviewRecord; kind: 'approve' | 'reject' };

export interface PendingLibraryReviewsModalProps {
  open: boolean;
  onClose: () => void;
}

export function PendingLibraryReviewsModal({ open, onClose }: PendingLibraryReviewsModalProps) {
  const { t } = useTranslation();
  const { getPendingLibraryReviews, approveLibraryReview, rejectLibraryReview } = useAuth();
  const [reviews, setReviews] = useState<LibraryReviewRecord[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [isDeciding, setIsDeciding] = useState(false);

  function refresh() {
    getPendingLibraryReviews()
      .then(setReviews)
      .catch(() => setReviews([]));
  }

  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function confirm() {
    if (!pendingAction) return;
    const { review, kind } = pendingAction;
    setIsDeciding(true);
    try {
      await (kind === 'approve' ? approveLibraryReview : rejectLibraryReview)(review.id);
      toast.success(
        t(
          kind === 'approve'
            ? 'admin.pendingLibraryReviews.approveToast'
            : 'admin.pendingLibraryReviews.rejectToast',
          { name: review.member_name },
        ),
      );
      setPendingAction(null);
      refresh();
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    } finally {
      setIsDeciding(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('admin.pendingLibraryReviews.title')} className="max-w-lg">
      {reviews.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t('admin.pendingLibraryReviews.empty')}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {reviews.map((review) => (
            <li key={review.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 text-warning">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      className={`size-3.5 ${i < review.rating ? 'fill-warning text-warning' : 'text-border fill-transparent'}`}
                    />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">{formatDate(review.created_at)}</span>
              </div>
              <p className="text-sm text-foreground">&ldquo;{review.comment}&rdquo;</p>
              <p className="text-xs text-muted-foreground">
                {t('admin.pendingLibraryReviews.from', { name: review.member_name })}
              </p>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="danger" onClick={() => setPendingAction({ review, kind: 'reject' })}>
                  {t('common.actions.reject')}
                </Button>
                <Button size="sm" variant="success" onClick={() => setPendingAction({ review, kind: 'approve' })}>
                  {t('common.actions.approve')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        onConfirm={confirm}
        isConfirming={isDeciding}
        title={t(
          pendingAction?.kind === 'reject'
            ? 'admin.pendingLibraryReviews.confirmRejectTitle'
            : 'admin.pendingLibraryReviews.confirmApproveTitle',
        )}
        description={
          pendingAction
            ? t('admin.pendingLibraryReviews.confirmDescription', { name: pendingAction.review.member_name })
            : undefined
        }
        confirmLabel={t(pendingAction?.kind === 'reject' ? 'common.actions.reject' : 'common.actions.approve')}
        confirmVariant={pendingAction?.kind === 'reject' ? 'danger' : 'success'}
      />
    </Modal>
  );
}
