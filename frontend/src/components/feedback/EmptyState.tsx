// ui/EmptyState already covers this and is used correctly at every existing empty-collection
// call site — re-exporting here (same precedent as common/Badge.tsx) avoids a second
// implementation that would silently diverge from the one already in production use.
export { EmptyState, type EmptyStateProps } from '@/components/ui/EmptyState';
