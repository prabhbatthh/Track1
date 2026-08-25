import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button, buttonVariants } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/lib/cn';
import type { Role } from '@/providers/AuthProvider';

// The header's auth-aware call-to-action slot: login/register links when
// signed out, or a role badge + logout button when signed in. Distinct from
// the avatar dropdown in components/layout/UserMenu.tsx (used by the
// authenticated app shell's TopBar), which this header doesn't render.
export interface AuthActionsProps {
  isAuthenticated: boolean;
  role: Role | null;
  onLogout: () => void;
  onNavigate?: () => void;
  variant?: 'desktop' | 'mobile';
}

export function AuthActions({
  isAuthenticated,
  role,
  onLogout,
  onNavigate,
  variant = 'desktop',
}: AuthActionsProps) {
  const { t } = useTranslation();
  const isMobile = variant === 'mobile';
  const size = isMobile ? 'md' : 'sm';
  const roleHome = role
    ? {
        admin: ROUTES.ADMIN,
        member: ROUTES.DASHBOARD,
        manager: ROUTES.DASHBOARD,
        librarian: ROUTES.DASHBOARD,
        'it-head': ROUTES.IT_HEAD,
        guardian: ROUTES.GUARDIAN,
      }[role]
    : ROUTES.DASHBOARD;

  if (isAuthenticated && role) {
    return (
      <>
        <Link
          to={roleHome}
          onClick={onNavigate}
          className={cn(buttonVariants({ variant: 'ghost', size }), isMobile && 'justify-start')}
        >
          {t(`auth.login.roles.${role}`)}
        </Link>
        <Button
          variant="outline"
          size={size}
          className={isMobile ? 'w-full' : undefined}
          onClick={onLogout}
        >
          {t('userMenu.logOut')}
        </Button>
      </>
    );
  }

  return (
    <>
      <Link
        to={ROUTES.LOGIN}
        onClick={onNavigate}
        className={cn(buttonVariants({ variant: 'outline', size }), isMobile && 'w-full')}
      >
        {t('auth.login.title')}
      </Link>
      <Link
        to={ROUTES.REGISTER}
        onClick={onNavigate}
        className={cn(buttonVariants({ size }), isMobile && 'w-full')}
      >
        {t('common.getStarted')}
      </Link>
    </>
  );
}
