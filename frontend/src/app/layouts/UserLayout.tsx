import { useLocation } from 'react-router-dom';

import { CompleteProfileModal } from '@/components/CompleteProfileModal';

import {
  adminNavigation,
  adminOverviewNavItem,
  guardianNavigation,
  guardianOverviewNavItem,
  itHeadNavigation,
  itHeadOverviewNavItem,
  managerNavigation,
  userNavigation,
  type NavItem,
} from '@/constants/navigation';
import { ROUTES } from '@/constants/routes';
import { useAuth, type Role } from '@/providers/AuthProvider';

import { AppShellLayout } from './AppShellLayout';

// Roles with their own dedicated dashboard (Admin/IT Head/Guardian) still get a link back
// to it if they navigate to the shared /dashboard, mirroring adminOverviewNavItem's role.
const overviewNavItemByRole: Partial<Record<Role, NavItem>> = {
  admin: adminOverviewNavItem,
  'it-head': itHeadOverviewNavItem,
  guardian: guardianOverviewNavItem,
};

// Roles with their own trimmed sidebar (no personal-member pages like Books/Reservations).
const dedicatedNavigationByRole: Partial<Record<Role, NavItem[]>> = {
  admin: adminNavigation,
  manager: managerNavigation,
  librarian: managerNavigation,
  guardian: guardianNavigation,
  'it-head': itHeadNavigation,
};

export function UserLayout() {
  const { role } = useAuth();
  const { pathname } = useLocation();
  const dedicatedNav = role ? dedicatedNavigationByRole[role] : undefined;
  const overviewNavItem = role ? overviewNavItemByRole[role] : undefined;

  // A role's own sidebar links (Reading Progress, Notifications, ...) point at these same
  // shared routes, so keep its dedicated sidebar there too. /dashboard itself stays the
  // "browse as a member" view with the full member nav plus a link back to the role's own
  // overview page — only roles with a separate overview route (admin, guardian) need that;
  // manager's dashboard IS /dashboard, so it always keeps its own sidebar.
  if (dedicatedNav && !(overviewNavItem && pathname === ROUTES.DASHBOARD)) {
    return (
      <>
        <CompleteProfileModal />
        <AppShellLayout items={dedicatedNav} />
      </>
    );
  }

  const items = overviewNavItem ? [...userNavigation, overviewNavItem] : userNavigation;

  return (
    <>
      <CompleteProfileModal />
      <AppShellLayout items={items} />
    </>
  );
}
