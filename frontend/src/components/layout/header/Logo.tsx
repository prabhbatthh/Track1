import { BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/constants/routes';

export interface LogoProps {
  onClick?: () => void;
}

export function Logo({ onClick }: LogoProps) {
  const { t } = useTranslation();

  return (
    <Link
      to={ROUTES.HOME}
      className="flex items-center gap-2 whitespace-nowrap text-base font-semibold tracking-tight text-foreground transition-opacity hover:opacity-80"
      onClick={onClick}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <BookOpen className="size-4" />
      </span>
      <span className="sm:hidden">{t('common.brandShort')}</span>
      <span className="hidden sm:inline">{t('common.brandFull')}</span>
    </Link>
  );
}
