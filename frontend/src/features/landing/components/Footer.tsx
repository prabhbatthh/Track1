import { motion, type Variants, useReducedMotion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/constants/routes';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { preferredScrollBehavior } from '@/lib/scroll';

const containerVariants: Variants = {
  hidden: { opacity: 0, y: 50 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: 'easeOut', staggerChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.6, ease: 'easeOut' } },
};

const linkVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

interface FooterNavLink {
  label: string;
  to: string;
  onClick?: (e: React.MouseEvent) => void;
}

// Hoisted to module scope: a component declared inside Footer's render body would remount
// (and reset its animation state) on every re-render.
function NavList({ title, links }: { title: string; links: FooterNavLink[] }) {
  return (
    <motion.nav variants={itemVariants} aria-label={title}>
      <p className="mb-2 border-b border-border pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <ul className="flex flex-col gap-2">
        {links.map((link) => (
          <motion.li key={link.to} variants={linkVariants}>
            <Link
              to={link.to}
              onClick={link.onClick}
              className="group relative text-sm text-muted-foreground transition-colors duration-300 hover:text-foreground"
            >
              {link.label}
              <motion.span
                className="absolute bottom-0 left-0 h-0.5 bg-primary"
                initial={{ width: 0 }}
                whileHover={{ width: '100%' }}
                transition={{ duration: 0.3 }}
              />
            </Link>
          </motion.li>
        ))}
      </ul>
    </motion.nav>
  );
}

export interface FooterProps {
  /**
   * The clip-path/sticky-reveal trick below only resolves correctly when there's a full
   * page's worth of scroll content above it (true landing page usage). Pages that mount
   * this footer directly under a short page (Pricing, Login, Register, Contact Us) need
   * it to just lay out normally instead, or the reveal math leaves a large blank gap.
   */
  sticky?: boolean;
}

export function Footer({ sticky = true }: FooterProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();

  const location = useLocation();

  const navLinks: FooterNavLink[] = [
    { label: t('landing.footer.home'), to: ROUTES.HOME },
    { label: t('landing.footer.login'), to: ROUTES.LOGIN },
    { label: t('landing.footer.register'), to: ROUTES.REGISTER },
  ];

  // handler: if already on contact page, smooth scroll to the anchor; otherwise navigate to the contact route
  function contactClickHandler(e: React.MouseEvent) {
    if (location.pathname === ROUTES.CONTACT_US) {
      e.preventDefault();
      const el = document.getElementById('contact-us');
      if (el) el.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' });
      return;
    }
    // allow Link to navigate to the contact page and the ContactUsPage's effect will scroll on mount
  }

  const quickLinks: FooterNavLink[] = [
    { label: t('nav.pricing'), to: ROUTES.PRICING },
    { label: t('landing.footer.books'), to: ROUTES.BOOKS },
    { label: t('landing.footer.community'), to: ROUTES.COMMUNITY },
    { label: t('landing.footer.events'), to: ROUTES.EVENTS },
    // direct to the contact-us section anchor for smooth scroll/navigation
    { label: t('landing.footer.contact'), to: `${ROUTES.CONTACT_US}#contact-us`, onClick: contactClickHandler },
  ];

  const content = (
    <motion.div
      initial={reduceMotion ? 'visible' : 'hidden'}
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      variants={containerVariants}
      className="relative flex h-full w-full flex-col justify-between overflow-hidden bg-surface px-4 py-6 md:px-12 md:py-12"
    >
      <h2 id="footer-heading" className="sr-only">
        {t('landing.footer.heading')}
      </h2>

      <div className="relative z-20 grid grid-cols-2 gap-6 md:grid-cols-3 md:gap-12 lg:gap-20">
        <motion.div variants={itemVariants}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">{t('landing.footer.brand')}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('landing.footer.description')}
              </p>
            </div>
            <div className="ml-4 hidden md:block">
              {/* LanguageSwitcher for landing footer */}
              <LanguageSwitcher />
            </div>
          </div>
        </motion.div>
        <NavList title={t('landing.footer.navigation')} links={navLinks} />
        <NavList title={t('landing.footer.quickLinks')} links={quickLinks} />
      </div>

      <motion.p
        variants={itemVariants}
        className="relative z-20 mt-6 text-xs text-muted-foreground md:text-sm"
      >
        © {new Date().getFullYear()} {t('landing.footer.brand')}.{' '}
        {t('landing.footer.description') && ''}
      </motion.p>
    </motion.div>
  );

  if (!sticky) {
    return <div className="h-[70vh]">{content}</div>;
  }

  return (
    // ponytail: clip-path sticky-reveal trick, swap for scroll-driven animation API when browser support allows
    <div
      className="relative h-[70vh]"
      style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' }}
    >
      <div className="relative top-[-100vh] h-[170vh]">
        <div className="sticky top-[30vh] h-[70vh]">{content}</div>
      </div>
    </div>
  );
}
