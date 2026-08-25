import { GuardianDashboardPage } from '@/features/guardian/pages/GuardianDashboardPage';
import { useAuth } from '@/providers/AuthProvider';

import { ManagerDashboard } from './ManagerDashboard';
import { MemberDashboard } from './MemberDashboard';

export function DashboardPage() {
  const { role } = useAuth();

  if (role === 'manager' || role === 'librarian') return <ManagerDashboard />;
  if (role === 'guardian') return <GuardianDashboardPage />;
  return <MemberDashboard />;
}
