import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ListRow } from '@/components/common';
import { Button, Input, Modal, Select } from '@/components/ui';
import { apiGet, getErrorMessage } from '@/lib/api';
import { useAuth, type BookRecordType } from '@/providers/AuthProvider';

const SEARCH_DEBOUNCE_MS = 300;
const RECORD_TYPES: BookRecordType[] = ['lost', 'donated', 'purchased'];

interface BookSummary {
  id: string;
  title: string;
  author: string;
}

interface BookListResponse {
  items: BookSummary[];
}

export interface LogBookChangeModalProps {
  open: boolean;
  onClose: () => void;
  onLogged: () => void;
}

export function LogBookChangeModal({ open, onClose, onLogged }: LogBookChangeModalProps) {
  const { t } = useTranslation();
  const { createBookRecord } = useAuth();
  const [selectedBook, setSelectedBook] = useState<BookSummary | null>(null);
  const [bookQuery, setBookQuery] = useState('');
  const [bookResults, setBookResults] = useState<BookSummary[]>([]);
  const [type, setType] = useState<BookRecordType>('lost');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSelectedBook(null);
      setBookQuery('');
      setBookResults([]);
      setType('lost');
      setNote('');
    }
  }

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (bookQuery.trim().length === 0) {
        if (!cancelled) setBookResults([]);
        return;
      }
      apiGet<BookListResponse>(`/books?search=${encodeURIComponent(bookQuery.trim())}&page_size=6`)
        .then((data) => !cancelled && setBookResults(data.items))
        .catch(() => !cancelled && setBookResults([]));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bookQuery]);

  async function onSubmit() {
    if (!selectedBook) return;
    setIsSubmitting(true);
    try {
      await createBookRecord({ book_id: selectedBook.id, type, note: note.trim() || undefined });
      toast.success(
        t('itHead.logBookChangeModal.successToast', {
          type: t(`itHead.bookRecords.types.${type}`),
          book: selectedBook.title,
        }),
      );
      onLogged();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('itHead.logBookChangeModal.title')}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-foreground">
            {t('itHead.logBookChangeModal.bookLabel')}
          </p>
          {selectedBook ? (
            <ListRow
              title={selectedBook.title}
              subtitle={selectedBook.author}
              action={
                <button
                  type="button"
                  onClick={() => setSelectedBook(null)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {t('itHead.logBookChangeModal.changeBook')}
                </button>
              }
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              <Input
                value={bookQuery}
                onChange={(event) => setBookQuery(event.target.value)}
                placeholder={t('itHead.logBookChangeModal.bookSearchPlaceholder')}
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
                        <span className="text-xs text-muted-foreground">{book.author}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {bookQuery.trim().length > 0 && bookResults.length === 0 && (
                <p className="px-1 text-xs text-muted-foreground">
                  {t('itHead.logBookChangeModal.noBooksFound')}
                </p>
              )}
            </div>
          )}
        </div>

        <Select
          label={t('itHead.logBookChangeModal.typeLabel')}
          value={type}
          onChange={(event) => setType(event.target.value as BookRecordType)}
          options={RECORD_TYPES.map((value) => ({
            value,
            label: t(`itHead.bookRecords.types.${value}`),
          }))}
        />

        <Input
          label={t('itHead.logBookChangeModal.noteLabel')}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.actions.cancel')}
          </Button>
          <Button
            type="button"
            isLoading={isSubmitting}
            disabled={!selectedBook}
            onClick={onSubmit}
          >
            {t('itHead.logBookChangeModal.submit')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
