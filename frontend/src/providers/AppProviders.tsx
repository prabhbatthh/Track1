import { lazy, Suspense, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { Toaster } from 'sonner';

import { queryClient } from '@/lib/queryClient';

// Not needed for first paint (a floating action button, not page content) — lazy-loaded
// like every route page, keeping its ~378-line component + conversation-tree data out of
// the eager entry bundle. fallback={null} is fine: the button just appears a beat later.
const ChatbotWidget = lazy(() =>
  import('@/components/layout/ChatbotWidget').then((m) => ({ default: m.ChatbotWidget })),
);

import { AnnouncementPopup } from '@/features/notifications/components/AnnouncementPopup';

import { ActiveSectionProvider } from './ActiveSectionProvider';
import { AuthProvider } from './AuthProvider';
import { LanguageProvider } from './LanguageProvider';
import { ThemeProvider } from './ThemeProvider';

export interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      {/* reduceMotion="user" makes every Framer Motion animation site-wide honor prefers-reduced-motion.
          Toaster (sonner) doesn't use framer-motion, so it sits outside this scope — everything
          else here does render motion components (ChatbotWidget included) and must stay inside. */}
      <MotionConfig reducedMotion="user">
        <LanguageProvider>
          <ThemeProvider>
            <AuthProvider>
              <ActiveSectionProvider>
                {children}
                {/* Mounted here rather than per-layout so an announcement interrupts every
                    authenticated screen. It renders null when signed out, since the
                    notifications query it reads is disabled without a session. */}
                <AnnouncementPopup />
                <Suspense fallback={null}>
                  <ChatbotWidget />
                </Suspense>
              </ActiveSectionProvider>
            </AuthProvider>
          </ThemeProvider>
        </LanguageProvider>
      </MotionConfig>
      <Toaster richColors closeButton position="top-right" />
    </QueryClientProvider>
  );
}
