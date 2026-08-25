import { ImagePlus, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Input, Modal, Textarea } from '@/components/ui';

export interface PostDraft {
  bookTitle: string;
  content: string;
  images: string[];
}

export interface CreatePostModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (draft: PostDraft) => void | Promise<void>;
  /** When set, the modal opens pre-filled for editing an existing post. */
  initialValues?: PostDraft;
}

const MAX_IMAGES = 4;
const MAX_CONTENT_LENGTH = 500;
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export function CreatePostModal({ open, onClose, onSubmit, initialValues }: CreatePostModalProps) {
  const { t } = useTranslation();
  const isEditing = Boolean(initialValues);
  const [bookTitle, setBookTitle] = useState(initialValues?.bookTitle ?? '');
  const [content, setContent] = useState(initialValues?.content ?? '');
  const [images, setImages] = useState<string[]>(initialValues?.images ?? []);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Re-sync the draft whenever the modal transitions to open, so a fresh
  // "create" starts blank and "edit" starts pre-filled with that post.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setBookTitle(initialValues?.bookTitle ?? '');
      setContent(initialValues?.content ?? '');
      setImages(initialValues?.images ?? []);
      setImageError(null);
      setIsSubmitting(false);
    }
  }

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
      setImageError(
        t('community.createPostModal.invalidImageType', 'Only image files can be attached.'),
      );
      return;
    }
    const oversized = selectedFiles.find((file) => file.size > MAX_IMAGE_SIZE_BYTES);
    if (oversized) {
      setImageError(
        t('community.createPostModal.imageTooLarge', 'Each image must be 5 MB or smaller.'),
      );
      return;
    }
    // Data URLs (not blob: URLs) because there's no upload/object storage yet
    // (see the ponytail note on CommunityPost.images) — this way the image
    // actually persists in the DB and is visible to other users/after reload.
    try {
      const nextUrls = await Promise.all(selectedFiles.map(readAsDataUrl));
      setImages((prev) => [...prev, ...nextUrls]);
    } catch {
      setImageError(
        t('community.createPostModal.imageReadFailed', 'One or more images could not be read.'),
      );
    }
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (content.trim().length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit({ bookTitle: bookTitle.trim(), content: content.trim(), images });
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSubmit = content.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? t('community.createPostModal.editTitle') : t('community.createPostModal.title')}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label={t('community.createPostModal.bookTitleLabel')}
          placeholder={t('community.createPostModal.bookTitlePlaceholder')}
          value={bookTitle}
          onChange={(event) => setBookTitle(event.target.value)}
        />

        <div className="flex flex-col gap-1.5">
          <Textarea
            id="post-content"
            label={t('community.createPostModal.contentLabel')}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={4}
            maxLength={MAX_CONTENT_LENGTH}
            placeholder={t('community.createPostModal.contentPlaceholder')}
          />
          <p className="text-right text-xs text-muted-foreground tabular-nums">
            {content.length}/{MAX_CONTENT_LENGTH}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-foreground">{t('community.createPostModal.imagesLabel')}</p>
          <div className="flex flex-wrap gap-2">
            {images.map((src, index) => (
              <div key={src} className="relative size-16 overflow-hidden rounded-md border border-border">
                <img src={src} alt="" className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  aria-label={t('community.createPostModal.removeImage')}
                  className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 text-foreground"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
            {images.length < MAX_IMAGES && (
              <label
                htmlFor="post-images"
                className="flex size-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary"
              >
                <ImagePlus className="size-5" />
                <span className="text-[10px]">{t('community.createPostModal.addImage')}</span>
                <input
                  id="post-images"
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
            {t('community.createPostModal.imagesHint', { count: MAX_IMAGES })}
          </p>
          {imageError && (
            <p role="alert" className="text-xs text-danger">
              {imageError}
            </p>
          )}
        </div>

        <Button type="submit" disabled={!canSubmit} isLoading={isSubmitting}>
          {isEditing ? t('community.createPostModal.saveChanges') : t('community.createPostModal.submit')}
        </Button>
      </form>
    </Modal>
  );
}
