import { BookX, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageHeader, Pagination, TableToolbar } from '@/components/common';
import { NoResults } from '@/components/feedback';
import {
  Badge,
  Button,
  SearchBar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { AddBookModal, type BookDraft } from '@/features/dashboard/components/AddBookModal';
import { formatDate } from '@/lib/format';
import { useDebouncedFetch } from '@/lib/useDebouncedFetch';
import { useAuth, type ManagerBookAvailability } from '@/providers/AuthProvider';

const PAGE_SIZE = 20;
const EMPTY_BOOK_LIST = { items: [] as ManagerBookAvailability[], total: 0 };

// ponytail: a flat, hardcoded list — no Category table yet, add one if categories
// need to be manager-editable instead of a fixed set. Mirrors the member-facing
// catalog's category list (see features/books/components/BookFilters.tsx).
const CATEGORIES = [
  'all',
  'Fiction',
  'Non-Fiction',
  'Science',
  'Technology',
  'Biography',
  'Self-Help',
] as const;

// Translation key for each non-"all" category — see books.categories in en.json.
const CATEGORY_KEYS: Partial<Record<(typeof CATEGORIES)[number], string>> = {
  Fiction: 'fiction',
  'Non-Fiction': 'nonFiction',
  Science: 'science',
  Technology: 'technology',
  Biography: 'biography',
  'Self-Help': 'selfHelp',
};

// "Unavailable" splits into two operationally different cases: a copy out on a loan
// with a known due date, versus one with no return date on file at all (e.g. zero
// total copies, or tied up some other way loans don't track) — the latter usually
// needs a manager to go look into it, so it's worth being able to filter to just those.
const STATUSES = ['all', 'available', 'unavailable', 'unavailable_no_date'] as const;

const SORTS = ['title_asc', 'title_desc', 'copies_desc', 'copies_asc'] as const;

function StatusCell({ book }: { book: ManagerBookAvailability }) {
  const { t } = useTranslation();

  if (book.is_available) {
    return <Badge variant="success">{t('managerDashboard.books.status.available')}</Badge>;
  }

  return (
    <div className="flex flex-col gap-1">
      <Badge variant="warning">{t('managerDashboard.books.status.unavailable')}</Badge>
      <span className="text-xs text-muted-foreground">
        {book.expected_available_at
          ? t('managerDashboard.books.expectedBack', { date: formatDate(book.expected_available_at) })
          : t('managerDashboard.books.expectedBackUnknown')}
      </span>
    </div>
  );
}

// Read-only counter-staff view: is a book on the shelf right now, and if not,
// when is the earliest active loan on it due back (there's no due date for
// copies tied up by an online reservation, so that case shows "unknown").
export function ManagerBooksPage() {
  const { t } = useTranslation();
  const { role, getManagerBooks, createBook } = useAuth();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [status, setStatus] = useState<string>(STATUSES[0]);
  const [sort, setSort] = useState<string>(SORTS[0]);
  const [page, setPage] = useState(1);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Mirrors the backend's manage_books role gate (ADMIN, LIBRARIAN, MANAGER) — the
  // API enforces this either way, but there's no point showing the button to a role
  // that can only ever get a 403 back from it.
  const canAddBooks = role === 'admin' || role === 'librarian' || role === 'manager';

  const { data } = useDebouncedFetch(
    () => getManagerBooks({ search, category, status, sort, page, page_size: PAGE_SIZE }),
    [search, category, status, sort, page, refreshKey, getManagerBooks],
    EMPTY_BOOK_LIST,
  );
  const { items, total } = data;

  async function handleAddBook(draft: BookDraft) {
    await createBook({
      title: draft.title.trim(),
      author: draft.author.trim(),
      category: draft.category,
      description: draft.description.trim() || undefined,
      isbn: draft.isbn.trim() || undefined,
      publisher: draft.publisher.trim() || undefined,
      published_year: draft.publishedYear ? Number(draft.publishedYear) : undefined,
      language: draft.language.trim() || undefined,
      cover_image_url: draft.coverImageUrl || undefined,
      total_copies: draft.totalCopies ? Number(draft.totalCopies) : 0,
    });
    setIsAddOpen(false);
    setRefreshKey((key) => key + 1);
  }

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateCategory(value: string) {
    setCategory(value);
    setPage(1);
  }

  function updateStatus(value: string) {
    setStatus(value);
    setPage(1);
  }

  function updateSort(value: string) {
    setSort(value);
    setPage(1);
  }

  function resetFilters() {
    setSearch('');
    setCategory(CATEGORIES[0]);
    setStatus(STATUSES[0]);
    setSort(SORTS[0]);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('managerDashboard.books.pageTitle')}
        description={t('managerDashboard.books.pageDescription')}
        actions={
          canAddBooks && (
            <Button size="sm" onClick={() => setIsAddOpen(true)}>
              <Plus className="size-4" />
              {t('managerDashboard.books.addModal.openButton')}
            </Button>
          )
        }
      />

      {canAddBooks && (
        <AddBookModal
          open={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          onSubmit={handleAddBook}
          categories={CATEGORIES.filter((value) => value !== 'all')}
        />
      )}

      {/* Styled Filter & Search Toolbar Container matching Admin Members page */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <SearchBar
          value={search}
          onChange={updateSearch}
          placeholder={t('managerDashboard.books.searchPlaceholder')}
          className="max-w-sm"
        />

        <TableToolbar
          filters={[
            {
              label: t('managerDashboard.books.filters.categoryLabel'),
              value: category,
              onChange: updateCategory,
              options: CATEGORIES.map((value) => ({
                value,
                label:
                  value === 'all'
                    ? t('managerDashboard.books.filters.allCategories')
                    : t(`books.categories.${CATEGORY_KEYS[value]}`, value),
              })),
            },
            {
              label: t('managerDashboard.books.filters.statusLabel'),
              value: status,
              onChange: updateStatus,
              options: STATUSES.map((value) => ({
                value,
                label: t(`managerDashboard.books.filters.statusOptions.${value}`),
              })),
            },
          ]}
          sort={{
            label: t('managerDashboard.books.filters.sortLabel'),
            value: sort,
            onChange: updateSort,
            options: SORTS.map((value) => ({
              value,
              label: t(`managerDashboard.books.filters.sortOptions.${value}`),
            })),
          }}
          onReset={resetFilters}
          resetLabel={t('common.actions.reset')}
        />
      </div>

      {items.length === 0 ? (
        <NoResults
          icon={BookX}
          title={t('managerDashboard.books.empty.title')}
          description={t('managerDashboard.books.empty.description')}
        />
      ) : (
        <>
          <div className="w-full overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
            <Table className="min-w-full">
              <TableHeader className="bg-secondary/20">
                <TableRow>
                  <TableHead className="whitespace-nowrap px-3.5 py-2.5">{t('managerDashboard.books.table.title')}</TableHead>
                  <TableHead className="whitespace-nowrap px-3.5 py-2.5">{t('managerDashboard.books.table.category')}</TableHead>
                  <TableHead className="whitespace-nowrap px-3.5 py-2.5">{t('managerDashboard.books.table.copies')}</TableHead>
                  <TableHead className="whitespace-nowrap px-3.5 py-2.5 text-right">{t('managerDashboard.books.table.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((book) => (
                  <TableRow key={book.id} className="transition-colors hover:bg-secondary/40">
                    <TableCell className="px-3.5 py-2.5">
                      <p className="font-semibold text-foreground text-xs sm:text-sm">{book.title}</p>
                      <p className="text-xs text-muted-foreground">{book.author}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3.5 py-2.5 text-xs text-foreground font-medium">{book.category}</TableCell>
                    <TableCell className="whitespace-nowrap px-3.5 py-2.5 text-xs font-semibold text-foreground">
                      {t('managerDashboard.books.copiesAvailable', {
                        available: book.available_copies,
                        total: book.total_copies,
                      })}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3.5 py-2.5 text-right">
                      <StatusCell book={book} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}