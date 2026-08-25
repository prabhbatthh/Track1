import { Flag, MessageCircle, Plus, UserX, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Pagination, StatisticCard, PageTitle, TableToolbar } from '@/components/common';
import { Button, Dialog, EmptyState } from '@/components/ui';
import { usePagination, useSortedItems } from '@/hooks';
import { getErrorMessage } from '@/lib/api';
import {
  useAuth,
  type BannedAuthor,
  type CommunityPost,
  type PostComment,
} from '@/providers/AuthProvider';

import { CreatePostModal, type PostDraft } from '../components/CreatePostModal';
import { PostCard } from '../components/PostCard';

type Filter = 'all' | 'saved' | 'reported';

const COMMUNITY_POLL_INTERVAL_MS = 30_000;

function replacePost(posts: CommunityPost[], updated: CommunityPost): CommunityPost[] {
  return posts.map((post) => (post.id === updated.id ? updated : post));
}

function removeCommentById(comments: PostComment[], commentId: string): PostComment[] {
  return comments
    .filter((comment) => comment.id !== commentId)
    .map((comment) => ({ ...comment, replies: removeCommentById(comment.replies, commentId) }));
}

function reportCommentById(comments: PostComment[], commentId: string): PostComment[] {
  return comments.map((comment) => {
    if (comment.id === commentId) {
      return { ...comment, reported: true };
    }
    return { ...comment, replies: reportCommentById(comment.replies, commentId) };
  });
}

function countComments(comments: PostComment[]): number {
  return comments.reduce((count, comment) => count + 1 + countComments(comment.replies), 0);
}

function hasReportedComment(comments: PostComment[]): boolean {
  return comments.some((comment) => comment.reported || hasReportedComment(comment.replies));
}

function countReported(comments: PostComment[]): number {
  return comments.reduce(
    (count, comment) => count + (comment.reported ? 1 : 0) + countReported(comment.replies),
    0,
  );
}

export function CommunityPage() {
  const { t } = useTranslation();
  const {
    role,
    getCommunityPosts,
    createCommunityPost,
    updateCommunityPost,
    deleteCommunityPost,
    toggleCommunityLike,
    toggleCommunitySave,
    reportCommunityPost,
    addCommunityComment,
    deleteCommunityComment,
    reportCommunityComment,
    getBannedAuthors,
    banCommunityAuthor,
    unbanCommunityAuthor,
  } = useAuth();
  const isStaff =
    role === 'admin' || role === 'manager' || role === 'librarian' || role === 'it-head';
  const canModerate = role === 'admin' || role === 'it-head';
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'likes'>('newest');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [bannedAuthors, setBannedAuthors] = useState<BannedAuthor[]>([]);
  const [banningAuthor, setBanningAuthor] = useState<{ id: string; name: string } | null>(null);

  // Polls rather than fetching once, so a post/comment reported (or added) by someone
  // else shows up here without staff needing to manually reload the tab.
  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const [postsData, bansData] = await Promise.all([
        getCommunityPosts(),
        canModerate ? getBannedAuthors() : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setPosts(postsData);
      if (bansData) setBannedAuthors(bansData);
    }

    refresh()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    const interval = setInterval(() => {
      refresh().catch(() => {});
    }, COMMUNITY_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canModerate]);

  const filteredPosts = useMemo(() => {
    // If a member reported a post themselves, hide it from their feed.
    // Other members will still see it (marked as [Reported]), and staff see all posts.
    const basePosts = !isStaff ? posts.filter((post) => !post.reported_by_me) : posts;
    if (filter === 'saved') return basePosts.filter((post) => post.is_saved);
    if (filter === 'reported')
      return basePosts.filter((post) => post.reported || hasReportedComment(post.comments));
    return basePosts;
  }, [posts, filter, isStaff]);

  const sortedPosts = useSortedItems(filteredPosts, {
    compare: (a, b) => {
      switch (sort) {
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'likes':
          return b.like_count - a.like_count;
        case 'newest':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    },
  });

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(sortedPosts, 5);
  const deletingPost = posts.find((post) => post.id === deletingPostId) ?? null;

  const totalComments = useMemo(
    () => posts.reduce((sum, post) => sum + countComments(post.comments), 0),
    [posts],
  );
  const reportedCount = useMemo(
    () => posts.reduce((sum, post) => sum + countReported(post.comments), 0),
    [posts],
  );

  const reportError = useCallback(
    (error: unknown) => {
      toast.error(getErrorMessage(error, t('common.errors.generic')));
    },
    [t],
  );

  async function handleSubmitPost(draft: PostDraft) {
    const payload = { book_title: draft.bookTitle || null, content: draft.content, images: draft.images };
    try {
      if (editingPost) {
        const updated = await updateCommunityPost(editingPost.id, payload);
        setPosts((prev) => replacePost(prev, updated));
        setEditingPost(null);
        return;
      }
      const created = await createCommunityPost(payload);
      setPosts((prev) => [created, ...prev]);
      setIsCreateOpen(false);
    } catch (error) {
      reportError(error);
    }
  }

  function closePostModal() {
    setIsCreateOpen(false);
    setEditingPost(null);
  }

  async function confirmDeletePost() {
    if (!deletingPost) return;
    try {
      await deleteCommunityPost(deletingPost.id);
      setPosts((prev) => prev.filter((post) => post.id !== deletingPost.id));
    } catch (error) {
      reportError(error);
    } finally {
      setDeletingPostId(null);
    }
  }

  async function confirmBanAuthor() {
    if (!banningAuthor) return;
    try {
      await banCommunityAuthor(banningAuthor.id);
      setBannedAuthors((prev) =>
        prev.some((author) => author.user_id === banningAuthor.id)
          ? prev
          : [...prev, { user_id: banningAuthor.id, full_name: banningAuthor.name }],
      );
    } catch (error) {
      reportError(error);
    } finally {
      setBanningAuthor(null);
    }
  }

  async function unbanAuthor(userId: string) {
    try {
      await unbanCommunityAuthor(userId);
      setBannedAuthors((prev) => prev.filter((author) => author.user_id !== userId));
    } catch (error) {
      reportError(error);
    }
  }

  // Stable across renders (all deps are themselves stable: useAuth()'s functions are memoized,
  // reportError only changes if the language changes) — passed straight through to PostCard
  // instead of being re-wrapped in a fresh per-post closure inside the .map() below, so
  // React.memo(PostCard) can actually skip re-rendering posts nothing changed on.
  const toggleLike = useCallback(
    async (postId: string) => {
      try {
        const updated = await toggleCommunityLike(postId);
        setPosts((prev) => replacePost(prev, updated));
      } catch (error) {
        reportError(error);
      }
    },
    [toggleCommunityLike, reportError],
  );

  const toggleSave = useCallback(
    async (postId: string) => {
      try {
        const updated = await toggleCommunitySave(postId);
        setPosts((prev) => replacePost(prev, updated));
      } catch (error) {
        reportError(error);
      }
    },
    [toggleCommunitySave, reportError],
  );

  const addComment = useCallback(
    async (postId: string, content: string) => {
      try {
        const updated = await addCommunityComment(postId, { content });
        setPosts((prev) => replacePost(prev, updated));
      } catch (error) {
        reportError(error);
      }
    },
    [addCommunityComment, reportError],
  );

  const addReply = useCallback(
    async (postId: string, commentId: string, content: string) => {
      try {
        const updated = await addCommunityComment(postId, { content, parent_id: commentId });
        setPosts((prev) => replacePost(prev, updated));
      } catch (error) {
        reportError(error);
      }
    },
    [addCommunityComment, reportError],
  );

  const deleteComment = useCallback(
    async (postId: string, commentId: string) => {
      try {
        await deleteCommunityComment(commentId);
        setPosts((prev) =>
          prev.map((post) =>
            post.id === postId
              ? { ...post, comments: removeCommentById(post.comments, commentId) }
              : post,
          ),
        );
      } catch (error) {
        reportError(error);
      }
    },
    [deleteCommunityComment, reportError],
  );

  const reportPost = useCallback(
    async (postId: string) => {
      try {
        const updated = await reportCommunityPost(postId);
        setPosts((prev) => replacePost(prev, updated));
      } catch (error) {
        reportError(error);
      }
    },
    [reportCommunityPost, reportError],
  );

  const reportComment = useCallback(
    async (postId: string, commentId: string) => {
      try {
        await reportCommunityComment(commentId);
        setPosts((prev) =>
          prev.map((post) =>
            post.id === postId
              ? { ...post, comments: reportCommentById(post.comments, commentId) }
              : post,
          ),
        );
      } catch (error) {
        reportError(error);
      }
    },
    [reportCommunityComment, reportError],
  );

  const handleEditPost = useCallback((post: CommunityPost) => setEditingPost(post), []);
  const handleDeletePost = useCallback((postId: string) => setDeletingPostId(postId), []);
  const handleBanAuthor = useCallback(
    (authorId: string, authorName: string) => setBanningAuthor({ id: authorId, name: authorName }),
    [],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title={t('community.pageTitle')}
        description={t('community.pageDescription')}
        actions={
          !isStaff && (
            <Button leadingIcon={<Plus className="size-4" />} onClick={() => setIsCreateOpen(true)}>
              {t('community.newPost')}
            </Button>
          )
        }
      />

      {isStaff && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatisticCard
            icon={Users}
            label={t('community.adminStats.totalPosts')}
            value={String(posts.length)}
          />
          <StatisticCard
            icon={MessageCircle}
            label={t('community.adminStats.totalComments')}
            value={String(totalComments)}
          />
          <StatisticCard
            icon={Flag}
            label={t('community.adminStats.reportedComments')}
            value={String(reportedCount)}
          />
        </div>
      )}

      {canModerate && bannedAuthors.length > 0 && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <UserX className="size-4" /> {t('community.bannedUsers.title')}
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {bannedAuthors.map((author) => (
              <li key={author.user_id} className="flex items-center justify-between text-sm">
                <span className="text-foreground">
                  {author.full_name}{' '}
                  <span className="text-muted-foreground">
                    — {t('community.bannedUsers.status')}
                  </span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => unbanAuthor(author.user_id)}>
                  {t('community.bannedUsers.unban')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <TableToolbar
        filters={[
          {
            label: t('community.filters.groupLabel'),
            value: filter,
            onChange: (value) => {
              setFilter(value as Filter);
              setPage(1);
            },
            options: [
              { value: 'all', label: t('community.filters.all') },
              ...(!isStaff
                ? [{ value: 'saved', label: t('community.filters.saved') }]
                : [{ value: 'reported', label: t('community.filters.reported') }]),
            ],
          },
        ]}
        sort={{
          label: t('common.actions.sort'),
          value: sort,
          onChange: (value) => {
            setSort(value as 'newest' | 'oldest' | 'likes');
            setPage(1);
          },
          options: [
            { value: 'newest', label: t('community.sort.newest') },
            { value: 'oldest', label: t('community.sort.oldest') },
            { value: 'likes', label: t('community.sort.mostLiked') },
          ],
        }}
        onReset={() => {
          setFilter('all');
          setSort('newest');
          setPage(1);
        }}
      />

      {!isLoading && filteredPosts.length === 0 ? (
        <EmptyState
          icon={filter === 'reported' ? Flag : Users}
          title={t(
            filter === 'saved'
              ? 'community.empty.savedTitle'
              : filter === 'reported'
                ? 'community.empty.reportedTitle'
                : 'community.empty.title',
          )}
          description={t(
            filter === 'saved'
              ? 'community.empty.savedDescription'
              : filter === 'reported'
                ? 'community.empty.reportedDescription'
                : 'community.empty.description',
          )}
          secondaryAction={
            filter !== 'all' && (
              <Button size="sm" variant="outline" onClick={() => setFilter('all')}>
                {t('community.filters.all')}
              </Button>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {paginatedItems.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              isBanned={bannedAuthors.some((author) => author.user_id === post.author_id)}
              hasReportedComment={hasReportedComment(post.comments)}
              onToggleLike={toggleLike}
              onToggleSave={toggleSave}
              onAddComment={addComment}
              onAddReply={addReply}
              onDeleteComment={deleteComment}
              onEdit={handleEditPost}
              onDelete={handleDeletePost}
              onBan={handleBanAuthor}
              onReportPost={reportPost}
              onReportComment={reportComment}
            />
          ))}

          {totalItems > 0 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={5}
              onPageChange={setPage}
            />
          )}
        </div>
      )}

      <CreatePostModal
        open={isCreateOpen || editingPost !== null}
        onClose={closePostModal}
        onSubmit={handleSubmitPost}
        initialValues={
          editingPost
            ? {
                bookTitle: editingPost.book_title ?? '',
                content: editingPost.content,
                images: editingPost.images,
              }
            : undefined
        }
      />

      <Dialog
        open={deletingPost !== null}
        onClose={() => setDeletingPostId(null)}
        title={t('community.deleteDialog.title')}
        description={t('community.deleteDialog.description')}
        confirmLabel={t('community.deleteDialog.confirmLabel')}
        confirmVariant="danger"
        onConfirm={confirmDeletePost}
      />

      <Dialog
        open={banningAuthor !== null}
        onClose={() => setBanningAuthor(null)}
        title={t('community.banDialog.title', { author: banningAuthor?.name })}
        description={t('community.banDialog.description', { author: banningAuthor?.name })}
        confirmLabel={t('community.banDialog.confirmLabel')}
        confirmVariant="danger"
        onConfirm={confirmBanAuthor}
      />
    </div>
  );
}
