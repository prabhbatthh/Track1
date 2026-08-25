import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { AppProviders } from '@/providers/AppProviders';

describe('AppRouter', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/dashboard');
  });

  it(
    'redirects unauthenticated users away from protected routes to login',
    async () => {
      const { AppRouter } = await import('./AppRouter');

      render(
        <AppProviders>
          <AppRouter />
        </AppProviders>,
      );

      expect(await screen.findByRole('heading', { name: /log in/i }, { timeout: 15000 })).toBeInTheDocument();
    },
    // ponytail: the router's cold import now pulls in every routed page (a lot of them,
    // and growing) — the default 5s timeout stopped being enough. Bump per-test rather
    // than globally, since this is the one test that pays the full cold-import cost.
    45000,
  );
});
