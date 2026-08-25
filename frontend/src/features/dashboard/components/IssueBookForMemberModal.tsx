import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { ListRow } from '@/components/common';
import { Button, Input, Modal, Select } from '@/components/ui';
import { getErrorMessage, apiGet } from '@/lib/api';
import { useAuth, type LoanDurationDays, type MemberSummary } from '@/providers/AuthProvider';

import { MemberPicker } from './MemberPicker';

const SEARCH_DEBOUNCE_MS = 300;
const DURATION_CHOICES: LoanDurationDays[] = [3, 5, 7, 10];

interface BookSummary {
  id: string;
  title: string;
  author: string;
  available: boolean;
}

interface BookListResponse {
  items: BookSummary[];
}

export interface IssueBookForMemberModalProps {
  open: boolean;
  onClose: () => void;
  onIssued?: () => void;
}

export function IssueBookForMemberModal({ open, onClose, onIssued }: IssueBookForMemberModalProps) {
  const { t } = useTranslation();
  const { issueLoanForMember } = useAuth();
  const [selectedMember, setSelectedMember] = useState<MemberSummary | null>(null);
  const [selectedBook, setSelectedBook] = useState<BookSummary | null>(null);
  const [bookQuery, setBookQuery] = useState('');
  const [bookResults, setBookResults] = useState<BookSummary[]>([]);
  const [durationDays, setDurationDays] = useState<LoanDurationDays>(7);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSelectedMember(null);
      setSelectedBook(null);
      setBookQuery('');
      setBookResults([]);
      setDurationDays(7);
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
    if (!selectedMember || !selectedBook) return;
    setIsSubmitting(true);
    try {
      await issueLoanForMember({
        member_id: selectedMember.id,
        book_id: selectedBook.id,
        duration_days: durationDays,
      });
      toast.success(
        t('managerDashboard.issueBookModal.successToast', {
          book: selectedBook.title,
          name: selectedMember.full_name,
        }),
      );
      onIssued?.();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSubmit = selectedMember !== null && selectedBook !== null;

  return (
    <Modal open={open} onClose={onClose} title={t('managerDashboard.issueBookModal.title')}>
      <div className="flex flex-col gap-4">
        <MemberPicker
          selectedMember={selectedMember}
          onSelect={setSelectedMember}
          label={t('managerDashboard.issueBookModal.memberLabel')}
          searchPlaceholder={t('managerDashboard.billingRequest.memberSearchPlaceholder')}
          changeLabel={t('managerDashboard.billingRequest.changeMember')}
          noResultsLabel={t('managerDashboard.billingRequest.noMembersFound')}
          autoFocus
        />

        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-foreground">
            {t('managerDashboard.issueBookModal.bookLabel')}
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
                  {t('managerDashboard.billingRequest.changeMember')}
                </button>
              }
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              <Input
                value={bookQuery}
                onChange={(event) => setBookQuery(event.target.value)}
                placeholder={t('managerDashboard.issueBookModal.bookSearchPlaceholder')}
              />
              {bookResults.length > 0 && (
                <ul className="flex flex-col gap-1 rounded-md border border-border bg-surface p-1 shadow-panel">
                  {bookResults.map((book) => (
                    <li key={book.id}>
                      <button
                        type="button"
                        disabled={!book.available}
                        onClick={() => {
                          setSelectedBook(book);
                          setBookQuery('');
                          setBookResults([]);
                        }}
                        className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="text-sm font-medium text-foreground">{book.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {book.author}
                          {!book.available && ` — ${t('managerDashboard.issueBookModal.unavailable')}`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {bookQuery.trim().length > 0 && bookResults.length === 0 && (
                <p className="px-1 text-xs text-muted-foreground">
                  {t('managerDashboard.issueBookModal.noBooksFound')}
                </p>
              )}
            </div>
          )}
        </div>

        <Select
          label={t('managerDashboard.issueBookModal.durationLabel')}
          value={String(durationDays)}
          onChange={(event) => setDurationDays(Number(event.target.value) as LoanDurationDays)}
          options={DURATION_CHOICES.map((days) => ({
            value: String(days),
            label: t('managerDashboard.issueBookModal.durationOption', { count: days }),
          }))}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="button" isLoading={isSubmitting} disabled={!canSubmit} onClick={onSubmit}>
            {t('managerDashboard.issueBookModal.submit')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
