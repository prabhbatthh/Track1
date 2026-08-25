import { Heart, SearchX, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { BookCard, PageHeader, Pagination } from '@/components/common';
import { ErrorState, LoadingState, NoResults } from '@/components/feedback';
import { Badge, Button } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

import { BookFilters } from '../components/BookFilters';
import { FindMyNextBookModal } from '../components/FindMyNextBookModal';
import { WishlistDrawer } from '../components/WishlistDrawer';
import { PAGE_SIZE } from '../api';
import { useBooks, useBooksByIds, type BookSort } from '../hooks/useBooks';
import { useWishlist } from '../hooks/useWishlist';

export function BooksListPage() {
  const { t } = useTranslation();
  const { role, reserveBook } = useAuth();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState<BookSort>('newest');
  const [page, setPage] = useState(1);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const { wishlistIds, isWishlisted, toggleWishlist } = useWishlist();
  const {
    items: pageBooks,
    total,
    totalPages,
    refresh,
    isLoading,
    isFetching,
    error: loadError,
  } = useBooks(search, category, sort, page);
  const wishlistedBooks = useBooksByIds(wishlistIds);

  async function handleReserve(bookId: string, title: string) {
    try {
      await reserveBook(bookId);
      toast.success(t('books.details.reserveSuccessToast', { title }));
      refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, t('common.errors.generic')));
    }
  }

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateCategory(value: string) {
    setCategory(value);
    setPage(1);
  }

  function updateSort(value: BookSort) {
    setSort(value);
    setPage(1);
  }

  function clearFilters() {
    setSearch('');
    setCategory('All');
    setSort('newest');
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('books.pageTitle')}
        description={t('books.pageDescription')}
        actions={
          <>
            {role === 'member' && (
              <Button
                variant="outline"
                leadingIcon={<Sparkles className="size-4" />}
                onClick={() => setIsQuizOpen(true)}
              >
                {t('books.quiz.button')}
              </Button>
            )}
            <Button
              variant="outline"
              leadingIcon={<Heart className="size-4" />}
              onClick={() => setIsWishlistOpen(true)}
            >
              {t('books.wishlist.button')}
              {wishlistIds.length > 0 && <Badge variant="danger">{wishlistIds.length}</Badge>}
            </Button>
          </>
        }
      />

      <BookFilters
        search={search}
        onSearchChange={updateSearch}
        category={category}
        onCategoryChange={updateCategory}
        sort={sort}
        onSortChange={updateSort}
      />

      {isLoading ? (
        <LoadingState label="Loading books" />
      ) : loadError ? (
        <ErrorState
          className="min-h-48"
          description={getErrorMessage(loadError, t('common.errors.generic'))}
          onRetry={() => void refresh()}
        />
      ) : pageBooks.length === 0 ? (
        <NoResults
          icon={SearchX}
          title={t('books.empty.title')}
          description={t('books.empty.description')}
          action={
            <Button size="sm" variant="outline" onClick={clearFilters}>
              {t('books.empty.clearFilters')}
            </Button>
          }
        />
      ) : (
          <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          aria-busy={isFetching || undefined}
        >
          {pageBooks.map((book) => (
            <BookCard
              key={book.id}
              bookId={book.id}
              title={book.title}
              author={book.author}
              category={book.category}
              available={book.available}
              shelfLocation={book.shelf_location}
              coverImageUrl={book.cover_image_url || (book.isbn ? `/covers/${book.isbn}.jpeg` : null)}
              averageRating={book.average_rating}
              reviewCount={book.review_count}
              description={book.description}
              href={ROUTES.BOOK_DETAILS.replace(':bookId', book.id)}
              onReserve={() => handleReserve(book.id, book.title)}
              isWishlisted={isWishlisted(book.id)}
              onToggleWishlist={() => toggleWishlist(book.id)}
            />
          ))}
        </div>
      )}

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalItems={total}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      <WishlistDrawer
        open={isWishlistOpen}
        onClose={() => setIsWishlistOpen(false)}
        books={wishlistedBooks}
        onRemove={toggleWishlist}
      />

      {role === 'member' && (
        <FindMyNextBookModal open={isQuizOpen} onClose={() => setIsQuizOpen(false)} />
      )}
    </div>
  );
}
