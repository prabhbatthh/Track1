import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Pagination, TableToolbar } from '@/components/common';
import { NoResults } from '@/components/feedback';
import { Badge, type BadgeVariant, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { usePagination } from '@/hooks';
import { formatDate } from '@/lib/format';
import type { BookRecordEntry, BookRecordType } from '@/providers/AuthProvider';

const typeBadgeVariant: Record<BookRecordType, BadgeVariant> = {
  lost: 'danger',
  donated: 'success',
  purchased: 'default',
};

const typeLabelKey: Record<BookRecordType, string> = {
  lost: 'itHead.bookRecords.types.lost',
  donated: 'itHead.bookRecords.types.donated',
  purchased: 'itHead.bookRecords.types.purchased',
};

export function BookRecords({ records }: { records: BookRecordEntry[] }) {
  const { t } = useTranslation();
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortValue, setSortValue] = useState('newest');

  const filteredRecords = useMemo(() => {
    const items = [...records].filter((record) => {
      if (typeFilter === 'all') return true;
      return record.type === typeFilter;
    });

    switch (sortValue) {
      case 'oldest':
        return items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      case 'title':
        return items.sort((a, b) => a.book_title.localeCompare(b.book_title));
      case 'newest':
      default:
        return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
  }, [records, sortValue, typeFilter]);

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(filteredRecords, 4);

  return (
    <Card className="flex h-full flex-col justify-between">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle>{t('itHead.bookRecords.title')}</CardTitle>
        <TableToolbar
          variant="icon-only"
          filters={[
            {
              label: t('itHead.bookRecords.filters.typeLabel'),
              value: typeFilter,
              onChange: (value) => {
                setTypeFilter(value);
                setPage(1);
              },
              options: [
                { value: 'all', label: t('itHead.bookRecords.filters.all') },
                { value: 'lost', label: t(typeLabelKey.lost) },
                { value: 'donated', label: t(typeLabelKey.donated) },
                { value: 'purchased', label: t(typeLabelKey.purchased) },
              ],
            },
          ]}
          sort={{
            label: t('common.actions.sort'),
            value: sortValue,
            onChange: (value) => {
              setSortValue(value);
              setPage(1);
            },
            options: [
              { value: 'newest', label: t('itHead.bookRecords.sort.newestFirst') },
              { value: 'oldest', label: t('itHead.bookRecords.sort.oldestFirst') },
              { value: 'title', label: t('itHead.bookRecords.sort.title') },
            ],
          }}
          onReset={() => {
            setTypeFilter('all');
            setSortValue('newest');
            setPage(1);
          }}
          resetLabel={t('common.actions.reset')}
        />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-3">
        {filteredRecords.length === 0 ? (
          <NoResults title={t('itHead.bookRecords.empty')} />
        ) : (
          <div className="flex flex-col justify-between gap-3 h-full">
            <ul className="flex flex-col gap-3">
              {paginatedItems.map((record) => (
                <li key={record.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant={typeBadgeVariant[record.type]}>{t(typeLabelKey[record.type])}</Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(record.created_at)}</span>
                  </div>
                  <p className="mt-1 font-medium text-foreground">{record.book_title}</p>
                  {record.note && <p className="text-muted-foreground">{record.note}</p>}
                  <p className="text-xs text-muted-foreground">{record.logged_by_name}</p>
                </li>
              ))}
            </ul>
            {totalPages > 1 && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={totalItems}
                pageSize={4}
                onPageChange={setPage}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
