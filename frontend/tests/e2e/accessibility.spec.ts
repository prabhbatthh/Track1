import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

import { continueAsRole, type Role } from './helpers';

// Sections throughout the site fade in via framer-motion's whileInView (viewport:
// { once: true, amount: 0.3 }), so a scan taken right after navigation can catch
// some still at opacity: 0 — a transient animation frame, not a real contrast
// defect. There's no CSS-only way to force that state, since it's gated on an
// actual IntersectionObserver hit, not just a media query or transition. So this
// repeatedly finds whatever's still hidden and scrolls it to the viewport center
// (comfortably past the 30% threshold) until nothing is left, or gives up after a
// few rounds — at which point a real remaining violation is a real bug.
//
// Separately, things like the landing hero's RotatingWord cycle forever via
// AnimatePresence (never reach a single settled state to wait for), so
// beforeEach below also emulates prefers-reduced-motion — AppProviders'
// <MotionConfig reducedMotion="user"> then collapses every transition,
// including that one's enter/exit cross-fade, to effectively zero duration.
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function revealScrollAnimations(page: import('@playwright/test').Page) {
  for (let round = 0; round < 8; round++) {
    const remaining = await page.evaluate(() => {
      const hidden = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(
        (el) => parseFloat(getComputedStyle(el).opacity) < 1,
      );
      for (const el of hidden) el.scrollIntoView({ block: 'center' });
      return hidden.length;
    });
    if (remaining === 0) break;
    // FadeUp staggers by index (delay * ~150ms) before its own ~400ms transition
    // even starts, so a hero section several stagger slots deep needs the better
    // part of a second to actually finish, not just begin.
    await page.waitForTimeout(700);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

// WCAG 2 A/AA is the bar the library platform targets; axe's best-practice rule set
// is left out since those are style opinions, not conformance failures.
async function expectNoAccessibilityViolations(page: import('@playwright/test').Page) {
  await revealScrollAnimations(page);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(
    results.violations,
    JSON.stringify(results.violations, null, 2),
  ).toEqual([]);
}

test.describe('Accessibility — public pages', () => {
  for (const path of ['/', '/login', '/register', '/pricing', '/contact-us']) {
    test(`${path} has no automatically detectable a11y violations`, async ({ page }) => {
      await page.goto(path);
      await expectNoAccessibilityViolations(page);
    });
  }
});

test.describe('Accessibility — authenticated pages', () => {
  const cases: Array<{ role: Role; path: string }> = [
    { role: 'member', path: '/dashboard' },
    { role: 'member', path: '/books' },
    { role: 'admin', path: '/admin' },
    { role: 'admin', path: '/admin/members' },
    { role: 'it-head', path: '/it-head' },
    { role: 'guardian', path: '/guardian' },
  ];

  for (const { role, path } of cases) {
    test(`${path} (as ${role}) has no automatically detectable a11y violations`, async ({
      page,
    }) => {
      await continueAsRole(page, role);
      await page.goto(path);
      await expectNoAccessibilityViolations(page);
    });
  }

  test('/payment (as member) has no automatically detectable a11y violations', async ({
    page,
  }) => {
    await continueAsRole(page, 'member');
    await page.goto('/payment?amount=499&label=Overdue%20fine');
    await expectNoAccessibilityViolations(page);
  });
});
