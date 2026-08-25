import { Globe, Link2, Mail, MessageCircle, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { LanguageSwitcher } from './LanguageSwitcher';
import { ROUTES } from '@/constants/routes';
import { LIBRARY_CONTACT } from '@/constants/contact';

interface FooterProps {
  minimal?: boolean;
}

export function Footer({ minimal }: FooterProps) {
  const { t } = useTranslation();

  if (minimal) {
    return (
      <footer className="border-t border-border bg-surface px-6 py-4 text-sm text-muted-foreground">
        <div className="mx-auto max-w-6xl text-center">
          © 2026 Community Reading Club & Library Management Platform.
        </div>
      </footer>
    );
  }

  return (
    <footer className="border-t border-border bg-surface px-6 py-4 text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <a
              href={`mailto:${LIBRARY_CONTACT.email}`}
              aria-label={t('contactUs.actions.emailUs')}
              className="flex items-center gap-1.5 hover:text-foreground"
            >
              <Mail className="size-3.5" />
              {LIBRARY_CONTACT.email}
            </a>
            <a
              href={LIBRARY_CONTACT.phoneHref}
              aria-label={t('contactUs.actions.callUs')}
              className="flex items-center gap-1.5 hover:text-foreground"
            >
              <Phone className="size-3.5" />
              {LIBRARY_CONTACT.phoneDisplay}
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <LanguageSwitcher />
            <Link
              to={`${ROUTES.CONTACT_US}#contact-us`}
              className="text-sm font-medium text-primary hover:text-foreground"
            >
              {t('nav.contactUs')}
            </Link>
            <Link
              to={ROUTES.HOME}
              aria-label={t('contactUs.actions.home')}
              className="hover:text-foreground"
            >
              <Globe className="size-3.5" />
            </Link>
            <Link
              to={`${ROUTES.CONTACT_US}#contact-us`}
              aria-label={t('contactUs.actions.contactUs')}
              className="hover:text-foreground"
            >
              <MessageCircle className="size-3.5" />
            </Link>
            <Link
              to={`${ROUTES.CONTACT_US}#faq`}
              aria-label={t('contactUs.actions.faq')}
              className="hover:text-foreground"
            >
              <Link2 className="size-3.5" />
            </Link>
          </div>
        </div>
        <p className="border-t border-border pt-3">
          {t('footer.copyright', { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
}
