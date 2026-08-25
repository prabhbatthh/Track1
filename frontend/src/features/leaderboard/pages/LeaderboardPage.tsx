import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Flame,
  Info,
  Star,
  Target,
  Trophy,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageTitle, Pagination, TableToolbar } from '@/components/common';
import { ErrorState, LoadingState, NoResults } from '@/components/feedback';
import {
  Avatar,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { usePagination, useSortedItems } from '@/hooks';
import { cn } from '@/lib/cn';
import { getErrorMessage } from '@/lib/api';
import { useAuth, type LeaderboardEntry } from '@/providers/AuthProvider';

const PAGE_SIZE = 10;
const medalColor: Record<number, string> = {
  1: 'text-amber-500 fill-amber-500/20',
  2: 'text-slate-400 fill-slate-400/20',
  3: 'text-amber-700 fill-amber-700/20',
};

const BADGE_CONFIG: Record<string, { icon: string; titleKey: string; descKey: string }> = {
  bookworm: {
    icon: '📚',
    titleKey: 'leaderboard.badges.bookworm',
    descKey: 'leaderboard.badges.bookwormDesc',
  },
  '7_day_streak': {
    icon: '🔥',
    titleKey: 'leaderboard.badges.7_day_streak',
    descKey: 'leaderboard.badges.7_day_streakDesc',
  },
  top_reviewer: {
    icon: '⭐',
    titleKey: 'leaderboard.badges.top_reviewer',
    descKey: 'leaderboard.badges.top_reviewerDesc',
  },
  perfect_returner: {
    icon: '🎯',
    titleKey: 'leaderboard.badges.perfect_returner',
    descKey: 'leaderboard.badges.perfect_returnerDesc',
  },
  reading_champion: {
    icon: '🏆',
    titleKey: 'leaderboard.badges.reading_champion',
    descKey: 'leaderboard.badges.reading_championDesc',
  },
  community_star: {
    icon: '🌟',
    titleKey: 'leaderboard.badges.community_star',
    descKey: 'leaderboard.badges.community_starDesc',
  },
};

type LeaderboardSort = 'scoreHigh' | 'scoreLow' | 'nameAsc' | 'nameDesc';

export function LeaderboardPage() {
  const { t } = useTranslation();
  const { getLeaderboard, avatarUrl: authAvatarUrl, fullName: authFullName } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [rankCutoff, setRankCutoff] = useState<number>(50);
  const [sort, setSort] = useState<LeaderboardSort>('scoreHigh');
  const [showRules, setShowRules] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const loadLeaderboard = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    getLeaderboard()
      .then(setEntries)
      .catch(setLoadError)
      .finally(() => setIsLoading(false));
  }, [getLeaderboard]);

  useEffect(() => {
    const timer = setTimeout(loadLeaderboard, 0);
    return () => clearTimeout(timer);
  }, [loadLeaderboard]);

  const normalizedEntries = useMemo(() => {
    return entries.map((entry) => {
      if (entry.is_current_user) {
        return {
          ...entry,
          avatar_url: authAvatarUrl ?? entry.avatar_url,
          full_name: authFullName ?? entry.full_name,
        };
      }
      return entry;
    });
  }, [entries, authAvatarUrl, authFullName]);

  const filteredBoardEntries = useMemo(
    () => normalizedEntries.filter((entry) => entry.rank <= rankCutoff),
    [normalizedEntries, rankCutoff],
  );

  const sortConfig = useMemo(
    () => ({
      compare: (a: LeaderboardEntry, b: LeaderboardEntry) => {
        switch (sort) {
          case 'scoreLow':
            return (
              a.score - b.score ||
              b.books_completed - a.books_completed ||
              b.reviews_count - a.reviews_count ||
              b.reading_streak - a.reading_streak ||
              a.full_name.localeCompare(b.full_name)
            );
          case 'nameAsc':
            return a.full_name.localeCompare(b.full_name);
          case 'nameDesc':
            return b.full_name.localeCompare(a.full_name);
          case 'scoreHigh':
          default:
            return (
              b.score - a.score ||
              b.books_completed - a.books_completed ||
              b.reviews_count - a.reviews_count ||
              b.reading_streak - a.reading_streak ||
              a.full_name.localeCompare(b.full_name)
            );
        }
      },
    }),
    [sort],
  );

  const visibleEntries = useSortedItems(filteredBoardEntries, sortConfig);

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(
    visibleEntries,
    PAGE_SIZE,
  );

  const currentUserEntry = useMemo(
    () => normalizedEntries.find((e) => e.is_current_user),
    [normalizedEntries],
  );

  const handleJumpToMyRank = useCallback(() => {
    if (!currentUserEntry || currentUserEntry.rank > 50) return;
    setRankCutoff(50);
    setSort('scoreHigh');
    const index = visibleEntries.findIndex((e) => e.is_current_user);
    if (index !== -1) {
      const targetPage = Math.floor(index / PAGE_SIZE) + 1;
      setPage(targetPage);
      setTimeout(() => {
        const el = document.getElementById(`rank-row-${currentUserEntry.rank}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
  }, [currentUserEntry, visibleEntries, setPage]);

  function resetFilters() {
    setRankCutoff(50);
    setSort('scoreHigh');
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <PageTitle
          title={t('leaderboard.pageTitle')}
          description={t('leaderboard.pageDescription')}
        />
        <button
          type="button"
          onClick={() => setShowRules(!showRules)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Info className="size-4 text-primary" />
          {t(showRules ? 'leaderboard.rules.hide' : 'leaderboard.rules.show')}
        </button>
      </div>

      {currentUserEntry && (
        <div className="rounded-xl border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/5 to-card p-4 sm:p-5 shadow-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex size-16 sm:size-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-primary/80 text-primary-foreground shadow-md ring-4 ring-primary/20">
              <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider opacity-90">RANK</span>
              <span className="text-xl sm:text-2xl font-extrabold leading-none">#{currentUserEntry.rank}</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-foreground text-base sm:text-lg">Your Standing</h3>
                <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary text-xs font-semibold">
                  {currentUserEntry.rank <= 3
                    ? '🏆 Podium Leader'
                    : `#${currentUserEntry.rank} of ${entries.length} Members`}
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                {currentUserEntry.rank <= 50
                  ? 'Awesome! You are currently ranked in the Top 50 readers of the library.'
                  : 'Earn +50 pts with your next 7-day streak & complete books to climb into the Top 50!'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4 w-full lg:w-auto justify-between lg:justify-end border-t lg:border-t-0 border-border/50 pt-3 lg:pt-0">
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-3 py-1.5 shadow-2xs">
              <Trophy className="size-4 text-primary" />
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Score</p>
                <p className="text-sm font-bold text-foreground">{currentUserEntry.score.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">pts</span></p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-3 py-1.5 shadow-2xs">
              <BookOpen className="size-4 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Books</p>
                <p className="text-sm font-bold text-foreground">{currentUserEntry.books_completed}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-3 py-1.5 shadow-2xs">
              <Flame className="size-4 text-amber-500" />
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Streak</p>
                <p className="text-sm font-bold text-foreground">{currentUserEntry.reading_streak} <span className="text-xs font-normal text-muted-foreground">Days</span></p>
              </div>
            </div>

            {currentUserEntry.rank <= 50 && (
              <button
                type="button"
                onClick={handleJumpToMyRank}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
              >
                <Target className="size-3.5" />
                Jump to Rank
              </button>
            )}
          </div>
        </div>
      )}

      {showRules && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5 text-sm space-y-4">
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2 text-base">
              <Trophy className="size-5 text-primary" />
              {t('leaderboard.rules.title')}
            </h3>
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
              {t('leaderboard.rules.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <div className="rounded-lg border border-border/60 bg-background/80 p-2.5 flex flex-col items-start gap-1">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <BookOpen className="size-3.5" /> {t('leaderboard.pointsAmount', { points: 100 })}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('leaderboard.rules.labels.completeBook')}
              </span>
            </div>

            <div className="rounded-lg border border-border/60 bg-background/80 p-2.5 flex flex-col items-start gap-1">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
                <Star className="size-3.5" /> {t('leaderboard.pointsAmount', { points: 25 })}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('leaderboard.rules.labels.writeReview')}
              </span>
            </div>

            <div className="rounded-lg border border-border/60 bg-background/80 p-2.5 flex flex-col items-start gap-1">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-600 dark:text-purple-400">
                <Calendar className="size-3.5" /> {t('leaderboard.pointsAmount', { points: 30 })}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('leaderboard.rules.labels.attendEvent')}
              </span>
            </div>

            <div className="rounded-lg border border-border/60 bg-background/80 p-2.5 flex flex-col items-start gap-1">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 dark:text-teal-400">
                <CheckCircle2 className="size-3.5" />{' '}
                {t('leaderboard.pointsAmount', { points: 15 })}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('leaderboard.rules.labels.onTimeReturn')}
              </span>
            </div>

            <div className="rounded-lg border border-border/60 bg-background/80 p-2.5 flex flex-col items-start gap-1">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                <Flame className="size-3.5" /> {t('leaderboard.pointsAmount', { points: 50 })}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('leaderboard.rules.labels.streakBonus')}
              </span>
            </div>

            <div className="rounded-lg border border-border/60 bg-background/80 p-2.5 flex flex-col items-start gap-1">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 dark:text-rose-400">
                <Target className="size-3.5" /> {t('leaderboard.penaltyAmount', { points: 10 })}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('leaderboard.rules.labels.lateReturn')}
              </span>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Loading leaderboard" />
      ) : loadError ? (
        <ErrorState
          className="min-h-48"
          description={getErrorMessage(loadError, t('common.errors.generic'))}
          onRetry={loadLeaderboard}
        />
      ) : entries.length === 0 ? (
        <NoResults
          icon={Award}
          title={t('leaderboard.empty.title')}
          description={t('leaderboard.empty.description')}
        />
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card p-3.5 shadow-xs">
            <TableToolbar
              filters={[
                {
                  label: t('leaderboard.show.label'),
                  value: `top${rankCutoff}`,
                  onChange: (value) => {
                    const cutoff = parseInt(value.replace('top', ''), 10);
                    setRankCutoff(isNaN(cutoff) ? 50 : cutoff);
                    setPage(1);
                  },
                  options: [
                    { value: 'top50', label: t('leaderboard.show.top50') },
                    { value: 'top25', label: 'Top 25' },
                    { value: 'top10', label: 'Top 10' },
                  ],
                },
              ]}
              sort={{
                label: t('common.actions.sort'),
                value: sort,
                onChange: (value) => {
                  setSort(value as LeaderboardSort);
                  setPage(1);
                },
                options: [
                  { value: 'scoreHigh', label: t('leaderboard.sort.highestScore') },
                  { value: 'scoreLow', label: t('leaderboard.sort.lowestScore') },
                  { value: 'nameAsc', label: t('leaderboard.sort.nameAsc') },
                  { value: 'nameDesc', label: t('leaderboard.sort.nameDesc') },
                ],
              }}
              onReset={resetFilters}
            />
          </div>

          {visibleEntries.length === 0 ? (
            <NoResults
              icon={Award}
              title={t('leaderboard.empty.title')}
              description={t('leaderboard.empty.description')}
              action={
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-sm font-medium text-primary"
                >
                  Reset
                </button>
              }
            />
          ) : (
            <>
              <div className="w-full overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
                <Table className="min-w-full">
                  <TableHeader className="bg-secondary/20">
                    <TableRow>
                      <TableHead className="w-20 whitespace-nowrap px-3.5 py-2.5">{t('leaderboard.table.rank')}</TableHead>
                      <TableHead className="whitespace-nowrap px-3.5 py-2.5">{t('leaderboard.table.reader')}</TableHead>
                      <TableHead className="whitespace-nowrap px-3.5 py-2.5">{t('leaderboard.table.score')}</TableHead>
                      <TableHead className="whitespace-nowrap px-3.5 py-2.5">{t('leaderboard.table.badges')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedItems.map((entry) => (
                      <TableRow
                        key={entry.member_id}
                        id={`rank-row-${entry.rank}`}
                        className={cn(
                          'transition-all hover:bg-secondary/40',
                          entry.is_current_user && 'bg-primary/10 border-l-4 border-l-primary font-semibold',
                        )}
                      >
                        <TableCell className="whitespace-nowrap px-3.5 py-2.5">
                          <span className="flex items-center gap-1.5 font-bold text-foreground">
                            {entry.rank <= 3 && (
                              <Award className={cn('size-4', medalColor[entry.rank])} />
                            )}
                            {entry.rank}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-3.5 py-2.5">
                          <span className="flex items-center gap-2.5">
                            <Avatar
                              src={entry.avatar_url ?? undefined}
                              name={entry.full_name}
                              size="sm"
                            />
                            <span className="font-semibold text-foreground text-xs sm:text-sm">{entry.full_name}</span>
                            {entry.is_current_user && (
                              <Badge variant="outline" className="ml-1 text-[11px] py-0">
                                {t('common.you')}
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap px-3.5 py-2.5">
                          <span className="font-semibold text-primary">
                            {entry.score.toLocaleString()}{' '}
                            <span className="text-xs font-normal text-muted-foreground">pts</span>
                          </span>
                        </TableCell>
                        <TableCell className="px-3.5 py-2.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {entry.badges && entry.badges.length > 0 ? (
                              entry.badges.map((badgeKey) => {
                                const config = BADGE_CONFIG[badgeKey];
                                if (!config) return null;
                                return (
                                  <span
                                    key={badgeKey}
                                    title={`${t(config.titleKey)} — ${t(config.descKey)}`}
                                    className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs shadow-xs hover:scale-105 transition-transform cursor-help"
                                  >
                                    <span>{config.icon}</span>
                                    <span className="hidden sm:inline font-medium text-foreground text-[11px]">
                                      {t(config.titleKey)}
                                    </span>
                                  </span>
                                );
                              })
                            ) : (
                              <span className="text-xs text-muted-foreground italic">—</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={totalItems}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
