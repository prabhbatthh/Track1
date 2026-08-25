import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { API_BASE, DEV_EMAIL_DOMAIN, DEV_PASSWORD, type Role } from './helpers';

type Theme = 'light' | 'dark';
type RouteCase = { name: string; path: string | (() => string); role?: Role };
type StoredAuth = Record<string, unknown>;

// Every route is checked at the narrowest supported mobile width and at the
// primary desktop/a11y width. Intermediate breakpoint behavior is exercised by
// the focused responsive specs below and in responsive-accessibility-regressions,
// so repeating all nine widths for every route only multiplies CI time without
// adding a distinct assertion.
const routeAuditViewports = [
  { width: 320, height: 568 },
  { width: 1280, height: 900 },
] as const;

const authStates = new Map<Role, StoredAuth>();
let seededBookId = '';
test.beforeAll(async ({ request }) => {
  for (const role of ['admin', 'member', 'manager', 'librarian', 'it-head', 'guardian'] as const) {
    let response = await request.post(`${API_BASE}/auth/login`, {
      data: { email: `${role}@${DEV_EMAIL_DOMAIN}`, password: DEV_PASSWORD },
    });
    for (let attempt = 1; !response.ok() && attempt < 3; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
      response = await request.post(`${API_BASE}/auth/login`, {
        data: { email: `${role}@${DEV_EMAIL_DOMAIN}`, password: DEV_PASSWORD },
      });
    }
    expect(
      response.ok(),
      `Unable to prepare ${role} session (${response.status()}): ${await response.text()}`,
    ).toBe(true);
    const data = await response.json();
    authStates.set(role, {
      isAuthenticated: true,
      role: data.user.role.name,
      token: data.access_token,
      refreshToken: data.refresh_token,
      userId: data.user.id,
      fullName: data.user.full_name,
      email: data.user.email,
      phone: data.user.phone,
      avatarUrl: data.user.avatar_url,
      needsProfileCompletion: false,
      postAuthRedirect: null,
    });
  }

  const memberToken = authStates.get('member')?.token;
  const booksResponse = await request.get(`${API_BASE}/books?page=1&page_size=1`, {
    headers: { Authorization: `Bearer ${String(memberToken)}` },
  });
  expect(booksResponse.ok(), 'Unable to prepare a seeded book route').toBe(true);
  const books = (await booksResponse.json()) as { items: Array<{ id: string }> };
  expect(
    books.items.length,
    'Responsive detail-page coverage requires a seeded book',
  ).toBeGreaterThan(0);
  seededBookId = books.items[0].id;
});

const publicRoutes: RouteCase[] = [
  { name: 'landing', path: '/' },
  { name: 'pricing', path: '/pricing' },
  { name: 'contact', path: '/contact-us' },
  { name: 'translate', path: '/translate-demo' },
  { name: 'login', path: '/login' },
  { name: 'register', path: '/register' },
  { name: 'forgot password', path: '/forgot-password' },
  { name: 'reset password', path: '/reset-password?token=invalid-responsive-audit-token' },
  { name: 'not found', path: '/does-not-exist' },
];

const authenticatedRoutes: RouteCase[] = [
  { name: 'member dashboard', path: '/dashboard', role: 'member' },
  { name: 'books', path: '/books', role: 'member' },
  { name: 'book details', path: () => `/books/${seededBookId}`, role: 'member' },
  { name: 'borrow history', path: '/borrow-history', role: 'member' },
  { name: 'reservations', path: '/reservations', role: 'member' },
  { name: 'seat booking', path: '/seat-booking', role: 'member' },
  { name: 'payment', path: '/payment?plan=1m&label=Monthly%20membership', role: 'member' },
  { name: 'community', path: '/community', role: 'member' },
  { name: 'events', path: '/events', role: 'member' },
  { name: 'profile', path: '/profile', role: 'member' },
  { name: 'reading progress', path: '/reading-progress', role: 'member' },
  { name: 'leaderboard', path: '/leaderboard', role: 'member' },
  { name: 'reviews', path: '/reviews', role: 'member' },
  { name: 'book reviews', path: () => `/reviews/${seededBookId}`, role: 'member' },
  { name: 'support', path: '/support', role: 'member' },
  { name: 'settings', path: '/settings', role: 'member' },
  { name: 'manager dashboard', path: '/dashboard', role: 'manager' },
  { name: 'manager books', path: '/manager/books', role: 'manager' },
  { name: 'manager borrow history', path: '/manager/borrow-history', role: 'manager' },
  { name: 'librarian dashboard', path: '/dashboard', role: 'librarian' },
  { name: 'admin dashboard', path: '/admin', role: 'admin' },
  { name: 'admin members', path: '/admin/members', role: 'admin' },
  { name: 'admin payments', path: '/admin/payments', role: 'admin' },
  { name: 'IT head dashboard', path: '/it-head', role: 'it-head' },
  { name: 'guardian dashboard', path: '/guardian', role: 'guardian' },
];

async function setStateBeforeLoad(page: Page, theme: Theme, role?: Role) {
  const authState = role ? authStates.get(role) : undefined;
  await page.addInitScript(
    ({ selectedTheme, storedAuth }: { selectedTheme: Theme; storedAuth?: StoredAuth }) => {
      localStorage.setItem('theme', JSON.stringify(selectedTheme));
      if (storedAuth) localStorage.setItem('mock-auth', JSON.stringify(storedAuth));
      else localStorage.removeItem('mock-auth');
    },
    { selectedTheme: theme, storedAuth: authState },
  );
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
}

async function revealScrollAnimations(page: Page) {
  // Sweep the document viewport rather than calling scrollIntoView on every
  // translucent element. Decorative blobs can live outside an overflow-hidden
  // section; scrolling one of those into view mutates that section's scrollLeft
  // and makes a healthy layout appear horizontally clipped.
  const scrollStops = await page.evaluate(() => {
    const maximum = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const step = Math.max(320, Math.floor(window.innerHeight * 0.75));
    const stops: number[] = [];
    for (let position = 0; position < maximum; position += step) stops.push(position);
    stops.push(maximum);
    return stops;
  });
  for (const position of scrollStops) {
    await page.evaluate((top: number) => window.scrollTo({ top, left: 0, behavior: 'auto' }), position);
    await page.waitForTimeout(80);
  }
  // A newly intersecting staggered group can report its pre-animation opacity
  // before Motion applies the hidden frame. Let the longest card stagger settle
  // before axe measures effective foreground/background colors.
  await page.waitForTimeout(700);
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function expectHealthyLayout(page: Page, theme: Theme, includeAccessibilityScan = true) {
  await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark).*$/);
  await expect(page.locator('main')).toBeVisible();
  await revealScrollAnimations(page);

  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const overflowingControls = Array.from(
      document.querySelectorAll<HTMLElement>(
        'main button, main a, main input, main select, main textarea',
      ),
    )
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        let ancestor: HTMLElement | null = element.parentElement;
        let hasScrollableAncestor = false;
        while (ancestor) {
          const ancestorStyle = getComputedStyle(ancestor);
          if (
            (ancestorStyle.overflowX === 'auto' || ancestorStyle.overflowX === 'scroll') &&
            ancestor.scrollWidth > ancestor.clientWidth
          ) {
            hasScrollableAncestor = true;
            break;
          }
          ancestor = ancestor.parentElement;
        }
        return (
          !hasScrollableAncestor &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0 &&
          (rect.left < -2 || rect.right > window.innerWidth + 2)
        );
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const transformedAncestors: string[] = [];
        const ancestorRects: string[] = [];
        let ancestor: HTMLElement | null = element;
        while (ancestor) {
          const transform = getComputedStyle(ancestor).transform;
          if (transform !== 'none')
            transformedAncestors.push(`${ancestor.tagName.toLowerCase()}:${transform}`);
          if (ancestorRects.length < 5) {
            const ancestorRect = ancestor.getBoundingClientRect();
            ancestorRects.push(
              `${ancestor.tagName.toLowerCase()}[${Math.round(ancestorRect.left)},${Math.round(ancestorRect.right)}]`,
            );
          }
          ancestor = ancestor.parentElement;
        }
        return `${element.tagName.toLowerCase()}:${element.textContent?.trim().slice(0, 40)} [${Math.round(rect.left)}, ${Math.round(rect.right)}] scrollX=${window.scrollX} transforms=${transformedAncestors.join('|')} ancestors=${ancestorRects.join('|')}`;
      });

    const clippedText = Array.from(
      document.querySelectorAll<HTMLElement>(
        'main h1, main h2, main h3, main p, main label, main button',
      ),
    )
      .filter((element) => {
        const style = getComputedStyle(element);
        if (
          element.classList.contains('sr-only') ||
          element.classList.contains('truncate') ||
          style.webkitLineClamp !== 'none'
        )
          return false;
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          element.getBoundingClientRect().width > 0 &&
          (element.scrollWidth > element.clientWidth + 1 ||
            element.scrollHeight > element.clientHeight + 1) &&
          (style.overflow === 'hidden' ||
            style.overflowX === 'hidden' ||
            style.overflowY === 'hidden')
        );
      })
      .map(
        (element) => `${element.tagName.toLowerCase()}:${element.textContent?.trim().slice(0, 40)}`,
      );

    const rawTranslationKeys = Array.from(document.querySelectorAll<HTMLElement>('main *'))
      .filter((element) => element.children.length === 0 && element.getClientRects().length > 0)
      .flatMap((element) => element.textContent?.trim().split(/\s+/) ?? [])
      .filter((token) => /^[a-z][\w-]*(?:\.[\w-]+){2,}$/.test(token));

    return {
      horizontalOverflow: root.scrollWidth - root.clientWidth,
      overflowingControls,
      clippedText,
      rawTranslationKeys: [...new Set(rawTranslationKeys)],
    };
  });

  expect(layout.horizontalOverflow, JSON.stringify(layout, null, 2)).toBeLessThanOrEqual(1);
  expect(layout.overflowingControls, JSON.stringify(layout, null, 2)).toEqual([]);
  expect(layout.clippedText, JSON.stringify(layout, null, 2)).toEqual([]);
  expect(layout.rawTranslationKeys, JSON.stringify(layout, null, 2)).toEqual([]);

  if (includeAccessibilityScan) {
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(accessibility.violations, JSON.stringify(accessibility.violations, null, 2)).toEqual([]);
  }
}

async function expectResponsiveLayout(page: Page) {
  await expect(page.locator('main')).toBeVisible();
  await page.waitForTimeout(250);

  const issues = await page.evaluate(() => {
    const isVisible = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        parseFloat(style.opacity) > 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };

    const hasHorizontalScroller = (element: HTMLElement) => {
      if (element.closest('[data-overflow-viewport]')) return true;
      let ancestor: HTMLElement | null = element.parentElement;
      while (ancestor) {
        const style = getComputedStyle(ancestor);
        if (
          (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
          ancestor.scrollWidth > ancestor.clientWidth
        ) {
          return true;
        }
        ancestor = ancestor.parentElement;
      }
      return false;
    };

    const viewportBoundSelector = [
      'main h1',
      'main h2',
      'main h3',
      'main p',
      'main button',
      'main a',
      'main input',
      'main select',
      'main textarea',
      'main table',
      'main [role="alert"]',
      '[role="dialog"]',
    ].join(',');

    const outsideViewport = Array.from(
      document.querySelectorAll<HTMLElement>(viewportBoundSelector),
    )
      .filter((element) => {
        if (!isVisible(element) || hasHorizontalScroller(element)) return false;
        const rect = element.getBoundingClientRect();
        return rect.left < -2 || rect.right > window.innerWidth + 2;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return `${element.tagName.toLowerCase()}:${element.textContent?.trim().slice(0, 50)} [${Math.round(rect.left)},${Math.round(rect.right)}]`;
      });

    const clippedText = Array.from(
      document.querySelectorAll<HTMLElement>(
        'main h1, main h2, main h3, main p, main label, main button',
      ),
    )
      .filter((element) => {
        if (!isVisible(element)) return false;
        const style = getComputedStyle(element);
        if (
          element.classList.contains('sr-only') ||
          element.classList.contains('truncate') ||
          style.webkitLineClamp !== 'none'
        ) {
          return false;
        }
        return (
          (element.scrollWidth > element.clientWidth + 1 ||
            element.scrollHeight > element.clientHeight + 1) &&
          (style.overflow === 'hidden' ||
            style.overflowX === 'hidden' ||
            style.overflowY === 'hidden')
        );
      })
      .map(
        (element) => `${element.tagName.toLowerCase()}:${element.textContent?.trim().slice(0, 50)}`,
      );

    const offscreenFixedControls = Array.from(
      document.querySelectorAll<HTMLElement>('button, a, input, select, textarea'),
    )
      .filter((element) => {
        if (!isVisible(element) || getComputedStyle(element).position !== 'fixed') return false;
        const rect = element.getBoundingClientRect();
        return (
          rect.left < -2 ||
          rect.right > window.innerWidth + 2 ||
          rect.top < -2 ||
          rect.bottom > window.innerHeight + 2
        );
      })
      .map(
        (element) =>
          `${element.tagName.toLowerCase()}:${element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 50)}`,
      );

    return {
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      outsideViewport,
      clippedText,
      offscreenFixedControls,
    };
  });

  expect(issues.documentOverflow, JSON.stringify(issues, null, 2)).toBeLessThanOrEqual(16);
  expect(issues.outsideViewport, JSON.stringify(issues, null, 2)).toEqual([]);
  expect(issues.clippedText, JSON.stringify(issues, null, 2)).toEqual([]);
  expect(issues.offscreenFixedControls, JSON.stringify(issues, null, 2)).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme route audit`, () => {
    for (const route of [...publicRoutes, ...authenticatedRoutes]) {
      test(`${route.name} renders without visual layout or accessibility defects`, async ({
        page,
      }) => {
        await setStateBeforeLoad(page, theme, route.role);
        for (const viewport of routeAuditViewports) {
          await page.setViewportSize(viewport);
          await page.goto(typeof route.path === 'function' ? route.path() : route.path);
          await page.waitForLoadState('domcontentloaded');
          if (viewport.width === 1280) await expectHealthyLayout(page, theme);
          else await expectResponsiveLayout(page);
        }
      });
    }
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`community banner remains readable and unclipped at responsive widths in ${theme}`, async ({
    page,
  }) => {
    await setStateBeforeLoad(page, theme);
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const banner = page
        .getByText('Together, we build a stronger', { exact: false })
        .locator('..')
        .locator('..')
        .locator('..');
      await banner.scrollIntoViewIfNeeded();

      const dimensions = await banner.evaluate((element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        const count = Array.from(element.querySelectorAll<HTMLElement>('span')).find(
          (candidate) => candidate.textContent?.trim() === '2K+',
        );
        return {
          left: rect.left,
          right: rect.right,
          width: rect.width,
          countClipped: count ? count.scrollWidth > count.clientWidth : true,
        };
      });

      expect(dimensions.left).toBeGreaterThanOrEqual(0);
      expect(dimensions.right).toBeLessThanOrEqual(width);
      expect(dimensions.width).toBeGreaterThan(0);
      expect(dimensions.countClipped).toBe(false);
    }
  });
}
