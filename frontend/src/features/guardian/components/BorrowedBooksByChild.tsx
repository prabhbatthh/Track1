import { useTranslation } from 'react-i18next';

import { Badge, type BadgeVariant, Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui';
import type { Child, ChildBorrowedBook } from '@/mocks/guardian';

const statusBadgeVariant: Record<ChildBorrowedBook['status'], BadgeVariant> = {
  'on-time': 'success',
  'due-soon': 'warning',
  overdue: 'danger',
};

const statusKey: Record<ChildBorrowedBook['status'], string> = {
  'on-time': 'onTime',
  'due-soon': 'dueSoon',
  overdue: 'overdue',
};

export function BorrowedBooksByChild({
  books = [],
  children = [],
}: {
  books?: ChildBorrowedBook[];
  children?: Child[];
}) {
  const { t } = useTranslation();
  const safeBooks = books ?? [];
  const safeChildren = children ?? [];
  const childName = (childId: string) => safeChildren.find((child) => child && child.id === childId)?.name ?? '';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('guardian.borrowedBooks.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {safeBooks.length === 0 ? (
          <EmptyState
            title={t('guardian.borrowedBooks.emptyTitle')}
            description={t('guardian.borrowedBooks.emptyDescription')}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {safeBooks.map((book) => {
              if (!book) return null;
              const variant = (book.status && statusBadgeVariant[book.status]) || 'outline';
              const keyName = (book.status && statusKey[book.status]) || 'onTime';

              return (
                <li
                  key={book.id || Math.random()}
                  className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-foreground">{book.title || 'Book'}</p>
                    <p className="text-muted-foreground">
                      {childName(book.childId)} · {t('guardian.borrowedBooks.dueOn', { date: book.dueDate || '' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {book.fineAccrued && (
                      <span className="text-xs text-muted-foreground">{book.fineAccrued}</span>
                    )}
                    <Badge variant={variant}>
                      {t(`guardian.borrowedBooks.status.${keyName}`)}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
