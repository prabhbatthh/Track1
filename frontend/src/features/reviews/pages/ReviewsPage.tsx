import {
  MessageSquare,
  MessageSquareOff,
  Pencil,
  RotateCcw,
  Sparkles,
  Star,
  Trash2,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';

import { toast } from 'sonner';

import { PageTitle, Pagination, ReviewCard, StatisticCard } from '@/components/common';
import { ErrorState, LoadingState } from '@/components/feedback';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Dialog,
  EmptyState,
  SearchBar,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { ApiError, apiGet, getErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { usePagedList } from '@/lib/usePagedList';
import { useAuth, type BookReviews, type Review } from '@/providers/AuthProvider';

import type { Book } from '../../books/hooks/useBooks';
import { RatingSummary } from '../components/RatingSummary';
import { WriteReviewModal, type ReviewDraft } from '../components/WriteReviewModal';

const MEMBER_RATED_PAGE_SIZE = 6;
const MEMBER_REVIEWS_PAGE_SIZE = 6;
const BOOK_REVIEWS_PAGE_SIZE = 6;
const STAFF_REVIEWS_PAGE_SIZE = 10;

type RatingFilter = 'all' | '1' | '2' | '3' | '4' | '5';
type ReviewSort = 'newest' | 'oldest' | 'ratingHigh' | 'ratingLow';
type RatedSort = 'newest' | 'ratingHigh' | 'ratingLow' | 'titleAsc' | 'titleDesc';

function bookLink(bookId: string) {
  return ROUTES.BOOK_DETAILS.replace(':bookId', bookId);
}

const EMPTY_BOOK_REVIEWS: BookReviews = {
  items: [],
  average_rating: 0,
  total_reviews: 0,
  breakdown: [5, 4, 3, 2, 1].map((stars) => ({ stars, percent: 0 })),
  review_digest: null,
};

export function ReviewsPage() {
  const { t } = useTranslation();
  const { bookId: routeBookId } = useParams<{ bookId?: string }>();
  const {
    role,
    getBookReviews,
    getAllReviews,
    getMyReviews,
    createReview,
    updateReview,
    deleteReview,
  } = useAuth();

  const isStaff =
    role === 'admin' || role === 'manager' || role === 'librarian' || role === 'it-head';
  const canModerate = role === 'admin' || role === 'it-head';
  const isBookSpecificView = Boolean(routeBookId);

  // Book-specific state (when route is /reviews/:bookId)
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [bookReviews, setBookReviews] = useState<BookReviews>(EMPTY_BOOK_REVIEWS);

  // Staff moderation state (when route is /reviews and isStaff)
  const [allReviews, setAllReviews] = useState<Review[]>([]);
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all');
  const [reviewSort, setReviewSort] = useState<ReviewSort>('newest');

  // Personal Member state (when route is /reviews and !isStaff)
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [ratedSort, setRatedSort] = useState<RatedSort>('newest');

  // Modal / Action state
  const [isWriteReviewOpen, setIsWriteReviewOpen] = useState(false);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [deletingReviewId, setDeletingReviewId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const requestIdRef = useRef(0);

  // Determine active reviews list for deleting review target
  const activeReviewsList = isBookSpecificView
    ? bookReviews.items
    : isStaff
      ? allReviews
      : myReviews;
  const deletingReview = activeReviewsList.find((review) => review.id === deletingReviewId) ?? null;

  const loadCurrentView = useCallback(() => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setLoadError(null);

    if (routeBookId) {
      // 1. Book-specific View: Fetch book details & all reviews for that book
      Promise.all([apiGet<Book>(`/books/${routeBookId}`), getBookReviews(routeBookId)])
        .then(([book, reviewsData]) => {
          if (requestId !== requestIdRef.current) return;
          setSelectedBook(book);
          setBookReviews(reviewsData || EMPTY_BOOK_REVIEWS);
        })
        .catch((error) => {
          if (requestId === requestIdRef.current) setLoadError(error);
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setIsLoading(false);
        });
    } else if (isStaff) {
      // 2. Staff Catalog Moderation View: Fetch all reviews
      getAllReviews()
        .then((data) => {
          if (requestId === requestIdRef.current) setAllReviews(data);
        })
        .catch((error) => {
          if (requestId === requestIdRef.current) setLoadError(error);
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setIsLoading(false);
        });
    } else {
      // 3. Member Personal Dashboard View: Fetch member's own reviews
      getMyReviews()
        .then((data) => {
          if (requestId === requestIdRef.current) setMyReviews(data);
        })
        .catch((error) => {
          if (requestId === requestIdRef.current) setLoadError(error);
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setIsLoading(false);
        });
    }
  }, [getAllReviews, getBookReviews, getMyReviews, isStaff, routeBookId]);

  // Fetch data depending on route and user role.
  useEffect(() => {
    const timer = setTimeout(loadCurrentView, 0);
    return () => {
      clearTimeout(timer);
      requestIdRef.current += 1;
    };
  }, [loadCurrentView]);

  const refreshCurrentView = () => {
    if (routeBookId) {
      getBookReviews(routeBookId)
        .then(setBookReviews)
        .catch(() => {});
    } else if (isStaff) {
      getAllReviews()
        .then(setAllReviews)
        .catch(() => {});
    } else {
      getMyReviews()
        .then(setMyReviews)
        .catch(() => {});
    }
  };

  // Check if current user has an existing review for the selected book
  const ownReviewForSelectedBook = useMemo(() => {
    if (!isBookSpecificView) return null;
    return bookReviews.items.find((r) => r.is_own) ?? null;
  }, [isBookSpecificView, bookReviews.items]);

  // Book-specific reviews pagination
  const {
    page: bookReviewsPage,
    setPage: setBookReviewsPage,
    totalPages: bookReviewsTotalPages,
    pageItems: pagedBookReviews,
  } = usePagedList(bookReviews.items, BOOK_REVIEWS_PAGE_SIZE);

  // Staff analytics
  const booksReviewed = useMemo(
    () => new Set(allReviews.map((review) => review.book_title)).size,
    [allReviews],
  );
  const averageRating = useMemo(
    () =>
      allReviews.length === 0
        ? 0
        : allReviews.reduce((sum, review) => sum + review.rating, 0) / allReviews.length,
    [allReviews],
  );

  // Staff visible reviews
  const staffVisibleReviews = useMemo(() => {
    if (!isStaff || isBookSpecificView) return [];

    const filtered =
      ratingFilter === 'all'
        ? allReviews
        : allReviews.filter((review) => review.rating === Number(ratingFilter));

    return [...filtered].sort((a, b) => {
      switch (reviewSort) {
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'ratingHigh':
          return b.rating - a.rating;
        case 'ratingLow':
          return a.rating - b.rating;
        case 'newest':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  }, [isStaff, isBookSpecificView, allReviews, ratingFilter, reviewSort]);

  const {
    page: staffPage,
    setPage: setStaffPage,
    totalPages: staffTotalPages,
    pageItems: staffPagedReviews,
  } = usePagedList(staffVisibleReviews, STAFF_REVIEWS_PAGE_SIZE);

  // Member rated books filtering & sorting
  const filteredRatedBooks = useMemo(() => {
    if (isStaff || isBookSpecificView) return [];

    let result = myReviews;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((r) => r.book_title.toLowerCase().includes(q));
    }

    return [...result].sort((a, b) => {
      switch (ratedSort) {
        case 'ratingHigh':
          return b.rating - a.rating;
        case 'ratingLow':
          return a.rating - b.rating;
        case 'titleAsc':
          return a.book_title.localeCompare(b.book_title);
        case 'titleDesc':
          return b.book_title.localeCompare(a.book_title);
        case 'newest':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  }, [isStaff, isBookSpecificView, myReviews, searchQuery, ratedSort]);

  const {
    page: ratedPage,
    setPage: setRatedPage,
    totalPages: ratedTotalPages,
    pageItems: pagedRatedBooks,
  } = usePagedList(filteredRatedBooks, MEMBER_RATED_PAGE_SIZE);

  // Member written reviews (with comment text)
  const writtenReviews = useMemo(() => {
    if (isStaff || isBookSpecificView) return [];
    return myReviews.filter((r) => r.comment && r.comment.trim().length > 0);
  }, [isStaff, isBookSpecificView, myReviews]);

  const {
    page: reviewsPageNum,
    setPage: setReviewsPageNum,
    totalPages: reviewsTotalPages,
    pageItems: pagedWrittenReviews,
  } = usePagedList(writtenReviews, MEMBER_REVIEWS_PAGE_SIZE);

  async function handleSubmitReview(draft: ReviewDraft) {
    try {
      if (editingReview) {
        await updateReview(editingReview.id, draft);
        setEditingReview(null);
      } else {
        await createReview(draft.bookId, draft);
        setIsWriteReviewOpen(false);
      }
      refreshCurrentView();
      toast.success(t('common.success.saved', 'Review saved successfully'));
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    }
  }

  function closeReviewModal() {
    setIsWriteReviewOpen(false);
    setEditingReview(null);
  }

  async function confirmDeleteReview() {
    if (!deletingReview) return;
    try {
      await deleteReview(deletingReview.id);
      setDeletingReviewId(null);
      refreshCurrentView();
      toast.success(t('common.success.deleted', 'Review deleted'));
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    }
  }

  function resetRatedControls() {
    setSearchQuery('');
    setRatedSort('newest');
    setRatedPage(1);
  }

  // Pre-filled initial values for WriteReviewModal when writing/editing
  const modalInitialValues = useMemo(() => {
    if (editingReview) {
      return {
        bookId: editingReview.book_id,
        bookTitle: editingReview.book_title,
        bookAuthor: editingReview.book_author,
        rating: editingReview.rating,
        comment: editingReview.comment,
        images: editingReview.images,
      };
    }
    if (isBookSpecificView && selectedBook) {
      if (ownReviewForSelectedBook) {
        return {
          bookId: ownReviewForSelectedBook.book_id,
          bookTitle: ownReviewForSelectedBook.book_title,
          bookAuthor: ownReviewForSelectedBook.book_author,
          rating: ownReviewForSelectedBook.rating,
          comment: ownReviewForSelectedBook.comment,
          images: ownReviewForSelectedBook.images,
        };
      }
      return {
        bookId: selectedBook.id,
        bookTitle: selectedBook.title,
        bookAuthor: selectedBook.author,
        rating: 0,
        comment: '',
        images: [],
      };
    }
    return undefined;
  }, [editingReview, isBookSpecificView, selectedBook, ownReviewForSelectedBook]);

  return (
    <div className="flex flex-col gap-8">
      {isLoading ? (
        <LoadingState variant="page" label="Loading reviews" />
      ) : loadError ? (
        <ErrorState
          className="min-h-64"
          title={
            loadError instanceof ApiError && loadError.status === 404 ? 'Book not found' : undefined
          }
          description={
            loadError instanceof ApiError && loadError.status === 404
              ? 'The review page you requested does not match an existing book.'
              : getErrorMessage(loadError, t('common.errors.generic'))
          }
          onRetry={loadCurrentView}
        />
      ) : (
        <>
          {/* 1. Book-Specific View (/reviews/:bookId) */}
          {isBookSpecificView ? (
            <>
              <PageTitle
                title={t('reviews.pageTitle', 'Book Reviews')}
                description={
                  selectedBook ? (
                    <>
                      <Link
                        to={bookLink(selectedBook.id)}
                        className="font-semibold text-primary hover:underline"
                      >
                        {selectedBook.title}
                      </Link>{' '}
                      <span className="text-muted-foreground">
                        {t('reviews.byAuthor', { author: selectedBook.author })}
                      </span>
                    </>
                  ) : undefined
                }
                actions={
                  <Button onClick={() => setIsWriteReviewOpen(true)}>
                    {t('reviews.writeReview')}
                  </Button>
                }
              />

              <RatingSummary
                averageRating={bookReviews.average_rating}
                totalReviews={bookReviews.total_reviews}
                breakdown={bookReviews.breakdown}
              />

              {bookReviews.review_digest && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardContent className="flex gap-3 p-4">
                    <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div className="flex flex-col gap-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                        {t('reviews.digest.heading', 'What readers are saying')}
                      </p>
                      <p className="text-sm text-foreground">{bookReviews.review_digest}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex flex-col gap-4">
                <h2 className="text-xl font-bold text-foreground">
                  {t('reviews.commentsHeading', 'Comments')}
                </h2>

                {bookReviews.items.length === 0 ? (
                  <EmptyState
                    icon={MessageSquareOff}
                    title={t('reviews.empty.title', 'No reviews yet')}
                    description={t(
                      'reviews.empty.description',
                      'Be the first to share what you thought of this book.',
                    )}
                  />
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      {pagedBookReviews.map((review) => (
                        <ReviewCard
                          key={review.id}
                          name={review.reviewer_name}
                          avatarUrl={review.reviewer_avatar_url}
                          role={formatDate(review.created_at)}
                          quote={review.comment}
                          rating={review.rating}
                          images={review.images}
                          onEdit={review.is_own ? () => setEditingReview(review) : undefined}
                          onDelete={
                            canModerate || review.is_own
                              ? () => setDeletingReviewId(review.id)
                              : undefined
                          }
                        />
                      ))}
                    </div>

                    <Pagination
                      currentPage={bookReviewsPage}
                      totalPages={bookReviewsTotalPages}
                      totalItems={bookReviews.items.length}
                      pageSize={BOOK_REVIEWS_PAGE_SIZE}
                      onPageChange={setBookReviewsPage}
                    />
                  </div>
                )}
              </div>
            </>
          ) : isStaff ? (
            /* 2. Staff Catalog Moderation View (/reviews for staff) */
            <>
              <PageTitle
                title={t('reviews.pageTitle')}
                description={t('reviews.admin.pageDescription')}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatisticCard
                  icon={MessageSquare}
                  label={t('reviews.admin.stats.totalReviews')}
                  value={String(allReviews.length)}
                />
                <StatisticCard
                  icon={Star}
                  label={t('reviews.admin.stats.averageRating')}
                  value={averageRating.toFixed(1)}
                />
                <StatisticCard
                  icon={Users}
                  label={t('reviews.admin.stats.booksReviewed')}
                  value={String(booksReviewed)}
                />
              </div>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <h2 className="text-lg font-semibold text-foreground">
                    {t('reviews.commentsHeading')}
                  </h2>

                  {allReviews.length > 0 && (
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Select
                        label={t('reviews.admin.filters.ratingLabel')}
                        value={ratingFilter}
                        onChange={(event) => {
                          setRatingFilter(event.target.value as RatingFilter);
                          setStaffPage(1);
                        }}
                        className="w-full sm:w-40"
                        options={[
                          { value: 'all', label: t('reviews.admin.filters.ratingAll') },
                          ...[5, 4, 3, 2, 1].map((stars) => ({
                            value: String(stars),
                            label: t('reviews.admin.filters.ratingValue', { count: stars }),
                          })),
                        ]}
                      />

                      <Select
                        label={t('reviews.admin.sort.label')}
                        value={reviewSort}
                        onChange={(event) => {
                          setReviewSort(event.target.value as ReviewSort);
                          setStaffPage(1);
                        }}
                        className="w-full sm:w-44"
                        options={[
                          { value: 'newest', label: t('reviews.admin.sort.newest') },
                          { value: 'oldest', label: t('reviews.admin.sort.oldest') },
                          { value: 'ratingHigh', label: t('reviews.admin.sort.ratingHigh') },
                          { value: 'ratingLow', label: t('reviews.admin.sort.ratingLow') },
                        ]}
                      />
                    </div>
                  )}
                </div>

                {staffVisibleReviews.length === 0 ? (
                  <EmptyState
                    icon={MessageSquareOff}
                    title={t('reviews.empty.title')}
                    description={t('reviews.empty.description')}
                  />
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {staffPagedReviews.map((review) => (
                      <ReviewCard
                        key={review.id}
                        name={review.reviewer_name}
                        avatarUrl={review.reviewer_avatar_url}
                        role={
                          <>
                            {formatDate(review.created_at)} ·{' '}
                            <Link to={bookLink(review.book_id)} className="hover:underline">
                              {review.book_title}
                            </Link>
                          </>
                        }
                        quote={review.comment}
                        rating={review.rating}
                        images={review.images}
                        onEdit={review.is_own ? () => setEditingReview(review) : undefined}
                        onDelete={canModerate ? () => setDeletingReviewId(review.id) : undefined}
                      />
                    ))}
                  </div>
                )}

                {staffVisibleReviews.length > 0 && (
                  <Pagination
                    currentPage={staffPage}
                    totalPages={staffTotalPages}
                    totalItems={staffVisibleReviews.length}
                    pageSize={STAFF_REVIEWS_PAGE_SIZE}
                    onPageChange={setStaffPage}
                  />
                )}
              </div>
            </>
          ) : (
            /* 3. Member Personal Dashboard View (/reviews for regular member) */
            <>
              <PageTitle
                title={t('reviews.pageTitle')}
                actions={
                  <Button onClick={() => setIsWriteReviewOpen(true)}>
                    {t('reviews.writeReview')}
                  </Button>
                }
              />

              <div className="flex flex-col gap-10">
                {/* Part 1: Member's Rated Books — Rating Table */}
                <section className="flex flex-col gap-4">
                  <h2 className="text-xl font-bold text-foreground">
                    {t('reviews.member.ratedBooksHeading', 'My Rated Books')}
                  </h2>

                  {myReviews.length === 0 ? (
                    <Card>
                      <CardContent className="p-8 text-center">
                        <p className="text-muted-foreground">
                          {t('reviews.member.noRatings', 'No books rated yet.')}
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="w-full sm:w-72">
                          <SearchBar
                            value={searchQuery}
                            onChange={(val) => {
                              setSearchQuery(val);
                              setRatedPage(1);
                            }}
                            placeholder={t(
                              'reviews.member.searchPlaceholder',
                              'Search rated books by title...',
                            )}
                          />
                        </div>

                        <div className="flex items-end gap-3">
                          <Select
                            label={t('reviews.member.sort.label', 'Sort by')}
                            value={ratedSort}
                            onChange={(e) => {
                              setRatedSort(e.target.value as RatedSort);
                              setRatedPage(1);
                            }}
                            className="w-48"
                            options={[
                              {
                                value: 'newest',
                                label: t('reviews.member.sort.newest', 'Newest first'),
                              },
                              {
                                value: 'ratingHigh',
                                label: t('reviews.member.sort.ratingHigh', 'Highest rating'),
                              },
                              {
                                value: 'ratingLow',
                                label: t('reviews.member.sort.ratingLow', 'Lowest rating'),
                              },
                              {
                                value: 'titleAsc',
                                label: t('reviews.member.sort.titleAsc', 'Title (A–Z)'),
                              },
                              {
                                value: 'titleDesc',
                                label: t('reviews.member.sort.titleDesc', 'Title (Z–A)'),
                              },
                            ]}
                          />

                          {(searchQuery || ratedSort !== 'newest') && (
                            <button
                              type="button"
                              onClick={resetRatedControls}
                              aria-label="Reset filters"
                              title="Reset filters"
                              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            >
                              <RotateCcw className="size-4" />
                            </button>
                          )}
                        </div>
                      </CardHeader>

                      <CardContent className="p-0">
                        {filteredRatedBooks.length === 0 ? (
                          <div className="p-6 text-center text-sm text-muted-foreground">
                            No books found matching &quot;{searchQuery}&quot;.
                          </div>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>{t('reviews.member.table.book', 'Book')}</TableHead>
                                <TableHead>{t('reviews.member.table.author', 'Author')}</TableHead>
                                <TableHead>
                                  {t('reviews.member.table.rating', 'My Rating')}
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {pagedRatedBooks.map((review) => (
                                <TableRow key={review.id}>
                                  <TableCell className="font-medium">
                                    <Link
                                      to={bookLink(review.book_id)}
                                      className="text-primary hover:underline"
                                    >
                                      {review.book_title}
                                    </Link>
                                  </TableCell>
                                  <TableCell className="text-muted-foreground">
                                    {review.book_author || '—'}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-1.5">
                                      <div
                                        className="flex"
                                        role="img"
                                        aria-label={`Rated ${review.rating} out of 5`}
                                      >
                                        {Array.from({ length: 5 }, (_, i) => (
                                          <Star
                                            key={i}
                                            className={`size-4 ${
                                              i < review.rating
                                                ? 'fill-warning text-warning'
                                                : 'text-border'
                                            }`}
                                          />
                                        ))}
                                      </div>
                                      <span className="text-xs font-semibold text-foreground">
                                        {review.rating.toFixed(1)} ★
                                      </span>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </CardContent>

                      {filteredRatedBooks.length > 0 && (
                        <div className="p-4 border-t border-border">
                          <Pagination
                            currentPage={ratedPage}
                            totalPages={ratedTotalPages}
                            totalItems={filteredRatedBooks.length}
                            pageSize={MEMBER_RATED_PAGE_SIZE}
                            onPageChange={setRatedPage}
                          />
                        </div>
                      )}
                    </Card>
                  )}
                </section>

                {/* Part 2: Member's Written Reviews */}
                <section className="flex flex-col gap-4">
                  <h2 className="text-xl font-bold text-foreground">
                    {t('reviews.member.writtenReviewsHeading', 'My Reviews')}
                  </h2>

                  {writtenReviews.length === 0 ? (
                    <Card>
                      <CardContent className="p-8 text-center">
                        <p className="text-muted-foreground">
                          {t(
                            'reviews.member.noWrittenReviews',
                            "You haven't written any reviews yet.",
                          )}
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="flex flex-col gap-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        {pagedWrittenReviews.map((review) => (
                          <Card key={review.id} className="flex flex-col justify-between">
                            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-2">
                              <div className="flex flex-col gap-0.5">
                                <Link
                                  to={bookLink(review.book_id)}
                                  className="text-base font-bold text-foreground hover:text-primary hover:underline"
                                >
                                  {review.book_title}
                                </Link>
                                <p className="text-xs font-medium text-muted-foreground">
                                  {t('reviews.byAuthor', { author: review.book_author })}
                                </p>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setEditingReview(review)}
                                  aria-label={t('common.cards.review.editReview', 'Edit review')}
                                  className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                >
                                  <Pencil className="size-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingReviewId(review.id)}
                                  aria-label={t(
                                    'common.cards.review.deleteReview',
                                    'Delete review',
                                  )}
                                  className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              </div>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-2 pt-0">
                              <div className="flex items-center gap-1.5">
                                <div className="flex">
                                  {Array.from({ length: 5 }, (_, i) => (
                                    <Star
                                      key={i}
                                      className={`size-4 ${
                                        i < review.rating
                                          ? 'fill-warning text-warning'
                                          : 'text-border'
                                      }`}
                                    />
                                  ))}
                                </div>
                                <span className="text-xs font-semibold text-foreground">
                                  {review.rating.toFixed(1)}
                                </span>
                              </div>

                              <blockquote className="text-sm text-foreground italic border-l-2 border-primary/40 pl-3 py-0.5">
                                &ldquo;{review.comment}&rdquo;
                              </blockquote>

                              {review.images && review.images.length > 0 && (
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {review.images.map((src, idx) => (
                                    <img
                                      key={idx}
                                      src={src}
                                      alt=""
                                      className="size-14 rounded-md border border-border object-cover"
                                    />
                                  ))}
                                </div>
                              )}

                              <p className="text-xs text-muted-foreground pt-1">
                                {formatDate(review.created_at)}
                              </p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>

                      <Pagination
                        currentPage={reviewsPageNum}
                        totalPages={reviewsTotalPages}
                        totalItems={writtenReviews.length}
                        pageSize={MEMBER_REVIEWS_PAGE_SIZE}
                        onPageChange={setReviewsPageNum}
                      />
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </>
      )}

      <WriteReviewModal
        open={isWriteReviewOpen || editingReview !== null}
        onClose={closeReviewModal}
        onSubmit={handleSubmitReview}
        initialValues={modalInitialValues}
      />

      <Dialog
        open={deletingReview !== null}
        onClose={() => setDeletingReviewId(null)}
        title={t('reviews.deleteDialog.title')}
        description={t('reviews.deleteDialog.description')}
        confirmLabel={t('reviews.deleteDialog.confirmLabel')}
        confirmVariant="danger"
        onConfirm={confirmDeleteReview}
      />
    </div>
  );
}
