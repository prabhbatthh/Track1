import { adminNavigation } from '@/constants/navigation';

import { AppShellLayout } from './AppShellLayout';

export function AdminLayout() {
  return <AppShellLayout items={adminNavigation} />;
}
