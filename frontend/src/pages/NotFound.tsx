import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui';
import { ROUTES } from '@/constants/routes';

// Rendered as a child of PublicLayout (see AppRouter.tsx), so it inherits the
// site header/footer instead of building its own page shell.
export function NotFound() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-semibold text-foreground">{t('notFound.title')}</h1>
      <p className="text-muted-foreground">{t('notFound.message')}</p>
      <Button onClick={() => navigate(ROUTES.HOME)}>{t('notFound.backHome')}</Button>
    </div>
  );
}
