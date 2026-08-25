import { guardianNavigation } from '@/constants/navigation';

import { AppShellLayout } from './AppShellLayout';

export function GuardianLayout() {
  return <AppShellLayout items={guardianNavigation} />;
}
