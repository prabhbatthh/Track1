import { expect, test, type Route } from '@playwright/test';

import { continueAsRole } from './helpers';

test.describe('Responsive navigation', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('closed menu is absent from the accessibility tree and Escape restores focus', async ({
    page,
  }) => {
    await page.goto('/');

    const toggle = page.getByRole('button', { name: 'Open navigation' });
    await expect(page.getByRole('dialog', { name: 'Navigation' })).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    const navigation = page.getByRole('dialog', { name: 'Navigation' });
    await expect(navigation).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close navigation' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(navigation.getByRole('link', { name: 'Home' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(navigation).toHaveCount(0);
    await expect(toggle).toBeFocused();
  });
});

test.describe('Payment validation', () => {
  test.beforeEach(async ({ page }) => {
    await continueAsRole(page, 'member');
  });

  test('blocks non-positive and non-finite tampered amounts', async ({ page }) => {
    for (const amount of ['0', '-50', 'Infinity', 'not-a-number']) {
      await page.goto(`/payment?amount=${encodeURIComponent(amount)}&label=Fine`);

      await expect(page.getByText('Invalid payment amount')).toBeVisible();
      await expect(
        page.getByRole('button', { name: /Pay securely|Notify the Manager/ }),
      ).toHaveCount(0);
    }
  });

  test('shows a recoverable error when a membership plan cannot be loaded', async ({ page }) => {
    await page.route('**/api/v1/pricing-plans', (route: Route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: '{"detail":"Plans offline"}',
      }),
    );
    await page.goto('/payment?plan=missing-plan');

    await expect(page.getByText('Payment details unavailable')).toBeVisible();
    await expect(page.getByText('Plans offline')).toBeVisible();
    await expect(page.getByRole('button', { name: /Retry|Try again/i })).toBeVisible();
  });
});

test.describe('Seat availability states', () => {
  test('does not advertise seats as available when the schedule request fails', async ({
    page,
  }) => {
    await continueAsRole(page, 'member');
    await page.route('**/api/v1/seat-booking/schedule?*', (route: Route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"Schedule offline"}',
      }),
    );

    await page.goto('/seat-booking');
    await expect(page.getByText('Seat availability unavailable')).toBeVisible();
    await expect(page.getByText('Schedule offline')).toBeVisible();
    await expect(page.getByRole('button', { name: /Seat A1, Available/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Retry|Try again/i })).toBeVisible();
  });
});

test.describe('Event registration states', () => {
  test('explains and blocks registration for a full event', async ({ page }) => {
    await continueAsRole(page, 'member');
    const event = {
      id: 'full-event',
      title: 'Full reading circle',
      date: new Date(Date.now() + 86_400_000).toISOString(),
      location: 'Main hall',
      description: 'A full event',
      attendees: 10,
      capacity: 10,
      registered: false,
      registrants: [],
      assigned_managers: [],
    };
    await page.route('**/api/v1/events?page_size=100*', (route: Route) =>
      route.fulfill({ json: { items: [event], total: 1 } }),
    );
    await page.route('**/api/v1/events/summary', (route: Route) =>
      route.fulfill({
        json: { total_events_this_month: 1, total_attendees: 10, average_attendance_rate: 1 },
      }),
    );

    await page.goto('/events');
    await page.getByRole('button', { name: 'View Details' }).click();
    await expect(
      page.getByText('Registration is closed because this event is full.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Register' })).toBeDisabled();
  });
});

test.describe('Event management', () => {
  test('only requests eligible managers for event assignment', async ({ page }) => {
    let managerQueryWasUsed = false;
    await page.route('**/api/v1/members?*', async (route: Route) => {
      const url = new URL(route.request().url());
      managerQueryWasUsed =
        url.searchParams.get('role') === 'manager' &&
        url.searchParams.get('active_only') === 'true';
      await route.fulfill({
        json: {
          items: [
            {
              id: 'eligible-manager',
              email: 'eligible@example.com',
              full_name: 'Eligible Manager',
              phone: null,
              avatar_url: null,
              role: { id: 'manager-role', name: 'manager' },
              is_active: true,
              last_login_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
          total: 1,
          page: 1,
          page_size: 100,
        },
      });
    });

    await continueAsRole(page, 'manager');
    await page.getByRole('button', { name: 'Create Event' }).click();

    await expect(page.getByRole('checkbox', { name: 'Eligible Manager' })).toBeVisible();
    expect(managerQueryWasUsed).toBe(true);
  });
});

test.describe('Administrative safety and recovery', () => {
  test('dashboard API failures render retryable errors instead of empty success states', async ({
    page,
  }) => {
    await page.route('**/api/v1/admin/dashboard', (route: Route) => route.fulfill({ status: 500 }));
    await page.route('**/api/v1/billing-requests', (route: Route) => route.fulfill({ status: 500 }));
    await page.route('**/api/v1/admin/audit-log**', (route: Route) => route.fulfill({ status: 500 }));
    await continueAsRole(page, 'admin');

    await expect(page.getByText('Something went wrong')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(3);
  });

  test('role changes and deactivation require confirmation before any request', async ({
    page,
  }) => {
    let updateRequests = 0;
    await page.route('**/api/v1/members/*', async (route: Route) => {
      if (route.request().method() === 'PUT') updateRequests += 1;
      await route.continue();
    });
    await continueAsRole(page, 'admin');
    await page.goto('/admin/members');
    await page.getByRole('searchbox', { name: 'Search' }).fill('admin@devpreview.internal');

    const selfRow = page.getByRole('row').filter({ hasText: 'admin@devpreview.internal' });
    await selfRow.getByRole('combobox').selectOption('member');
    const roleDialog = page.getByRole('dialog', { name: 'Change member role?' });
    await expect(roleDialog).toBeVisible();
    await roleDialog.getByRole('button', { name: 'Cancel' }).click();

    await selfRow.getByRole('button', { name: 'Deactivate' }).click();
    const deactivateDialog = page.getByRole('dialog', { name: 'Deactivate member?' });
    await expect(deactivateDialog).toBeVisible();
    await deactivateDialog.getByRole('button', { name: 'Cancel' }).click();

    expect(updateRequests).toBe(0);
  });
});

test('public translation demo remains usable without authentication', async ({ page }) => {
  let requestWasAuthenticated = false;
  await page.route('**/api/v1/translate', async (route: Route) => {
    requestWasAuthenticated = Boolean(route.request().headers().authorization);
    await route.fulfill({ json: { translated: 'पुस्तकालय में आपका स्वागत है' } });
  });

  await page.goto('/translate-demo');
  await expect(page.getByRole('heading', { level: 1, name: 'Translation demo' })).toBeVisible();
  await page.getByLabel('Text to translate').fill('Welcome to the library');
  await expect(page.getByText('पुस्तकालय में आपका स्वागत है')).toBeVisible();
  expect(requestWasAuthenticated).toBe(false);
});
