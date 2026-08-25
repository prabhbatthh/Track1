/* eslint-disable react-refresh/only-export-components */

import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';

import { buttonVariants } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/lib/cn';
import { preferredScrollBehavior } from '@/lib/scroll';
import { useActiveSection } from '@/providers/ActiveSectionProvider';

export interface HeaderNavLink {
  label: string;
  to: string;
  end: boolean;
  onClick?: (event: React.MouseEvent) => void;
  /**
   * Overrides NavLink's own isActive check. Needed because "Home" and "Reviews" both resolve
   * to the same pathname (react-router ignores the hash when matching), so without this both
   * would light up together any time we're on the home route.
   */
  forceActive?: boolean;
}

// Translated nav links shared by the desktop bar and the mobile drawer.
export function useHeaderNavLinks(): HeaderNavLink[] {
  const { t } = useTranslation();
  const location = useLocation();
  const { activeSection } = useActiveSection();

  // If already on the landing page, smooth-scroll to the testimonials section instead of
  // reloading the route; otherwise let the Link navigate home and LandingPage scrolls on mount.
  function reviewsClickHandler(event: React.MouseEvent) {
    if (location.pathname === ROUTES.HOME) {
      event.preventDefault();
      const el = document.getElementById('testimonials');
      if (el) el.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' });
    }
  }

  const isOnHome = location.pathname === ROUTES.HOME;
  const isReviewsActive = isOnHome && activeSection === 'testimonials';

  return [
    { label: t('landing.footer.home'), to: ROUTES.HOME, end: true, forceActive: isOnHome && !isReviewsActive },
    { label: t('nav.pricing'), to: ROUTES.PRICING, end: false },
    {
      label: t('nav.reviews'),
      to: `${ROUTES.HOME}#testimonials`,
      end: true,
      onClick: reviewsClickHandler,
      forceActive: isReviewsActive,
    },
    { label: t('nav.contactUs'), to: ROUTES.CONTACT_US, end: false },
  ];
}

export interface NavigationLinksProps {
  links: HeaderNavLink[];
  variant?: 'desktop' | 'mobile';
  onNavigate?: () => void;
}

export function NavigationLinks({ links, variant = 'desktop', onNavigate }: NavigationLinksProps) {
  const isMobile = variant === 'mobile';

  return (
    <>
      {links.map(({ label, to, end, onClick, forceActive }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={(event) => {
            onClick?.(event);
            onNavigate?.();
          }}
          className={({ isActive }) =>
            cn(
              buttonVariants({ variant: 'ghost', size: isMobile ? 'md' : 'sm' }),
              isMobile && 'justify-start',
              (forceActive ?? isActive) && 'text-primary',
            )
          }
        >
          {label}
        </NavLink>
      ))}
    </>
  );
}
