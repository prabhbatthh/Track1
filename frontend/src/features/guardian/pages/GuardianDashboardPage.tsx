import { BookOpen, HandCoins, MessageSquare, RefreshCw, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { PageHeader, QuickActionsCard, StatisticCard } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { LeaveLibraryReviewModal } from '@/features/reviews/components/LeaveLibraryReviewModal';
import { LibraryReviewCard } from '@/features/reviews/components/LibraryReviewCard';
import { RaiseTicketModal } from '@/features/support/components/RaiseTicketModal';
import { GUARDIAN_CATEGORIES } from '@/features/support/constants';
import { getErrorMessage } from '@/lib/api';
import { guardianStats } from '@/mocks/guardian';
import { useAuth, type ChildVisitStatus, type GuardianChild } from '@/providers/AuthProvider';

import { BorrowedBooksByChild } from '../components/BorrowedBooksByChild';
import { ChildrenPresence } from '../components/ChildrenPresence';
import { GuardianStatModal, type GuardianStatKey } from '../components/GuardianStatModal';
import { SeatReservationForChild } from '../components/SeatReservationForChild';
import { SubscriptionAndFines } from '../components/SubscriptionAndFines';

const STAT_KEY_MAP: Record<string, GuardianStatKey> = {
  'guardian.stats.linkedChildren': 'linkedChildren',
  'guardian.stats.currentlyInLibrary': 'currentlyInLibrary',
  'guardian.stats.booksBorrowed': 'booksBorrowed',
  'guardian.stats.totalDues': 'totalDues',
};

// ponytail: child identity always comes from the real GuardianLink/ReadingProgress
// tables now (getGuardianChildren) — GuardianChild has no presence/loan/fine fields
// server-side yet, so ChildrenPresence/BorrowedBooksByChild/SubscriptionAndFines get
// empty arrays and show their honest empty states instead of fabricated per-child data.
function ChildrenReadingProgress({ realChildren }: { realChildren: GuardianChild[] }) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('readingProgress.pageTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {realChildren.length === 0 ? (
          <p className="text-muted-foreground">{t('readingProgress.emptyState.title')}</p>
        ) : (
          realChildren.map((child) => (
            <div key={child.id} className="flex items-center justify-between gap-2">
              <span className="font-medium text-foreground">{child.full_name}</span>
              <span className="text-muted-foreground">
                {child.currently_reading.length} reading · {child.completed.length} completed
              </span>
            </div>
          ))
        )}
        <Link
          to={ROUTES.READING_PROGRESS}
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <BookOpen className="size-4" />
          {t('readingProgress.pageTitle')}
        </Link>
      </CardContent>
    </Card>
  );
}

export function GuardianDashboardPage() {
  const { t } = useTranslation();
  const { getGuardianChildren, getChildrenVisitStatus, payChildFines, renewChildSubscription } = useAuth();
  const [realChildren, setRealChildren] = useState<GuardianChild[]>([]);
  const [childrenVisitStatus, setChildrenVisitStatus] = useState<ChildVisitStatus[]>([]);
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [activeStat, setActiveStat] = useState<GuardianStatKey | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewRefreshKey, setReviewRefreshKey] = useState(0);

  function refreshChildren() {
    getGuardianChildren().then(setRealChildren).catch(() => setRealChildren([]));
    getChildrenVisitStatus().then(setChildrenVisitStatus).catch(() => setChildrenVisitStatus([]));
  }

  useEffect(refreshChildren, [getGuardianChildren, getChildrenVisitStatus]);

  const childrenWithFines = useMemo(
    () => realChildren.filter((child) => child.outstanding_fine > 0),
    [realChildren],
  );

  const currentlyInLibraryCount = useMemo(
    () => childrenVisitStatus.filter((c) => c.is_in_library).length,
    [childrenVisitStatus],
  );

  async function handlePayAllFines() {
    if (childrenWithFines.length === 0) {
      toast.info(t('guardian.subscription.noFine'));
      return;
    }
    try {
      await Promise.all(childrenWithFines.map((child) => payChildFines(child.id)));
      toast.success('Cash fine-payment requests sent to a manager');
      refreshChildren();
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    }
  }

  async function handleRenewAll() {
    if (realChildren.length === 0) {
      toast.info(t('guardian.subscription.emptyTitle'));
      return;
    }
    try {
      await Promise.all(realChildren.map((child) => renewChildSubscription(child.id)));
      toast.success('Renewal payment requests sent to a manager');
      refreshChildren();
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('guardian.pageTitle')} description={t('guardian.pageDescription')} />

      <h2 className="sr-only">{t('common.dashboardSectionsHeading')}</h2>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {guardianStats.map((stat) => {
          const statKey = STAT_KEY_MAP[stat.labelKey];
          return (
            <StatisticCard
              key={stat.labelKey}
              icon={stat.icon}
              label={t(stat.labelKey)}
              value={
                stat.labelKey === 'guardian.stats.linkedChildren'
                  ? String(realChildren.length)
                  : stat.labelKey === 'guardian.stats.currentlyInLibrary'
                  ? String(currentlyInLibraryCount)
                  : stat.value
              }
              onClick={() => setActiveStat(statKey)}
              selected={activeStat === statKey}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChildrenPresence children={childrenVisitStatus} />
        <BorrowedBooksByChild books={[]} children={[]} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SubscriptionAndFines children={realChildren} onChanged={refreshChildren} />
        <SeatReservationForChild children={realChildren} />
      </div>

      <ChildrenReadingProgress realChildren={realChildren} />

      <LibraryReviewCard onOpenModal={() => setIsReviewModalOpen(true)} refreshKey={reviewRefreshKey} />

      <QuickActionsCard
        actions={[
          {
            label: t('guardian.quickActions.payAllFines'),
            icon: HandCoins,
            onClick: handlePayAllFines,
          },
          {
            label: t('guardian.quickActions.renewSubscription'),
            icon: RefreshCw,
            onClick: handleRenewAll,
          },
          {
            label: t('guardian.quickActions.contactStaff'),
            icon: MessageSquare,
            onClick: () => setTicketModalOpen(true),
          },
          {
            label: t('dashboard.quickActions.writeReview', 'Write Library Review'),
            icon: Star,
            onClick: () => setIsReviewModalOpen(true),
          },
        ]}
      />

      <LeaveLibraryReviewModal
        open={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        onSubmitted={() => setReviewRefreshKey((key) => key + 1)}
      />

      <RaiseTicketModal
        open={ticketModalOpen}
        onClose={() => setTicketModalOpen(false)}
        categories={GUARDIAN_CATEGORIES}
        onCreated={() => toast.success(t('support.toasts.created'))}
      />

      <GuardianStatModal
        statKey={activeStat}
        onClose={() => setActiveStat(null)}
        childrenList={realChildren}
        onPayFine={async (childId) => {
          try {
            await payChildFines(childId);
            toast.success('Cash fine-payment request sent to a manager');
            refreshChildren();
          } catch (err) {
            toast.error(getErrorMessage(err, t('common.errors.generic')));
          }
        }}
      />
    </div>
  );
}
