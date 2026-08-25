import { EmptyState, type EmptyStateProps } from '@/components/ui';

export type NoResultsProps = EmptyStateProps;

// Semantic alias for EmptyState's "a search/filter matched nothing" case — identical output,
// clearer intent at call sites (e.g. BooksListPage's search-empty branch) than the generic
// "collection is empty" name.
export function NoResults(props: NoResultsProps) {
  return <EmptyState {...props} />;
}
