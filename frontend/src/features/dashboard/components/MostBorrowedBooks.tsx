import { BookOpen } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Pagination, ProgressBar } from '@/components/common';
import { Button, Card, CardContent, CardHeader, CardTitle, Modal, Select } from '@/components/ui';
import { usePagination } from '@/hooks';
import type { MostBorrowedBook, MostBorrowedBooksByPeriod } from '@/providers/AuthProvider';

type Period = keyof MostBorrowedBooksByPeriod;

const PREVIEW_COUNT = 4;

// Evenly spaced ticks under the bars, like a real chart axis — 0, then rounded steps up
// to a value that's always >= the largest bar so nothing overflows the scale.
function axisTicks(max: number): number[] {
  const step = Math.ceil(max / 5 / 5) * 5 || 1;
  return Array.from({ length: 6 }, (_, i) => i * step);
}

function BookBarList({ books, caption }: { books: MostBorrowedBook[]; caption: string }) {
  const max = Math.max(...books.map((b) => b.count), 1);
  const ticks = axisTicks(max);
  const axisMax = ticks[ticks.length - 1];

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {books.map((book) => (
          <li key={book.book_id} className="flex items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <BookOpen className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-foreground">{book.title}</span>
                <span className="shrink-0 font-medium text-muted-foreground">{book.count}</span>
              </div>
              <ProgressBar percent={(book.count / axisMax) * 100} />
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1 border-t border-border pt-2">
        <div className="ml-11 flex justify-between text-[10px] text-muted-foreground">
          {ticks.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground">{caption}</p>
      </div>
    </div>
  );
}

function MostBorrowedModalContent({ books, caption }: { books: MostBorrowedBook[]; caption: string }) {
  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(books, 5);

  return (
    <div className="flex flex-col gap-4">
      <BookBarList books={paginatedItems} caption={caption} />
      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={5}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

export function MostBorrowedBooks({ books }: { books: MostBorrowedBooksByPeriod }) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>('this_month');
  const [showAll, setShowAll] = useState(false);

  const selected = books[period];
  const preview = selected.slice(0, PREVIEW_COUNT);
  const caption = t('managerDashboard.mostBorrowedBooks.axisLabel');

  return (
    <Card>
      {/* Stacked, not side-by-side: this card sits in a 3-column row (tighter than the
          2-column admin revenue card that pattern first shipped in), and title+dropdown
          sharing one row wrapped the title across three lines. */}
      <CardHeader className="gap-2">
        <CardTitle>{t('managerDashboard.mostBorrowedBooks.title')}</CardTitle>
        <Select
          aria-label={t('managerDashboard.mostBorrowedBooks.periodLabel')}
          className="h-9 w-full"
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          options={[
            { value: 'this_month', label: t('managerDashboard.mostBorrowedBooks.thisMonth') },
            { value: 'last_3_months', label: t('managerDashboard.mostBorrowedBooks.last3Months') },
            { value: 'last_6_months', label: t('managerDashboard.mostBorrowedBooks.last6Months') },
          ]}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {selected.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('managerDashboard.mostBorrowedBooks.empty')}
          </p>
        ) : (
          <>
            <BookBarList books={preview} caption={caption} />
            {selected.length > PREVIEW_COUNT && (
              <Button variant="ghost" size="sm" className="self-start px-0" onClick={() => setShowAll(true)}>
                {t('managerDashboard.mostBorrowedBooks.seeMore')}
              </Button>
            )}
          </>
        )}
      </CardContent>

      <Modal
        open={showAll}
        onClose={() => setShowAll(false)}
        title={t('managerDashboard.mostBorrowedBooks.title')}
        className="max-w-lg"
      >
        <MostBorrowedModalContent books={selected} caption={caption} />
      </Modal>
    </Card>
  );
}
