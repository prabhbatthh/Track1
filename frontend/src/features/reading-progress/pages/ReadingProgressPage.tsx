import { Award, Flame, Target } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageTitle, ProgressBar } from '@/components/common';
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui';
import {
  useAuth,
  type GuardianChild,
  type ReadingGoal,
  type ReadingProgressEntry,
  type ReadingStreak,
} from '@/providers/AuthProvider';

import { BookProgressList } from '../components/BookProgressList';
import { SetReadingGoalModal } from '../components/SetReadingGoalModal';
import { ShareCertificateModal } from '../components/ShareCertificateModal';

function toProgressBooks(entries: ReadingProgressEntry[]) {
  return entries.map((entry) => ({
    id: entry.id,
    title: entry.book_title,
    percentComplete: entry.percent_complete,
  }));
}

function GuardianReadingProgress() {
  const { t } = useTranslation();
  const { getGuardianChildren } = useAuth();
  const [children, setChildren] = useState<GuardianChild[]>([]);

  useEffect(() => {
    getGuardianChildren().then(setChildren).catch(() => setChildren([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title={t('readingProgress.pageTitle')}
        description={t('readingProgress.guardianPageDescription')}
      />

      {children.length === 0 ? (
        <EmptyState
          title={t('readingProgress.emptyState.title')}
          description={t('readingProgress.guardianPageDescription')}
        />
      ) : (
        children.map((child) => (
          <div key={child.id} className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-foreground">{child.full_name}</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <BookProgressList
                title={t('readingProgress.lists.currentlyReading.title')}
                books={toProgressBooks(child.currently_reading)}
                emptyDescription={t('readingProgress.lists.currentlyReading.emptyDescription')}
              />
              <BookProgressList
                title={t('readingProgress.lists.completed.title')}
                books={toProgressBooks(child.completed)}
                emptyDescription={t('readingProgress.lists.completed.emptyDescription')}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ponytail: "Want to Read" has no backend status yet (ReadingProgress is
// reading|completed only) — shows its real empty state rather than mock titles.
function MemberReadingProgress() {
  const { t } = useTranslation();
  const { fullName, getMyReadingProgress, getReadingGoal, getReadingStreak } = useAuth();
  const [progress, setProgress] = useState<ReadingProgressEntry[]>([]);
  const [goal, setGoal] = useState<ReadingGoal | null>(null);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [certificate, setCertificate] = useState<'yearly' | 'monthly' | null>(null);
  const [streak, setStreak] = useState<ReadingStreak>({
    current_streak_days: 0,
    longest_streak_days: 0,
  });

  useEffect(() => {
    getMyReadingProgress().then(setProgress).catch(() => setProgress([]));
    getReadingGoal().then(setGoal).catch(() => setGoal(null));
    getReadingStreak()
      .then(setStreak)
      .catch(() => setStreak({ current_streak_days: 0, longest_streak_days: 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentlyReading = useMemo(
    () => progress.filter((entry) => entry.status === 'reading'),
    [progress],
  );
  const completed = useMemo(
    () => progress.filter((entry) => entry.status === 'completed'),
    [progress],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title={t('readingProgress.pageTitle')}
        description={t('readingProgress.pageDescription')}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
            <div className="flex items-center gap-2">
              <Target className="size-5 text-primary" />
              <CardTitle>
                {t('readingProgress.readingGoal.title', { year: new Date().getFullYear() })}
              </CardTitle>
            </div>
            <Button size="sm" variant="outline" onClick={() => setGoalModalOpen(true)}>
              {goal ? 'Edit' : 'Set Goal'}
            </Button>
          </CardHeader>
          <CardContent>
            {goal ? (
              <div className="flex flex-col gap-3">
                <div>
                  <ProgressBar
                    percent={(goal.books_completed_this_year / goal.yearly_goal) * 100}
                  />
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {goal.books_completed_this_year} of {goal.yearly_goal} books this year
                  </p>
                  {goal.yearly_goal > 0 && goal.books_completed_this_year >= goal.yearly_goal && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      leadingIcon={<Award className="size-4" />}
                      onClick={() => setCertificate('yearly')}
                    >
                      {t('readingProgress.certificate.shareButton')}
                    </Button>
                  )}
                </div>
                <div>
                  <ProgressBar
                    percent={(goal.books_completed_this_month / goal.monthly_goal) * 100}
                  />
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {goal.books_completed_this_month} of {goal.monthly_goal} books this month
                  </p>
                  {goal.monthly_goal > 0 && goal.books_completed_this_month >= goal.monthly_goal && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      leadingIcon={<Award className="size-4" />}
                      onClick={() => setCertificate('monthly')}
                    >
                      {t('readingProgress.certificate.shareButton')}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                You haven't set a reading goal yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <Flame className="size-5 text-primary" />
            <CardTitle>{t('readingProgress.readingStreak.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-foreground">
              {t('readingProgress.readingStreak.currentDays', {
                count: streak.current_streak_days,
              })}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('readingProgress.readingStreak.longest', { count: streak.longest_streak_days })}
            </p>
          </CardContent>
        </Card>
      </div>

      <SetReadingGoalModal
        open={goalModalOpen}
        onClose={() => setGoalModalOpen(false)}
        currentGoal={goal}
        onSaved={setGoal}
      />

      {goal && certificate && (
        <ShareCertificateModal
          open={certificate !== null}
          onClose={() => setCertificate(null)}
          memberName={fullName ?? ''}
          count={
            certificate === 'yearly' ? goal.books_completed_this_year : goal.books_completed_this_month
          }
          goal={certificate === 'yearly' ? goal.yearly_goal : goal.monthly_goal}
          periodLabel={
            certificate === 'yearly'
              ? String(new Date().getFullYear())
              : new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
          }
        />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <BookProgressList
          title={t('readingProgress.lists.currentlyReading.title')}
          books={toProgressBooks(currentlyReading)}
          emptyDescription={t('readingProgress.lists.currentlyReading.emptyDescription')}
        />
        <BookProgressList
          title={t('readingProgress.lists.completed.title')}
          books={toProgressBooks(completed)}
          emptyDescription={t('readingProgress.lists.completed.emptyDescription')}
        />
        <BookProgressList
          title={t('readingProgress.lists.wantToRead.title')}
          books={[]}
          emptyDescription={t('readingProgress.lists.wantToRead.emptyDescription')}
        />
      </div>
    </div>
  );
}

export function ReadingProgressPage() {
  const { role } = useAuth();

  if (role === 'guardian') return <GuardianReadingProgress />;

  return <MemberReadingProgress />;
}
