import { BookOpen, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Outlet, ScrollRestoration } from 'react-router-dom';

import { Footer, Sidebar, SidebarPromo, TopBar } from '@/components/layout';
import { Button } from '@/components/ui';
import type { NavItem } from '@/constants/navigation';
import { cn } from '@/lib/cn';
import { useLocalStorageState } from '@/lib/useLocalStorageState';
import { NotificationsPanelProvider } from '@/providers/NotificationsPanelProvider';
import { PageHeadingProvider } from '@/providers/PageHeadingProvider';

export interface AppShellLayoutProps {
  items: NavItem[];
}

export function AppShellLayout({ items }: AppShellLayoutProps) {
  const { t } = useTranslation();
  // One key, not one per role: every dashboard (member, manager, admin, IT head, guardian)
  // renders this same shell, so collapsing it anywhere collapses it everywhere and the
  // choice survives reloads and role switches.
  const [collapsed, setCollapsed] = useLocalStorageState('sidebar:collapsed', false);

  return (
    // Wraps TopBar and the Outlet together: the TopBar registers the heading slot, and the
    // page rendered by the Outlet portals its PageHeader/PageTitle heading into it.
    <PageHeadingProvider>
      <NotificationsPanelProvider>
      <div className="flex min-h-screen">
        <a
          href="#app-main-content"
          className="sr-only z-50 rounded-md bg-surface px-4 py-2 text-foreground shadow-panel focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to main content
        </a>
        {/* Router doesn't reset scroll on navigation by default, so moving between pages kept
            the previous page's offset. Renders nothing; also restores position on back/forward. */}
        <ScrollRestoration />
        {/* Pinned to the viewport (sticky + h-screen + self-start, rather than stretching to
            the full page height) so the nav stays reachable on long dashboards instead of
            scrolling away with the content. overflow-y-auto keeps it usable when a role's nav
            is taller than a short viewport. z-30 clears in-page dropdowns (z-20) but stays
            under the chatbot (z-40) and modals (z-50). */}
        <aside
          className={cn(
            'hidden shrink-0 border-r border-border bg-surface transition-[width] duration-200 md:sticky md:top-0 md:z-30 md:block md:h-screen md:self-start md:overflow-y-auto',
            collapsed ? 'w-16' : 'w-60',
          )}
        >
          {/* h-16 and the bottom border match TopBar's, so the toggle sits on the same line as
              the header controls instead of floating above the first nav item. */}
          <div
            className={cn(
              'flex h-16 items-center gap-2 border-b border-border px-3',
              collapsed ? 'justify-center' : 'justify-between',
            )}
          >
            {/* Same badge + brandShort treatment as the public header's Logo, so the two
                headers read as one product. Dropped when collapsed — the 4rem rail only has
                room for the toggle, which has to stay reachable to get the sidebar back. */}
            {!collapsed && (
              <span className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <BookOpen className="size-4" />
                </span>
                <span className="truncate">{t('common.brandShort')}</span>
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="size-10 p-0"
              aria-label={collapsed ? t('topBar.expandSidebar') : t('topBar.collapseSidebar')}
              aria-expanded={!collapsed}
              aria-controls="app-sidebar-nav"
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-5" />
              ) : (
                <PanelLeftClose className="size-5" />
              )}
            </Button>
          </div>
          <Sidebar id="app-sidebar-nav" items={items} collapsed={collapsed} />
          {!collapsed && <SidebarPromo />}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar items={items} />
          {/* pb-24 reserves space under the fixed ChatbotWidget (size-14 button + margin) so it
              never sits on top of the last row of dashboard controls. */}
          <main id="app-main-content" tabIndex={-1} className="flex-1 p-6 pb-24">
            <Outlet />
          </main>
          <Footer minimal />
        </div>
      </div>
      </NotificationsPanelProvider>
    </PageHeadingProvider>
  );
}
