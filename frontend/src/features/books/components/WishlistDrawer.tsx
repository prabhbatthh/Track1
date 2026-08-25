import { Heart, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Drawer, EmptyState } from '@/components/ui';
import { ROUTES } from '@/constants/routes';

import type { Book } from '../hooks/useBooks';

export interface WishlistDrawerProps {
  open: boolean;
  onClose: () => void;
  books: Book[];
  onRemove: (bookId: string) => void;
}

export function WishlistDrawer({ open, onClose, books, onRemove }: WishlistDrawerProps) {
  const { t } = useTranslation();

  return (
    <Drawer open={open} onClose={onClose} title={t('books.wishlist.drawerTitle')}>
      {books.length === 0 ? (
        <EmptyState
          icon={Heart}
          title={t('books.wishlist.empty.title')}
          description={t('books.wishlist.empty.description')}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {books.map((book) => (
            <li
              key={book.id}
              className="flex items-center gap-3 rounded-md border border-border p-3"
            >
              <Link
                to={ROUTES.BOOK_DETAILS.replace(':bookId', book.id)}
                onClick={onClose}
                className="min-w-0 flex-1"
              >
                <p className="truncate text-sm font-medium text-foreground">{book.title}</p>
                <p className="truncate text-xs text-muted-foreground">{book.author}</p>
              </Link>
              <button
                type="button"
                onClick={() => onRemove(book.id)}
                aria-label={t('books.wishlist.removeAria', { title: book.title })}
                className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-danger"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
