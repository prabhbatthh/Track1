import { Outlet, ScrollRestoration, useLocation } from 'react-router-dom';

import { Footer as LandingFooter } from '@/features/landing/components/Footer';
import { Footer, Header } from '@/components/layout';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/lib/cn';

const largeFooterRoutes = [
  ROUTES.PRICING,
  ROUTES.CONTACT_US,
  ROUTES.LOGIN,
  ROUTES.REGISTER,
] as const;

export function PublicLayout() {
  const location = useLocation();
  const pathname = location.pathname;
  const isLandingPage = pathname === ROUTES.HOME;
  const isLargeFooterPage = largeFooterRoutes.includes(pathname as typeof largeFooterRoutes[number]);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Router doesn't reset scroll on navigation by default, so Home/Pricing/Contact Us kept
          the previous page's offset. Renders nothing, and it defers to location.hash when
          present — the "Reviews" link's #testimonials scroll still works. */}
      <ScrollRestoration />
      <Header />
      {/* pb-24 reserves space under the fixed ChatbotWidget (size-14 button + margin),
          matching AppShellLayout's reserve, so it never sits on top of page/footer content.
          Skipped whenever the large Footer follows (landing page, and largeFooterRoutes
          below): it's a 70vh block that already clears the widget on its own — adding
          pb-24 before it just left a dangling empty gap at the end of the page. */}
      <main className={cn('flex-1', !isLandingPage && !isLargeFooterPage && 'pb-24')}>
        <Outlet />
      </main>
      {isLandingPage ? null : isLargeFooterPage ? <LandingFooter sticky={false} /> : <Footer minimal />}
    </div>
  );
}
