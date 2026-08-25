import { LoadingState } from '@/components/feedback';

// Suspense fallback for lazy-loaded routes — swap-in for a full page while its
// chunk downloads, instead of a blank screen or plain text.
export function PageLoader() {
  return <LoadingState variant="page" />;
}
