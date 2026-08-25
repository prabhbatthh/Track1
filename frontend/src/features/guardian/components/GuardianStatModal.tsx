import { BookOpen, IndianRupee, UserCheck, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Pagination } from '@/components/common';
import { Avatar, Badge, Button, EmptyState, Modal } from '@/components/ui';
import { usePagination } from '@/hooks';
import { formatCurrency, formatDate } from '@/lib/format';
import type { GuardianChild, ReadingProgressEntry } from '@/providers/AuthProvider';

export type GuardianStatKey =
  | 'linkedChildren'
  | 'currentlyInLibrary'
  | 'booksBorrowed'
  | 'totalDues';

export interface GuardianStatModalProps {
  statKey: GuardianStatKey | null;
  onClose: () => void;
  childrenList: GuardianChild[];
  onPayFine?: (childId: string) => Promise<void>;
}

const STAT_TITLE_KEYS: Record<GuardianStatKey, string> = {
  linkedChildren: 'guardian.stats.linkedChildren',
  currentlyInLibrary: 'guardian.stats.currentlyInLibrary',
  booksBorrowed: 'guardian.stats.booksBorrowed',
  totalDues: 'guardian.stats.totalDues',
};

function LinkedChildrenBody({ childrenList = [] }: { childrenList?: GuardianChild[] }) {
  const { t } = useTranslation();
  const list = childrenList || [];
  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(list, 5);

  if (list.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={t('guardian.statModal.linkedChildren.emptyTitle', {
          defaultValue: 'No linked children found',
        })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {paginatedItems.map((child) => (
          <li
            key={child.id}
            className="flex items-center justify-between rounded-lg border border-border bg-surface p-3 text-sm"
          >
            <div className="flex items-center gap-3">
              <Avatar name={child.full_name || 'Child'} size="sm" />
              <div>
                <p className="font-semibold text-foreground">{child.full_name || 'Child'}</p>
                <p className="text-xs text-muted-foreground">{child.email}</p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant="outline">
                {child.currently_reading?.length || 0} reading · {child.completed?.length || 0} read
              </Badge>
              {child.subscription_expires_on && (
                <span className="text-xs text-muted-foreground">
                  Expires: {formatDate(child.subscription_expires_on)}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={5}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

function CurrentlyInLibraryBody({ childrenList = [] }: { childrenList?: GuardianChild[] }) {
  const { t } = useTranslation();
  // Server-side presence for children is 0 currently; lists empty state or present list
  const list = (childrenList || []).filter((c) => (c as unknown as { in_library?: boolean }).in_library);
  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(list, 5);

  if (list.length === 0) {
    return (
      <EmptyState
        icon={UserCheck}
        title={t('guardian.statModal.currentlyInLibrary.emptyTitle', {
          defaultValue: 'No children currently in the library',
        })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {paginatedItems.map((child) => (
          <li
            key={child.id}
            className="flex items-center justify-between rounded-lg border border-border bg-surface p-3 text-sm"
          >
            <div className="flex items-center gap-3">
              <Avatar name={child.full_name} size="sm" />
              <p className="font-semibold text-foreground">{child.full_name}</p>
            </div>
            <Badge variant="success">In Library</Badge>
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={5}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

interface BorrowedBookItem {
  id: string;
  childName: string;
  bookTitle: string;
  percentComplete: number;
}

function BooksBorrowedBody({ childrenList = [] }: { childrenList?: GuardianChild[] }) {
  const { t } = useTranslation();

  const borrowedBooks: BorrowedBookItem[] = (childrenList || []).flatMap((child) =>
    (child.currently_reading || []).map((b: ReadingProgressEntry) => ({
      id: b.id,
      childName: child.full_name,
      bookTitle: b.book_title || 'Book',
      percentComplete: b.percent_complete || 0,
    })),
  );

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(
    borrowedBooks,
    5,
  );

  if (borrowedBooks.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title={t('guardian.statModal.booksBorrowed.emptyTitle', {
          defaultValue: 'No active borrowed books for linked children',
        })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {paginatedItems.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between rounded-lg border border-border bg-surface p-3 text-sm"
          >
            <div>
              <p className="font-semibold text-foreground">{item.bookTitle}</p>
              <p className="text-xs text-muted-foreground">Borrowed by: {item.childName}</p>
            </div>
            <Badge variant="outline">{item.percentComplete}% read</Badge>
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={5}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

function TotalDuesBody({
  childrenList = [],
  onPayFine,
}: {
  childrenList?: GuardianChild[];
  onPayFine?: (childId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const duesList = (childrenList || []).filter((c) => c && c.outstanding_fine > 0);
  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(duesList, 5);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handlePay(childId: string) {
    if (!onPayFine) return;
    setBusyId(childId);
    try {
      await onPayFine(childId);
    } finally {
      setBusyId(null);
    }
  }

  if (duesList.length === 0) {
    return (
      <EmptyState
        icon={IndianRupee}
        title={t('guardian.statModal.totalDues.emptyTitle', {
          defaultValue: 'No outstanding dues or fines',
        })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {paginatedItems.map((child) => (
          <li
            key={child.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground">{child.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {child.fine_book_title || 'Overdue fine'}
                </p>
              </div>
              <span className="font-semibold text-danger">
                {formatCurrency(child.outstanding_fine)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
              <span>{child.fine_due_date ? `Due: ${formatDate(child.fine_due_date)}` : ''}</span>
              {onPayFine && (
                <Button
                  size="sm"
                  isLoading={busyId === child.id}
                  onClick={() => handlePay(child.id)}
                >
                  Pay Fine
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={5}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

export function GuardianStatModal({
  statKey,
  onClose,
  childrenList,
  onPayFine,
}: GuardianStatModalProps) {
  const { t } = useTranslation();

  if (!statKey) return null;

  const titleKey = STAT_TITLE_KEYS[statKey];
  const title = titleKey ? t(titleKey) : statKey;

  return (
    <Modal open={statKey !== null} onClose={onClose} title={title}>
      {statKey === 'linkedChildren' && <LinkedChildrenBody childrenList={childrenList} />}
      {statKey === 'currentlyInLibrary' && <CurrentlyInLibraryBody childrenList={childrenList} />}
      {statKey === 'booksBorrowed' && <BooksBorrowedBody childrenList={childrenList} />}
      {statKey === 'totalDues' && (
        <TotalDuesBody childrenList={childrenList} onPayFine={onPayFine} />
      )}
    </Modal>
  );
}
