import { expect, test, type APIRequestContext } from '@playwright/test';

import { API_BASE, continueAsRole, DEV_PASSWORD } from './helpers';

const DAY_MS = 86_400_000;

interface DashboardEvent {
  id: string;
  title: string;
  date: string;
}

function eventAt(id: string, title: string, offsetDays: number): DashboardEvent {
  return {
    id,
    title,
    date: new Date(Date.now() + offsetDays * DAY_MS).toISOString(),
  };
}

async function managerToken(request: APIRequestContext): Promise<string> {
  const response = await request.post(`${API_BASE}/auth/login`, {
    data: {
      email: 'manager@devpreview.internal',
      password: DEV_PASSWORD,
    },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()).access_token as string;
}

test.describe('Member dashboard event synchronization', () => {
  test('real API lifecycle stays consistent across events and dashboard', async ({
    page,
    request,
  }) => {
    test.setTimeout(60_000);
    const token = await managerToken(request);
    const suffix = `${Date.now()}-${test.info().workerIndex}`;
    const originalTitle = `Lifecycle event ${suffix}`;
    const updatedTitle = `Updated lifecycle event ${suffix}`;
    let eventId: string | undefined;

    try {
      const created = await request.post(`${API_BASE}/events`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          title: originalTitle,
          description: 'Created by the Playwright dashboard synchronization contract',
          location: 'Automation Hall',
          date: new Date(Date.now() + 7 * DAY_MS).toISOString(),
          capacity: 20,
          manager_ids: [],
        },
      });
      expect(created.status()).toBe(201);
      eventId = (await created.json()).id as string;

      await continueAsRole(page, 'member');
      await expect(page.getByText(originalTitle, { exact: true })).toBeVisible({ timeout: 15_000 });

      await page.goto('/events');
      await expect(page.getByRole('heading', { name: originalTitle })).toBeVisible({ timeout: 15_000 });

      const updated = await request.put(`${API_BASE}/events/${eventId}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { title: updatedTitle },
      });
      expect(updated.ok()).toBe(true);

      await page.goto('/dashboard');
      await expect(page.getByText(updatedTitle, { exact: true })).toBeVisible();
      await expect(page.getByText(originalTitle, { exact: true })).toHaveCount(0);

      const movedToPast = await request.put(`${API_BASE}/events/${eventId}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { date: new Date(Date.now() - DAY_MS).toISOString() },
      });
      expect(movedToPast.ok()).toBe(true);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(page.getByText(updatedTitle, { exact: true })).toHaveCount(0);

      const movedBackToFuture = await request.put(`${API_BASE}/events/${eventId}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { date: new Date(Date.now() + 8 * DAY_MS).toISOString() },
      });
      expect(movedBackToFuture.ok()).toBe(true);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(page.getByText(updatedTitle, { exact: true })).toBeVisible();

      const removed = await request.delete(`${API_BASE}/events/${eventId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(removed.status()).toBe(204);
      eventId = undefined;

      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(page.getByText(updatedTitle, { exact: true })).toHaveCount(0);
      await page.goto('/events');
      await expect(page.getByRole('heading', { name: updatedTitle })).toHaveCount(0);
    } finally {
      if (eventId) {
        await request.delete(`${API_BASE}/events/${eventId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    }
  });

  test('shows loading honestly and never flashes a false empty state', async ({ page }) => {
    let releaseResponse: (() => void) | undefined;
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });

    await page.route('**/api/v1/events?page_size=100*', async (route) => {
      await responseGate;
      await route.fulfill({
        json: { items: [eventAt('delayed', 'Delayed reading circle', 1)], total: 1 },
      });
    });

    await continueAsRole(page, 'member');
    await expect(page.getByRole('status', { name: 'Loading upcoming events' })).toBeVisible();
    await expect(page.getByText('No upcoming events.')).toHaveCount(0);

    releaseResponse?.();
    await expect(page.getByText('Delayed reading circle')).toBeVisible();
  });

  test('distinguishes an API failure from empty data and retries successfully', async ({ page }) => {
    let attempts = 0;
    await page.route('**/api/v1/events?page_size=100*', (route) => {
      attempts += 1;
      if (attempts === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Events are temporarily offline' }),
        });
      }
      return route.fulfill({
        json: { items: [eventAt('retry', 'Recovered workshop', 2)], total: 1 },
      });
    });

    await continueAsRole(page, 'member');
    await expect(page.getByText('Upcoming events unavailable')).toBeVisible();
    await expect(page.getByText('Events are temporarily offline')).toBeVisible();
    await expect(page.getByText('No upcoming events.')).toHaveCount(0);

    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByText('Recovered workshop')).toBeVisible();
    expect(attempts).toBe(2);
  });

  test('filters past and invalid dates, sorts ascending, and limits the card to five', async ({
    page,
  }) => {
    const items = [
      eventAt('future-7', 'Future day 7', 7),
      eventAt('past', 'Past event', -1),
      eventAt('future-3', 'Future day 3', 3),
      { id: 'invalid', title: 'Invalid date event', date: 'not-a-date' },
      eventAt('future-1', 'Future day 1', 1),
      eventAt('future-6', 'Future day 6', 6),
      eventAt('future-2', 'Future day 2', 2),
      eventAt('future-5', 'Future day 5', 5),
      eventAt('future-4', 'Future day 4', 4),
    ];
    await page.route('**/api/v1/events?page_size=100*', (route) =>
      route.fulfill({ json: { items, total: items.length } }),
    );

    await continueAsRole(page, 'member');
    const eventTitles = page
      .getByRole('heading', { name: 'Upcoming Events' })
      .locator('..')
      .locator('..')
      .locator('li span:first-child');

    await expect(eventTitles).toHaveText([
      'Future day 1',
      'Future day 2',
      'Future day 3',
      'Future day 4',
      'Future day 5',
    ]);
    await expect(page.getByText('Past event')).toHaveCount(0);
    await expect(page.getByText('Invalid date event')).toHaveCount(0);
    await expect(page.getByText('Future day 6')).toHaveCount(0);
    await expect(page.getByText('Future day 7')).toHaveCount(0);
  });

  test('refreshes on focus and ignores an older response that finishes last', async ({ page }) => {
    let requestNumber = 0;
    let releaseFirst: (() => void) | undefined;
    let markFirstStarted: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    await page.route('**/api/v1/events?page_size=100*', async (route) => {
      requestNumber += 1;
      if (requestNumber === 1) {
        markFirstStarted?.();
        await firstGate;
        await route.fulfill({
          json: { items: [eventAt('stale', 'Stale event response', 2)], total: 1 },
        });
        return;
      }
      await route.fulfill({
        json: { items: [eventAt('fresh', 'Fresh event response', 1)], total: 1 },
      });
    });

    await continueAsRole(page, 'member');
    await firstStarted;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByText('Fresh event response')).toBeVisible();

    releaseFirst?.();
    await page.waitForTimeout(100);
    await expect(page.getByText('Fresh event response')).toBeVisible();
    await expect(page.getByText('Stale event response')).toHaveCount(0);
  });

  test('uses the public event feed without leaking the access token', async ({ page }) => {
    let authorizationHeader: string | undefined;
    await page.route('**/api/v1/events?page_size=100*', (route) => {
      authorizationHeader = route.request().headers().authorization;
      return route.fulfill({
        json: { items: [eventAt('public', 'Public event feed', 1)], total: 1 },
      });
    });

    await continueAsRole(page, 'member');
    await expect(page.getByText('Public event feed')).toBeVisible();
    expect(authorizationHeader).toBeUndefined();
  });

  test('localizes loading, error, and empty states', async ({ page }) => {
    await page.route('**/api/v1/events?page_size=100*', (route) =>
      route.fulfill({ json: { items: [], total: 0 } }),
    );
    await continueAsRole(page, 'member');

    await page.getByLabel('Language').click();
    await page.getByRole('option', { name: 'हिन्दी' }).click();
    await expect(page.getByRole('heading', { name: 'आगामी आयोजन' })).toBeVisible();
    await expect(page.getByText('कोई आगामी आयोजन नहीं है।')).toBeVisible();
  });
});
