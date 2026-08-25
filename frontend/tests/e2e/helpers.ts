
import { expect, type Page } from '@playwright/test';

// Real accounts seeded by backend/scripts/seed_dev_accounts.py — one per role, same
// credentials the Login page's "Continue as <role>" buttons use. Run that script
// against your backend before running suites that call continueAsRole.
export const DEV_PASSWORD = 'DevPreview123!';
export const DEV_EMAIL_DOMAIN = 'devpreview.internal';
export const API_BASE =
  process.env.PLAYWRIGHT_API_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_BACKEND_PORT ?? '8010'}/api/v1`;

export const ROLE_LABEL = {
  admin: 'Admin',
  member: 'Member',
  manager: 'Manager',
  librarian: 'Librarian',
  'it-head': 'IT Head',
  guardian: 'Guardian',
} as const;

export const ROLE_HOME = {
  admin: '/admin',
  member: '/dashboard',
  manager: '/dashboard',
  librarian: '/dashboard',
  'it-head': '/it-head',
  guardian: '/guardian',
} as const;

export type Role = keyof typeof ROLE_LABEL;

export async function continueAsRole(page: Page, role: Role) {
  await page.goto('/login');
  await page.getByRole('button', { name: `Continue as ${ROLE_LABEL[role]}` }).click();
  // login() is async and the click handler doesn't block on it — wait for the
  // resulting redirect (and the localStorage session write behind it) to actually
  // land before the caller does anything else, or a same-page goto() right after
  // this can race ahead of the write and see a signed-out session.
  await expect(page).toHaveURL(ROLE_HOME[role], { timeout: 15_000 });
}
