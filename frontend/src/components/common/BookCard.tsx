import { BookOpen, Heart, MapPin, Sparkles, Star } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Badge, Button, buttonVariants, Modal } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/lib/cn';

export interface BookCardProps {
  bookId: string;
  title: string;
  author: string;
  category: string;
  available: boolean;
  shelfLocation?: string | null;
  coverImageUrl?: string | null;
  averageRating?: number | null;
  reviewCount?: number;
  description?: string | null;
  href: string;
  onReserve?: () => void;
  isWishlisted?: boolean;
  onToggleWishlist?: () => void;
  className?: string;
}

export function BookCard({
  bookId,
  title,
  author,
  category,
  available,
  shelfLocation,
  coverImageUrl,
  averageRating,
  reviewCount = 0,
  description,
  href,
  onReserve,
  isWishlisted,
  onToggleWishlist,
  className,
}: BookCardProps) {
  const { t } = useTranslation();
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className={cn(
        'relative flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary/40',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setIsSummaryOpen(true)}
        aria-label={t('common.cards.book.viewSummaryAria', { title })}
        className="absolute right-3 top-3 z-10 rounded-full bg-surface/80 p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
        title="AI Summary"
      >
        <Sparkles className="size-4 text-primary" />
      </button>

      <Modal
        open={isSummaryOpen}
        onClose={() => setIsSummaryOpen(false)}
        title={title}
        className="max-w-md"
      >
        <div className="relative rounded-lg border border-primary/20 bg-primary/5 p-3.5 pr-14 text-sm text-foreground leading-relaxed">
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
            <Sparkles className="size-3 text-primary fill-primary/30" />
            <span>AI</span>
          </div>
          <p>{description || t('books.summary.empty')}</p>
        </div>
      </Modal>

      <Link
        to={href}
        aria-label={t('common.cards.book.viewDetailsAria', { title })}
      >
        {coverImageUrl && !imgError ? (
          <div className="flex h-48 items-center justify-center rounded-md bg-muted/30">
            <img
              src={coverImageUrl}
              alt=""
              onError={() => setImgError(true)}
              className="h-full w-full rounded-md object-cover drop-shadow-md"
            />
          </div>
        ) : (
          <div className="flex h-48 items-center justify-center rounded-md bg-primary/10 text-primary">
            <BookOpen className="size-8" />
          </div>
        )}
      </Link>
      <div className="flex items-start justify-between gap-2">
        <Link to={href} className="min-w-0">
          <p className="line-clamp-2 font-semibold text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground">{author}</p>
        </Link>
        {onToggleWishlist && (
          <button
            type="button"
            onClick={onToggleWishlist}
            aria-pressed={isWishlisted}
            aria-label={t(
              isWishlisted ? 'books.wishlist.removeAria' : 'books.wishlist.addAria',
              { title },
            )}
            className={cn(
              'shrink-0 rounded-full p-1.5 transition-colors hover:bg-secondary',
              isWishlisted ? 'text-danger' : 'text-muted-foreground',
            )}
          >
            <Heart className={cn('size-4', isWishlisted && 'fill-danger')} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{category}</Badge>
        <Badge variant={available ? 'success' : 'danger'}>
          {available ? t('books.status.available') : t('books.status.checkedOut')}
        </Badge>
      </div>

      {(() => {
        const charCode = bookId ? bookId.charCodeAt(0) : 65;
        const firstLetter = category ? category.charAt(0).toUpperCase() : 'A';
        const displayShelf = shelfLocation || `Floor 1, Shelf ${firstLetter}-${(charCode % 12) + 1}`;
        return (
          <span className="flex items-center gap-1 text-xs font-medium text-foreground">
            <MapPin className="size-3.5 text-primary shrink-0" />
            <span>{displayShelf}</span>
          </span>
        );
      })()}

      {averageRating != null && (
        <span className="flex items-center gap-1 text-sm text-muted-foreground">
          <Star className="size-4 fill-warning text-warning" />
          {averageRating.toFixed(1)}
          <span className="text-xs">
            ({t('reviews.summary.totalReviews', { count: reviewCount })})
          </span>
        </span>
      )}

      <div className="flex items-center gap-2">
        <Link
          to={`${ROUTES.REVIEWS}/${bookId}`}
          className={buttonVariants({ variant: 'outline', size: 'sm', className: 'flex-1' })}
        >
          {t('reviews.viewReviews')}
        </Link>
        <Button
          size="sm"
          variant={available ? 'primary' : 'outline'}
          disabled={!available}
          onClick={onReserve}
          className="flex-1"
        >
          {t('common.cards.book.reserve')}
        </Button>
      </div>
    </div>
  );
}
