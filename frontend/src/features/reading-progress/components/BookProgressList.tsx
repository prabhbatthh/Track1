import { useTranslation } from 'react-i18next';

import { ProgressBar } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui';
import type { ProgressBook } from '@/mocks/reading-progress';

export interface BookProgressListProps {
  title: string;
  books: ProgressBook[];
  emptyDescription: string;
}

export function BookProgressList({ title, books, emptyDescription }: BookProgressListProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {books.length === 0 ? (
          <EmptyState
            title={t('readingProgress.emptyState.title')}
            description={emptyDescription}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {books.map((book) => (
              <div key={book.id}>
                <p className="text-sm font-medium text-foreground">
                  {book.title}
                  {book.author && (
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      {t('readingProgress.byAuthor', { author: book.author })}
                    </span>
                  )}
                </p>
                {book.percentComplete > 0 && book.percentComplete < 100 && (
                  <ProgressBar percent={book.percentComplete} className="mt-1.5" />
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
