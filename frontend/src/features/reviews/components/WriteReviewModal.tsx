import { ImagePlus, Star, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ListRow } from '@/components/common';
import { Button, Input, Modal, Textarea } from '@/components/ui';
import { apiGet } from '@/lib/api';
import { cn } from '@/lib/cn';

import type { Book } from '../../books/hooks/useBooks';

export interface ReviewDraft {
  bookId: string;
  rating: number;
  comment: string;
  images: string[];
}

export interface WriteReviewModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (draft: ReviewDraft) => void | Promise<void>;
  /** When set, the modal opens pre-filled for editing an existing review — the book can't be changed. */
  initialValues?: ReviewDraft & { bookTitle: string; bookAuthor: string };
}

const MAX_IMAGES = 4;
const MAX_COMMENT_LENGTH = 500;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const SEARCH_DEBOUNCE_MS = 300;

export function WriteReviewModal({ open, onClose, onSubmit, initialValues }: WriteReviewModalProps) {
  const { t } = useTranslation();
  const isEditing = Boolean(initialValues);
  const [rating, setRating] = useState(initialValues?.rating ?? 0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState(initialValues?.comment ?? '');
  const [images, setImages] = useState<string[]>(initialValues?.images ?? []);
  const [selectedBook, setSelectedBook] = useState<Book | null>(
    initialValues
      ? ({
          id: initialValues.bookId,
          title: initialValues.bookTitle,
          author: initialValues.bookAuthor,
        } as Book)
      : null,
  );
  const [bookQuery, setBookQuery] = useState('');
  const [bookResults, setBookResults] = useState<Book[]>([]);
  const [bookSearchFailed, setBookSearchFailed] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Re-sync the draft whenever the modal transitions to open, so a fresh
  // "write" starts blank and "edit" starts pre-filled with that review.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRating(initialValues?.rating ?? 0);
      setComment(initialValues?.comment ?? '');
      setImages(initialValues?.images ?? []);
      setSelectedBook(
        initialValues
          ? ({
              id: initialValues.bookId,
              title: initialValues.bookTitle,
              author: initialValues.bookAuthor,
            } as Book)
          : null,
      );
      setBookQuery('');
      setBookResults([]);
      setBookSearchFailed(false);
      setImageError(null);
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (isEditing || bookQuery.trim().length === 0) {
        if (!cancelled) {
          setBookResults([]);
          setBookSearchFailed(false);
        }
        return;
      }
      apiGet<{ items: Book[] }>(`/books?search=${encodeURIComponent(bookQuery.trim())}&page_size=6`)
        .then((data) => {
          if (cancelled) return;
          setBookResults(data.items);
          setBookSearchFailed(false);
        })
        .catch(() => {
          if (cancelled) return;
          setBookResults([]);
          setBookSearchFailed(true);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bookQuery, isEditing]);

  function readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function handleImageSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const remainingSlots = MAX_IMAGES - images.length;
    event.target.value = '';
    setImageError(null);
    const selectedFiles = files.slice(0, remainingSlots);
    const invalidType = selectedFiles.find((file) => !file.type.startsWith('image/'));
    if (invalidType) {
      setImageError(t('reviews.writeReviewModal.invalidImageType', 'Only image files can be attached.'));
      return;
    }
    const oversized = selectedFiles.find((file) => file.size > MAX_IMAGE_SIZE_BYTES);
    if (oversized) {
      setImageError(t('reviews.writeReviewModal.imageTooLarge', 'Each image must be 5 MB or smaller.'));
      return;
    }
    // Data URLs (not blob: URLs) because there's no upload/object storage yet (see the
    // ponytail note on CommunityPost.images/Review.images) — this way the image
    // actually persists in the DB and is visible after reload.
    try {
      const nextUrls = await Promise.all(selectedFiles.map(readAsDataUrl));
      setImages((prev) => [...prev, ...nextUrls]);
    } catch {
      setImageError(t('reviews.writeReviewModal.imageReadFailed', 'One or more images could not be read.'));
    }
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedBook || rating === 0 || comment.trim().length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit({ bookId: selectedBook.id, rating, comment: comment.trim(), images });
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSubmit = selectedBook !== null && rating > 0 && comment.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? t('reviews.writeReviewModal.editTitle') : t('reviews.writeReviewModal.title')}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-foreground">{t('reviews.writeReviewModal.bookLabel')}</p>
          {selectedBook ? (
            <ListRow
              title={selectedBook.title}
              subtitle={t('reviews.byAuthor', { author: selectedBook.author })}
              action={
                !isEditing && (
                  <button
                    type="button"
                    onClick={() => setSelectedBook(null)}
                    aria-label={t('reviews.writeReviewModal.changeBook')}
                    className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )
              }
            />
          ) : (
            <div className="relative flex flex-col gap-1.5">
              <Input
                value={bookQuery}
                onChange={(event) => setBookQuery(event.target.value)}
                placeholder={t('reviews.writeReviewModal.bookSearchPlaceholder')}
                autoFocus
              />
              {bookResults.length > 0 && (
                <ul className="flex flex-col gap-1 rounded-md border border-border bg-surface p-1 shadow-panel">
                  {bookResults.map((book) => (
                    <li key={book.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBook(book);
                          setBookQuery('');
                          setBookResults([]);
                        }}
                        className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left hover:bg-secondary"
                      >
                        <span className="text-sm font-medium text-foreground">{book.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {t('reviews.byAuthor', { author: book.author })}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {bookQuery.trim().length > 0 && bookResults.length === 0 && (
                <p className={cn('px-1 text-xs', bookSearchFailed ? 'text-danger' : 'text-muted-foreground')}>
                  {t(
                    bookSearchFailed
                      ? 'reviews.writeReviewModal.bookSearchFailed'
                      : 'reviews.writeReviewModal.noBooksFound',
                  )}
                </p>
              )}
            </div>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">
            {t('reviews.writeReviewModal.ratingLabel')}
          </p>
          <div
            className="flex gap-1"
            role="radiogroup"
            aria-label={t('reviews.writeReviewModal.ratingLabel')}
          >
            {Array.from({ length: 5 }, (_, index) => {
              const value = index + 1;
              const filled = value <= (hoveredRating || rating);
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  aria-label={t('common.cards.review.ratedOutOf5', { rating: value })}
                  onMouseEnter={() => setHoveredRating(value)}
                  onMouseLeave={() => setHoveredRating(0)}
                  onClick={() => setRating(value)}
                  className="p-0.5"
                >
                  <Star className={cn('size-6', filled ? 'fill-warning text-warning' : 'text-border')} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Textarea
            id="review-comment"
            label={t('reviews.writeReviewModal.commentLabel')}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={4}
            maxLength={MAX_COMMENT_LENGTH}
            placeholder={t('reviews.writeReviewModal.commentPlaceholder')}
          />
          <p className="text-right text-xs text-muted-foreground tabular-nums">
            {comment.length}/{MAX_COMMENT_LENGTH}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-foreground">
            {t('reviews.writeReviewModal.imagesLabel')}
          </p>
          <div className="flex flex-wrap gap-2">
            {images.map((src, index) => (
              <div key={src} className="relative size-16 overflow-hidden rounded-md border border-border">
                <img src={src} alt="" className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  aria-label={t('reviews.writeReviewModal.removeImage')}
                  className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 text-foreground"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
            {images.length < MAX_IMAGES && (
              <label
                htmlFor="review-images"
                className="flex size-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary"
              >
                <ImagePlus className="size-5" />
                <span className="text-[10px]">{t('reviews.writeReviewModal.addImage')}</span>
                <input
                  id="review-images"
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={handleImageSelect}
                />
              </label>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('reviews.writeReviewModal.imagesHint', { count: MAX_IMAGES })}
          </p>
          {imageError && (
            <p role="alert" className="text-xs text-danger">
              {imageError}
            </p>
          )}
        </div>

        <Button type="submit" disabled={!canSubmit} isLoading={isSubmitting}>
          {isEditing ? t('reviews.writeReviewModal.saveChanges') : t('reviews.writeReviewModal.submit')}
        </Button>
      </form>
    </Modal>
  );
}
