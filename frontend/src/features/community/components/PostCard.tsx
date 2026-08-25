import {
  Bookmark,
  Flag,
  Heart,
  Languages,
  MessageCircle,
  Pencil,
  Send,
  Trash2,
  UserX,
} from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Avatar, Badge, Card, CardContent, CardHeader } from '@/components/ui';
import { useOnDemandTranslation } from '@/features/translate/hooks/useOnDemandTranslation';
import { cn } from '@/lib/cn';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import type { CommunityPost, PostComment } from '@/providers/AuthProvider';
import { useAuth } from '@/providers/AuthProvider';

/** Small "Translate this" toggle shared by post bodies and comments — same affordance,
 * same behavior, just placed differently by each caller. */
function TranslateToggle({ onClick, active }: { onClick: () => void; active: boolean }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="inline-flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-80"
    >
      <Languages className="size-3.5 text-primary" />
      <span
        className={cn(
          active
            ? 'text-primary font-semibold'
            : 'bg-gradient-to-r from-primary via-primary/70 to-primary bg-clip-text text-transparent font-semibold',
        )}
      >
        {active ? t('community.post.showOriginal') : t('community.post.translate')}
      </span>
    </button>
  );
}

// If a member reported a comment themselves, hide it from their view.
// Other members will still see it (marked as [Reported]), and staff see all comments.
function hideSelfReportedComments(comments: PostComment[]): PostComment[] {
  return comments
    .filter((comment) => !comment.reported_by_me)
    .map((comment) => ({ ...comment, replies: hideSelfReportedComments(comment.replies) }));
}

export interface PostCardProps {
  post: CommunityPost;
  isBanned: boolean;
  /** True when the post itself wasn't reported but one of its comments was —
   * used to flag the card and auto-expand comments so staff can find it. */
  hasReportedComment: boolean;
  onToggleLike: (postId: string) => void;
  onToggleSave: (postId: string) => void;
  onAddComment: (postId: string, content: string) => void;
  onAddReply: (postId: string, commentId: string, content: string) => void;
  onEdit: (post: CommunityPost) => void;
  onDelete: (postId: string) => void;
  /** Staff-only: lets a reported comment be removed. */
  onDeleteComment: (postId: string, commentId: string) => void;
  /** IT Head-only: temporarily bans the post's author from Community. */
  onBan: (authorId: string, authorName: string) => void;
  /** Member/Manager-only: flags this post for admin review. */
  onReportPost: (postId: string) => void;
  /** Member/Manager-only: flags a comment on this post for admin review. */
  onReportComment: (postId: string, commentId: string) => void;
}

function CommentRow({
  comment,
  depth = 0,
  currentUserId,
  onReply,
  onDeleteComment,
  onReportComment,
}: {
  comment: PostComment;
  depth?: number;
  currentUserId: string | null;
  onReply: (commentId: string, content: string) => void;
  onDeleteComment?: (commentId: string) => void;
  onReportComment?: (commentId: string) => void;
}) {
  const { t } = useTranslation();
  const [isReplying, setIsReplying] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const translation = useOnDemandTranslation(comment.content);

  function handleReplySubmit(event: React.FormEvent) {
    event.preventDefault();
    const content = replyDraft.trim();
    if (!content) return;
    onReply(comment.id, content);
    setReplyDraft('');
    setIsReplying(false);
  }

  return (
    <div className={cn('flex flex-col gap-2', depth > 0 && 'ml-8')}>
      <div className="flex gap-2">
        <Avatar src={comment.author_avatar_url ?? undefined} name={comment.author_name} size="sm" />
        <div className="flex-1">
          <div className="rounded-lg bg-secondary/40 px-3 py-2">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-foreground">{comment.author_name}</p>
              {comment.reported && (
                <Badge variant="danger">{t('community.post.reportedBadge')}</Badge>
              )}
            </div>
            <p className="text-sm text-foreground">{translation.text}</p>
            {translation.error && (
              <p className="mt-0.5 text-xs text-danger">{t('community.post.translateFailed')}</p>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3 px-1">
            <button
              type="button"
              onClick={() => setIsReplying((open) => !open)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {t('community.post.reply')}
            </button>
            <TranslateToggle onClick={translation.toggle} active={translation.isShown} />
            {translation.loading && (
              <span className="text-xs text-muted-foreground">{t('community.post.translating')}</span>
            )}
            {!comment.reported && comment.author_id !== currentUserId && onReportComment && (
              <button
                type="button"
                onClick={() => onReportComment(comment.id)}
                className="text-xs font-medium text-muted-foreground hover:text-danger"
              >
                {t('community.post.report')}
              </button>
            )}
            {comment.reported && onDeleteComment && (
              <button
                type="button"
                onClick={() => onDeleteComment(comment.id)}
                className="text-xs font-medium text-danger hover:underline"
              >
                {t('community.post.removeComment')}
              </button>
            )}
          </div>
        </div>
      </div>

      {isReplying && (
        <form onSubmit={handleReplySubmit} className="ml-10 flex items-center gap-2">
          <input
            value={replyDraft}
            onChange={(event) => setReplyDraft(event.target.value)}
            placeholder={t('community.post.replyPlaceholder')}
            aria-label={t('community.post.replyPlaceholder')}
            autoFocus
            className="h-8 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <button
            type="submit"
            disabled={replyDraft.trim().length === 0}
            aria-label={t('community.post.sendReply')}
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-primary transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-50"
          >
            <Send className="size-3.5" />
          </button>
        </form>
      )}

      {comment.replies.map((reply) => (
        <CommentRow
          key={reply.id}
          comment={reply}
          depth={depth + 1}
          currentUserId={currentUserId}
          onReply={onReply}
          onDeleteComment={onDeleteComment}
          onReportComment={onReportComment}
        />
      ))}
    </div>
  );
}

export const PostCard = memo(function PostCard({
  post,
  isBanned,
  hasReportedComment,
  onToggleLike,
  onToggleSave,
  onAddComment,
  onAddReply,
  onEdit,
  onDelete,
  onDeleteComment,
  onBan,
  onReportPost,
  onReportComment,
}: PostCardProps) {
  const { t } = useTranslation();
  const { userId, role } = useAuth();
  const isStaff =
    role === 'admin' || role === 'manager' || role === 'librarian' || role === 'it-head';
  const canModerate = role === 'admin' || role === 'it-head';
  const canReport = role === 'member';
  const isMember = role === 'member';
  // Members never see reported comments (or their replies) at all — strip them
  // before anything downstream (count, list, auto-expand) touches the thread.
  const visibleComments = isStaff ? post.comments : hideSelfReportedComments(post.comments);
  // Only staff get the "something here was reported" signal — a member can't
  // see the reported comment anyway, so the badge/auto-open would just be noise.
  const flagReportedComment = hasReportedComment && !isMember;
  // null means "no manual choice yet" — comments default open whenever this post
  // has a reported comment (even one reported later, since the list polls every
  // 30s), so staff land on the flagged comment instead of a card that looks clean
  // until they think to expand it. Once the user toggles it themselves, that
  // explicit choice wins until the reported-comment state changes again.
  const [manualCommentsOpen, setManualCommentsOpen] = useState<boolean | null>(null);
  const isCommentsOpen = manualCommentsOpen ?? flagReportedComment;
  const [commentDraft, setCommentDraft] = useState('');
  const translation = useOnDemandTranslation(post.content);

  function handleAddComment(event: React.FormEvent) {
    event.preventDefault();
    const content = commentDraft.trim();
    if (!content) return;
    onAddComment(post.id, content);
    setCommentDraft('');
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <Avatar src={post.author_avatar_url ?? undefined} name={post.author_name} size="md" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{post.author_name}</p>
            {isBanned && <Badge variant="danger">{t('community.post.bannedBadge')}</Badge>}
            {post.reported && <Badge variant="danger">{t('community.post.reportedBadge')}</Badge>}
            {!post.reported && flagReportedComment && (
              <Badge variant="danger">{t('community.post.reportedCommentBadge')}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{formatRelativeTime(post.created_at)}</p>
        </div>
        {post.book_title && <Badge variant="outline">{post.book_title}</Badge>}
        {canReport && !post.is_own && !post.reported && (
          <button
            type="button"
            onClick={() => onReportPost(post.id)}
            aria-label={t('community.post.reportAria', { author: post.author_name })}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <Flag className="size-4" />
          </button>
        )}
        {canModerate && !post.is_own && (
          <button
            type="button"
            onClick={() => onBan(post.author_id, post.author_name)}
            aria-label={t('community.post.banAria', { author: post.author_name })}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <UserX className="size-4" />
          </button>
        )}
        {post.is_own && (
          <button
            type="button"
            onClick={() => onEdit(post)}
            aria-label={t('community.post.editAria')}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
        )}
        {(post.is_own || canModerate) && (
          <button
            type="button"
            onClick={() => onDelete(post.id)}
            aria-label={t('community.post.deleteAria')}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <p className="whitespace-pre-wrap text-sm text-foreground">{translation.text}</p>
          <div className="flex items-center gap-2">
            <TranslateToggle onClick={translation.toggle} active={translation.isShown} />
            {translation.loading && (
              <span className="text-xs text-muted-foreground">{t('community.post.translating')}</span>
            )}
            {translation.error && (
              <span className="text-xs text-danger">{t('community.post.translateFailed')}</span>
            )}
          </div>
        </div>

        {post.images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {post.images.map((src, index) => (
              <img
                key={index}
                src={src}
                alt=""
                className="size-24 rounded-md border border-border object-cover"
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-1 border-t border-border pt-2">
          <button
            type="button"
            onClick={() => onToggleLike(post.id)}
            aria-pressed={post.is_liked}
            aria-label={t(post.is_liked ? 'community.post.unlikeAria' : 'community.post.likeAria')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-secondary',
              post.is_liked ? 'text-danger' : 'text-muted-foreground',
            )}
          >
            <Heart className={cn('size-4', post.is_liked && 'fill-danger')} />
            {post.like_count}
          </button>

          <button
            type="button"
            onClick={() => setManualCommentsOpen(!isCommentsOpen)}
            aria-expanded={isCommentsOpen}
            aria-label={t('community.post.commentAria')}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary"
          >
            <MessageCircle className="size-4" />
            {visibleComments.length}
          </button>

          {!isStaff && (
            <button
              type="button"
              onClick={() => onToggleSave(post.id)}
              aria-pressed={post.is_saved}
              aria-label={t(post.is_saved ? 'community.post.unsaveAria' : 'community.post.saveAria')}
              className={cn(
                'ml-auto flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-secondary',
                post.is_saved ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Bookmark className={cn('size-4', post.is_saved && 'fill-primary')} />
            </button>
          )}
        </div>

        {isCommentsOpen && (
          <div className="flex flex-col gap-3 border-t border-border pt-3">
            {visibleComments.map((comment) => (
              <CommentRow
                key={comment.id}
                comment={comment}
                currentUserId={userId}
                onReply={(commentId, content) => onAddReply(post.id, commentId, content)}
                onDeleteComment={
                  isStaff ? (commentId) => onDeleteComment(post.id, commentId) : undefined
                }
                onReportComment={
                  canReport ? (commentId) => onReportComment(post.id, commentId) : undefined
                }
              />
            ))}

            <form onSubmit={handleAddComment} className="flex items-center gap-2">
              <input
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                placeholder={t('community.post.commentPlaceholder')}
                aria-label={t('community.post.commentPlaceholder')}
                className="h-9 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <button
                type="submit"
                disabled={commentDraft.trim().length === 0}
                aria-label={t('community.post.sendComment')}
                className="flex size-9 shrink-0 items-center justify-center rounded-md text-primary transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-50"
              >
                <Send className="size-4" />
              </button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
