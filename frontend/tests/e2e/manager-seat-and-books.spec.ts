import { expect, test, type Page } from '@playwright/test';

import { continueAsRole } from './helpers';

const availableSeats = Array.from({ length: 32 }, (_, index) => ({
  seat_label: `${String.fromCharCode(65 + Math.floor(index / 8))}${(index % 8) + 1}`,
  status: 'available',
  booked_by_avatar_url: null,
}));

async function openManagerSeatModal(page: Page) {
  await page.getByRole('button', { name: 'Book Seat for Member', exact: true }).last().click();
  return page.getByRole('dialog', { name: 'Book a Seat for a Member' });
}

test.describe('Manager seat booking states', () => {
  test.beforeEach(async ({ page }) => {
    await continueAsRole(page, 'manager');
  });

  test('shows a recoverable error when the seat schedule fails', async ({ page }) => {
    await page.route('**/api/v1/seat-booking/schedule?*', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"Schedule temporarily unavailable"}',
      }),
    );

    const dialog = await openManagerSeatModal(page);

    await expect(dialog.getByText('Seat availability unavailable')).toBeVisible();
    await expect(dialog.getByText('Schedule temporarily unavailable')).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Seat A1: Available/i })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /Retry|Try again/i })).toBeVisible();
  });

  test('clears a selected seat and hides stale availability while a changed slot loads', async ({
    page,
  }) => {
    let scheduleRequests = 0;
    await page.route('**/api/v1/seat-booking/schedule?*', async (route) => {
      scheduleRequests += 1;
      if (scheduleRequests > 1) await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({ json: { seats: availableSeats } });
    });
    await page.route('**/api/v1/members?*', (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: '11111111-1111-4111-8111-111111111111',
              full_name: 'Test Member',
              email: 'member@example.com',
            },
          ],
        },
      }),
    );

    const dialog = await openManagerSeatModal(page);
    const seatA1 = dialog.getByRole('button', { name: /Seat A1: Available/i });
    await expect(seatA1).toBeVisible();

    await dialog.getByPlaceholder('Search for a member').fill('Test Member');
    await dialog.getByRole('button', { name: /Test Member/ }).click();
    await seatA1.click();
    await expect(seatA1).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.getByRole('button', { name: 'Book Seat' })).toBeEnabled();

    const timeSlot = dialog.getByLabel('Time slot');
    const currentHour = Number(await timeSlot.inputValue());
    if (currentHour < 23) {
      await timeSlot.selectOption(String(currentHour + 1));
    } else {
      const dateButtons = dialog.locator('button.rounded-full');
      await dateButtons.nth(1).click();
    }

    await expect(dialog.getByLabel('Loading seat availability')).toBeVisible();
    await expect(seatA1).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Book Seat' })).toBeDisabled();

    await expect(dialog.getByRole('button', { name: /Seat A1: Available/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Book Seat' })).toBeDisabled();
  });
});

test('books pagination requests page two and reports the final item range', async ({ page }) => {
  await continueAsRole(page, 'member');
  const requestedPages: string[] = [];

  await page.route('**/api/v1/books?*', (route) => {
    const url = new URL(route.request().url());
    const requestedPage = url.searchParams.get('page') ?? '1';
    requestedPages.push(requestedPage);
    const numbers =
      requestedPage === '2' ? [17] : Array.from({ length: 16 }, (_, index) => index + 1);
    return route.fulfill({
      json: {
        total: 17,
        page: Number(requestedPage),
        page_size: 16,
        items: numbers.map((number) => ({
          id: `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
          title: `Pagination Book ${number}`,
          author: 'Test Author',
          category: 'Fiction',
          available: true,
          description: `Description ${number}`,
          average_rating: null,
          review_count: 0,
        })),
      },
    });
  });

  await page.goto('/books');
  await expect(page.getByText('Showing 1–16 of 17')).toBeVisible();
  await expect(page.getByText('Pagination Book 1', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Next page' }).click();

  await expect(page.getByText('Pagination Book 17', { exact: true })).toBeVisible();
  await expect(page.getByText('Pagination Book 1', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Showing 17–17 of 17')).toBeVisible();
  expect(requestedPages).toContain('2');
});
