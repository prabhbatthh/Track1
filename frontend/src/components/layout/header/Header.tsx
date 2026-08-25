import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ROUTES } from '@/constants/routes';
import { cn } from '@/lib/cn';
import { useScroll } from '@/lib/useScroll';
import { useAuth } from '@/providers/AuthProvider';

import { DesktopNavigation } from './DesktopNavigation';
import { Logo } from './Logo';
import { MobileNavDrawer, MobileNavToggle } from './MobileNavigation';
import { useHeaderNavLinks } from './NavigationLinks';

export function Header() {
  const { isAuthenticated, role, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const scrolled = useScroll(10);
  const navLinks = useHeaderNavLinks();

  useEffect(() => {
    if (!open) return;

    const previousBodyOverflow = document.body.style.overflow;
    const backgroundElements = Array.from(document.querySelectorAll<HTMLElement>('main, footer'));
    const previousInert = backgroundElements.map((element) => element.inert);
    document.body.style.overflow = 'hidden';
    backgroundElements.forEach((element) => {
      element.inert = true;
    });

    if (open) {
      drawerRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      requestAnimationFrame(() => toggleRef.current?.focus());
    }

    function trapFocus(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('keydown', trapFocus);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      backgroundElements.forEach((element, index) => {
        element.inert = previousInert[index];
      });
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('keydown', trapFocus);
    };
  }, [open]);

  function handleLogout() {
    logout();
    navigate(ROUTES.HOME);
    setOpen(false);
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-20 mx-auto w-full max-w-6xl border-b border-transparent',
        'lg:rounded-2xl lg:border lg:transition-all lg:duration-300 lg:ease-out',
        scrolled &&
          !open &&
          'border-border bg-surface/90 shadow-panel backdrop-blur-lg supports-backdrop-filter:bg-surface/70 lg:top-3 lg:max-w-5xl',
        open && 'bg-surface',
      )}
    >
      <nav
        className={cn(
          'flex h-16 items-center justify-between px-4 transition-all duration-300 ease-out sm:px-6',
          scrolled && 'lg:h-14',
        )}
      >
        <Logo onClick={() => setOpen(false)} />

        <DesktopNavigation
          links={navLinks}
          isAuthenticated={isAuthenticated}
          role={role}
          onLogout={handleLogout}
        />

        <MobileNavToggle ref={toggleRef} open={open} onToggle={() => setOpen((value) => !value)} />
      </nav>

      <MobileNavDrawer
        open={open}
        links={navLinks}
        isAuthenticated={isAuthenticated}
        role={role}
        onLogout={handleLogout}
        onNavigate={() => setOpen(false)}
        panelRef={drawerRef}
      />
    </header>
  );
}
