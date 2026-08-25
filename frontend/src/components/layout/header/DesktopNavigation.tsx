import type { Role } from '@/providers/AuthProvider';

import { ThemeToggle } from '../ThemeToggle';
import { AuthActions } from './AuthActions';
import { NavigationLinks, type HeaderNavLink } from './NavigationLinks';

export interface DesktopNavigationProps {
  links: HeaderNavLink[];
  isAuthenticated: boolean;
  role: Role | null;
  onLogout: () => void;
}

export function DesktopNavigation({
  links,
  isAuthenticated,
  role,
  onLogout,
}: DesktopNavigationProps) {
  return (
    <>
      <div className="hidden items-center gap-1 lg:flex">
        <NavigationLinks links={links} variant="desktop" />
      </div>

      <div className="hidden items-center gap-2 lg:flex">
        <ThemeToggle />
        <AuthActions
          isAuthenticated={isAuthenticated}
          role={role}
          onLogout={onLogout}
          variant="desktop"
        />
      </div>
    </>
  );
}
