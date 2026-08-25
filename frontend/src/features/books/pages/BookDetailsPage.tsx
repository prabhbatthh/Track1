import { ArrowLeft, BookOpen, Heart, MapPin, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { BookCard, DifficultyBadge } from '@/components/common';
import { ErrorState, LoadingState } from '@/components/feedback';
import { Badge, Button, Card, CardContent, EmptyState } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { ApiError, getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useAuth } from '@/providers/AuthProvider';

import { useBookInsightsQuery, useBookQuery, useRelatedBooksQuery } from '../hooks/useBooks';
import { useWishlist } from '../hooks/useWishlist';

export function BookDetailsPage() {
  const { t } = useTranslation();
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const { reserveBook } = useAuth();
  const { data: book, isLoading, error, refetch } = useBookQuery(bookId);
  const { data: relatedBooks = [] } = useRelatedBooksQuery(bookId);
  const {
    data: insights,
    isLoading: insightsLoading,
    isError: insightsError,
  } = useBookInsightsQuery(bookId);
  const { isWishlisted, toggleWishlist } = useWishlist();

  async function handleReserve() {
    if (!book) return;
    try {
      await reserveBook(book.id);
      // Requesting to borrow doesn't hold a copy — the book stays visible as available
      // to others until a manager approves the request.
      toast.success(t('books.details.reserveSuccessToast', { title: book.title }));
    } catch (error) {
      toast.error(getErrorMessage(error, t('common.errors.generic')));
    }
  }

  if (isLoading) return <LoadingState variant="page" label="Loading book details" />;

  if (error && (!(error instanceof ApiError) || error.status !== 404)) {
    return (
      <ErrorState
        description={getErrorMessage(error, t('common.errors.generic'))}
        onRetry={() => void refetch()}
      />
    );
  }

  if (!book) {
    return (
      <EmptyState
        title={t('books.details.notFound.title')}
        description={t('books.details.notFound.description')}
        action={
          <Button variant="outline" onClick={() => navigate(ROUTES.BOOKS)}>
            {t('books.details.backToBooks')}
          </Button>
        }
      />
    );
  }

  const bookCoverUrl = book.cover_image_url || (book.isbn ? `/covers/${book.isbn}.jpeg` : null);

  return (
    <div className="flex flex-col gap-6">
      <Link
        to={ROUTES.BOOKS}
        className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> {t('books.details.backToBooks')}
      </Link>

      <Card>
        <CardContent className="flex flex-col gap-6 p-6 md:flex-row">
          {bookCoverUrl ? (
            <div className="flex w-full shrink-0 items-center justify-center rounded-md bg-muted/30 md:w-52">
              <img
                src={bookCoverUrl}
                alt=""
                onError={(e) => {
                  const parent = (e.target as HTMLElement).parentElement;
                  if (parent) parent.style.display = 'none';
                }}
                className="w-full rounded-md object-contain"
              />
            </div>
          ) : (
            <div className="flex h-64 w-full items-center justify-center rounded-md bg-primary/10 text-primary md:w-52 md:shrink-0">
              <BookOpen className="size-12" />
            </div>
          )}

          <div className="flex flex-1 flex-col gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">{book.title}</h1>
              <p className="text-muted-foreground">{book.author}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{book.category}</Badge>
              <Badge variant={book.available ? 'success' : 'danger'}>
                {book.available ? t('books.status.available') : t('books.status.checkedOut')}
              </Badge>
              {insights && <DifficultyBadge difficulty={insights.difficulty} />}
            </div>

            <p className="text-sm text-muted-foreground">{book.description}</p>

            <p className="text-sm text-muted-foreground">
              {t('books.details.copiesAvailable', { total: book.total_copies })}
            </p>

            {(() => {
              const charCode = book?.id ? book.id.charCodeAt(0) : 65;
              const firstLetter = book?.category ? book.category.charAt(0).toUpperCase() : 'A';
              const displayShelf =
                book.shelf_location || `Floor 1, Shelf ${firstLetter}-${(charCode % 12) + 1}`;
              return (
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <MapPin className="size-4 text-primary shrink-0" />
                  <span>{displayShelf}</span>
                </p>
              );
            })()}

            <div className="flex gap-2">
              <Button disabled={!book.available} onClick={handleReserve}>
                {t('books.details.reserveButton')}
              </Button>
              <Button
                variant="outline"
                leadingIcon={
                  <Heart className={cn('size-4', isWishlisted(book.id) && 'fill-danger text-danger')} />
                }
                onClick={() => toggleWishlist(book.id)}
              >
                {t(isWishlisted(book.id) ? 'books.wishlist.remove' : 'books.wishlist.add')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 shrink-0 text-primary" />
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              {t('books.details.aiInsights.heading')}
            </p>
          </div>

          {insightsLoading && (
            <p className="text-sm text-muted-foreground">{t('books.details.aiInsights.loading')}</p>
          )}

          {!insightsLoading && (insightsError || insights === null) && (
            <p className="text-sm text-muted-foreground">
              {t('books.details.aiInsights.unavailable')}
            </p>
          )}

          {!insightsLoading && insights && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-foreground">{insights.summary}</p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {insights.key_concepts.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t('books.details.aiInsights.keyConcepts')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {insights.key_concepts.map((concept) => (
                        <Badge key={concept} variant="outline">
                          {concept}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {insights.themes.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t('books.details.aiInsights.themes')}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {insights.themes.map((theme) => (
                        <Badge key={theme} variant="outline">
                          {theme}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {t('books.details.aiInsights.vocabulary')}: {insights.vocabulary_complexity}
                </span>
                {insights.technical_difficulty !== 'Unknown' && (
                  <span>
                    · {t('books.details.aiInsights.technicalDifficulty')}:{' '}
                    {insights.technical_difficulty}
                  </span>
                )}
              </div>

              {insights.prerequisites.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t('books.details.aiInsights.prerequisites')}: {insights.prerequisites.join(', ')}
                </p>
              )}

              <p className="text-sm text-foreground">
                <span className="font-medium">{t('books.details.aiInsights.whyRead')}: </span>
                {insights.why_read}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {relatedBooks.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            {t('books.details.relatedBooks.title')}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {relatedBooks.map((related) => (
              <BookCard
                key={related.id}
                bookId={related.id}
                title={related.title}
                author={related.author}
                category={related.category}
                available={related.available}
                shelfLocation={related.shelf_location}
                coverImageUrl={related.cover_image_url}
                averageRating={related.average_rating}
                reviewCount={related.review_count}
                description={related.description}
                href={ROUTES.BOOK_DETAILS.replace(':bookId', related.id)}
                isWishlisted={isWishlisted(related.id)}
                onToggleWishlist={() => toggleWishlist(related.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
