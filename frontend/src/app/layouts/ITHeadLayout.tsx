import { itHeadNavigation } from '@/constants/navigation';

import { AppShellLayout } from './AppShellLayout';

export function ITHeadLayout() {
  return <AppShellLayout items={itHeadNavigation} />;
}
