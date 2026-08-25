import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Avatar, Badge, Button, Drawer } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { useAuth } from '@/providers/AuthProvider';

export function UserMenu() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { role, fullName, avatarUrl, logout } = useAuth();
  const navigate = useNavigate();

  function goTo(path: string) {
    setOpen(false);
    navigate(path);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('userMenu.openAccountMenu')}
        aria-expanded={open}
        aria-controls="account-menu-drawer"
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Avatar src={avatarUrl ?? undefined} name={fullName ?? undefined} size="sm" />
      </button>

      <Drawer
        id="account-menu-drawer"
        open={open}
        onClose={() => setOpen(false)}
        title={t('userMenu.account')}
      >
        <div className="flex flex-col gap-4">
          {role && (
            <Badge variant="outline" className="w-fit capitalize">
              {t(`auth.login.roles.${role}`)}
            </Badge>
          )}
          <Button variant="ghost" className="justify-start" onClick={() => goTo(ROUTES.PROFILE)}>
            {t('userMenu.profile')}
          </Button>
          <Button variant="ghost" className="justify-start" onClick={() => goTo(ROUTES.SETTINGS)}>
            {t('userMenu.settings')}
          </Button>
          <Button
            variant="outline"
            className="justify-start"
            onClick={() => {
              logout();
              goTo(ROUTES.HOME);
            }}
          >
            {t('userMenu.logOut')}
          </Button>
        </div>
      </Drawer>
    </>
  );
}
