import { useTranslation } from 'react-i18next';

import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui';

export interface CurrentlyBorrowedBook {
  id: string;
  title: string;
  borrowedOn: string;
}

export interface CurrentlyBorrowedProps {
  books: CurrentlyBorrowedBook[];
}

export function CurrentlyBorrowed({ books }: CurrentlyBorrowedProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('dashboard.currentlyBorrowed.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {books.length === 0 ? (
          <EmptyState
            title={t('myLoans.empty.title')}
            description={t('myLoans.empty.description')}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {books.map((book) => (
              <li key={book.id} className="flex items-center justify-between text-sm">
                <p className="font-medium text-foreground">{book.title}</p>
                <span className="text-muted-foreground">
                  {t('common.time.since', { date: book.borrowedOn })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
