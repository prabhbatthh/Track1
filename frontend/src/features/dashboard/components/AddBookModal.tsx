import { Camera, Check, CircleAlert, ClipboardPaste, Sparkles, Wand2, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, Input, Modal, Select, Textarea } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';

export interface BookDraft {
  title: string;
  author: string;
  category: string;
  description: string;
  isbn: string;
  publisher: string;
  publishedYear: string;
  language: string;
  coverImageUrl: string;
  totalCopies: string;
}

export interface AddBookModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (draft: BookDraft) => void | Promise<void>;
  categories: string[];
}

const EMPTY_DRAFT: BookDraft = {
  title: '',
  author: '',
  category: '',
  description: '',
  isbn: '',
  publisher: '',
  publishedYear: '',
  language: '',
  coverImageUrl: '',
  totalCopies: '0',
};

// Same cap CreatePostModal already applies to a single image — no upload/object
// storage exists yet, images are stored as data: URLs, so this bounds request size.
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function AddBookModal({ open, onClose, onSubmit, categories }: AddBookModalProps) {
  const { t } = useTranslation();
  const { suggestBookDescription, identifyBookFromCover } = useAuth();
  const [draft, setDraft] = useState<BookDraft>(EMPTY_DRAFT);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [identifyError, setIdentifyError] = useState<string | null>(null);
  // matched: false is "we asked, nothing came back" — a real, distinct outcome from
  // "found something" (matched: true), not a slightly different flavor of success.
  const [identifyResult, setIdentifyResult] = useState<{
    message: string;
    matched: boolean;
  } | null>(null);

  // Re-sync to a blank draft whenever the modal transitions to open, same pattern as
  // CreatePostModal — this is a "create", never an "edit", so there's no initialValues case.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(EMPTY_DRAFT);
      setIsSubmitting(false);
      setSuggestError(null);
      setIsIdentifying(false);
      setIdentifyError(null);
      setIdentifyResult(null);
    }
  }

  function update<K extends keyof BookDraft>(key: K, value: BookDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function identifyFromImage(imageDataUrl: string) {
    setIdentifyError(null);
    setIdentifyResult(null);
    update('coverImageUrl', imageDataUrl);
    setIsIdentifying(true);
    try {
      const fields = await identifyBookFromCover(imageDataUrl);
      if (!fields.title && !fields.author && !fields.isbn) {
        setIdentifyResult({
          message: t('managerDashboard.books.addModal.identifyNoMatch'),
          matched: false,
        });
        return;
      }
      setDraft((prev) => ({
        ...prev,
        title: fields.title ?? prev.title,
        author: fields.author ?? prev.author,
        isbn: fields.isbn ?? prev.isbn,
        category: fields.category ?? prev.category,
        description: fields.description ?? prev.description,
        publisher: fields.publisher ?? prev.publisher,
        publishedYear: fields.published_year ? String(fields.published_year) : prev.publishedYear,
        language: fields.language ?? prev.language,
      }));
      setIdentifyResult({
        message: fields.verified
          ? t('managerDashboard.books.addModal.identifyVerified')
          : t('managerDashboard.books.addModal.identifyUnverified'),
        matched: true,
      });
    } catch {
      setIdentifyError(t('managerDashboard.books.addModal.identifyFailed'));
    } finally {
      setIsIdentifying(false);
    }
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setIdentifyError(t('managerDashboard.books.addModal.identifyInvalidImage'));
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setIdentifyError(t('managerDashboard.books.addModal.identifyImageTooLarge'));
      return;
    }
    try {
      await identifyFromImage(await readAsDataUrl(file));
    } catch {
      setIdentifyError(t('managerDashboard.books.addModal.identifyInvalidImage'));
    }
  }

  function handlePaste(event: React.ClipboardEvent) {
    const item = Array.from(event.clipboardData.items).find((i) => i.type.startsWith('image/'));
    if (!item) return;
    event.preventDefault();
    const file = item.getAsFile();
    if (!file) return;
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setIdentifyError(t('managerDashboard.books.addModal.identifyImageTooLarge'));
      return;
    }
    readAsDataUrl(file)
      .then(identifyFromImage)
      .catch(() => setIdentifyError(t('managerDashboard.books.addModal.identifyInvalidImage')));
  }

  function clearCoverImage() {
    update('coverImageUrl', '');
    setIdentifyResult(null);
    setIdentifyError(null);
  }

  async function handleSuggestDescription() {
    setSuggestError(null);
    setIsSuggesting(true);
    try {
      const description = await suggestBookDescription({
        title: draft.title.trim(),
        author: draft.author.trim(),
        category: draft.category || undefined,
      });
      update('description', description);
    } catch {
      setSuggestError(t('managerDashboard.books.addModal.suggestFailed'));
    } finally {
      setIsSuggesting(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(draft);
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSuggest = draft.title.trim().length > 0 && draft.author.trim().length > 0 && !isSuggesting;
  const canSubmit =
    draft.title.trim().length > 0 && draft.author.trim().length > 0 && draft.category.length > 0;

  return (
    <Modal open={open} onClose={onClose} title={t('managerDashboard.books.addModal.title')}>
      <form onSubmit={handleSubmit} onPaste={handlePaste} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <Wand2 className="size-4 text-primary" />
            {t('managerDashboard.books.addModal.identifyHeading')}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('managerDashboard.books.addModal.identifyHint')}
          </p>

          {draft.coverImageUrl ? (
            <div className="flex items-center gap-3">
              <img
                src={draft.coverImageUrl}
                alt=""
                className="size-16 rounded-md border border-border object-cover"
              />
              <div className="flex flex-1 flex-col gap-1 text-xs">
                {isIdentifying && (
                  <span className="text-muted-foreground">
                    {t('managerDashboard.books.addModal.identifying')}
                  </span>
                )}
                {!isIdentifying && identifyResult && (
                  <span
                    className={
                      'inline-flex items-center gap-1 ' +
                      (identifyResult.matched ? 'text-foreground' : 'text-muted-foreground')
                    }
                  >
                    {identifyResult.matched ? (
                      <Check className="size-3.5 shrink-0 text-success" />
                    ) : (
                      <CircleAlert className="size-3.5 shrink-0" />
                    )}
                    {identifyResult.message}
                  </span>
                )}
                {!isIdentifying && identifyError && (
                  <span role="alert" className="text-danger">
                    {identifyError}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={clearCoverImage}
                aria-label={t('managerDashboard.books.addModal.identifyRemoveImage')}
                className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <label>
                <span className="sr-only">{t('managerDashboard.books.addModal.uploadImage')}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(event) => void handleFileSelect(event)}
                />
                <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-secondary">
                  <Camera className="size-4" />
                  {t('managerDashboard.books.addModal.uploadImage')}
                </span>
              </label>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <ClipboardPaste className="size-3.5" />
                {t('managerDashboard.books.addModal.pasteImageHint')}
              </span>
              {identifyError && (
                <span role="alert" className="w-full text-xs text-danger">
                  {identifyError}
                </span>
              )}
            </div>
          )}
        </div>

        <Input
          label={t('managerDashboard.books.addModal.titleLabel')}
          value={draft.title}
          onChange={(event) => update('title', event.target.value)}
          required
        />
        <Input
          label={t('managerDashboard.books.addModal.authorLabel')}
          value={draft.author}
          onChange={(event) => update('author', event.target.value)}
          required
        />
        <Select
          label={t('managerDashboard.books.addModal.categoryLabel')}
          value={draft.category}
          onChange={(event) => update('category', event.target.value)}
          placeholder={t('managerDashboard.books.addModal.categoryPlaceholder')}
          options={categories.map((value) => ({ value, label: value }))}
          required
        />

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="book-description" className="text-sm font-medium text-foreground">
              {t('managerDashboard.books.addModal.descriptionLabel')}
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSuggestDescription}
              disabled={!canSuggest}
              isLoading={isSuggesting}
            >
              <Sparkles className="size-3.5" />
              {t('managerDashboard.books.addModal.suggestButton')}
            </Button>
          </div>
          <Textarea
            id="book-description"
            value={draft.description}
            onChange={(event) => update('description', event.target.value)}
            rows={4}
            placeholder={t('managerDashboard.books.addModal.descriptionPlaceholder')}
          />
          <p className="text-xs text-muted-foreground">
            {t('managerDashboard.books.addModal.suggestHint')}
          </p>
          {suggestError && (
            <p role="alert" className="text-xs text-danger">
              {suggestError}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label={t('managerDashboard.books.addModal.isbnLabel')}
            value={draft.isbn}
            onChange={(event) => update('isbn', event.target.value)}
          />
          <Input
            label={t('managerDashboard.books.addModal.publishedYearLabel')}
            type="number"
            value={draft.publishedYear}
            onChange={(event) => update('publishedYear', event.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label={t('managerDashboard.books.addModal.publisherLabel')}
            value={draft.publisher}
            onChange={(event) => update('publisher', event.target.value)}
          />
          <Input
            label={t('managerDashboard.books.addModal.languageLabel')}
            value={draft.language}
            onChange={(event) => update('language', event.target.value)}
          />
        </div>

        <Input
          label={t('managerDashboard.books.addModal.totalCopiesLabel')}
          type="number"
          min={0}
          value={draft.totalCopies}
          onChange={(event) => update('totalCopies', event.target.value)}
        />

        <Button type="submit" disabled={!canSubmit} isLoading={isSubmitting}>
          {t('managerDashboard.books.addModal.submit')}
        </Button>
      </form>
    </Modal>
  );
}
