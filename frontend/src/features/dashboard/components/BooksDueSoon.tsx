import { useTranslation } from 'react-i18next';

import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui';
import type { DueBook } from '@/mocks/dashboard';

export interface BooksDueSoonProps {
  books: DueBook[];
}

export function BooksDueSoon({ books }: BooksDueSoonProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('dashboard.booksDueSoon.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {books.length === 0 ? (
          <EmptyState
            title={t('dashboard.booksDueSoon.emptyTitle')}
            description={t('dashboard.booksDueSoon.emptyDescription')}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {books.map((book) => (
              <li key={book.id} className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{book.title}</span>
                <span className="text-muted-foreground">
                  {t('dashboard.booksDueSoon.due', {
                    date: book.dueDate,
                    days: t('common.time.daysLeft', { count: book.daysLeft }),
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
