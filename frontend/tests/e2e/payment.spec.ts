import { test, expect, type APIRequestContext } from '@playwright/test';

import { API_BASE, continueAsRole, DEV_EMAIL_DOMAIN, DEV_PASSWORD } from './helpers';

// The Payment page's own dev server only talks to the backend through the browser —
// coupons have to already exist for the UI to validate one, so this hits the API
// directly (same backend the app itself calls) to seed one before each test needs it.
async function createCoupon(request: APIRequestContext, discountPercent: number): Promise<string> {
  const login = await request.post(`${API_BASE}/auth/login`, {
    data: { email: `admin@${DEV_EMAIL_DOMAIN}`, password: DEV_PASSWORD },
  });
  const { access_token: accessToken } = await login.json();

  const coupon = await request.post(`${API_BASE}/coupons`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { discount_percent: discountPercent, max_uses: 5 },
  });
  const body = await coupon.json();
  return body.code as string;
}

test.beforeEach(async ({ page }) => {
  // AnimatedNumber falls back to an instant jump under reduced motion — without
  // this, asserting on the tweened amount text is a race against its 0.6s ease.
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test.describe('Payment — coupons', () => {
  test('applies a valid coupon and shows the discounted amount', async ({ page, request }) => {
    const code = await createCoupon(request, 20);

    await continueAsRole(page, 'member');
    await page.goto('/payment?amount=500&label=Overdue%20fine');

    await page.getByPlaceholder('Have a coupon code?').fill(code);
    await page.getByRole('button', { name: 'Apply' }).click();

    await expect(page.getByText(`Coupon ${code} applied — 20% off`)).toBeVisible();
    await expect(page.getByText('₹500', { exact: true })).toBeVisible(); // struck-through original
    await expect(page.getByTestId('payment-amount')).toHaveText('400');
  });

  test('shows an inline error for an unknown coupon code', async ({ page }) => {
    await continueAsRole(page, 'member');
    await page.goto('/payment?amount=500&label=Overdue%20fine');

    await page.getByPlaceholder('Have a coupon code?').fill('NOSUCHCODE');
    await page.getByRole('button', { name: 'Apply' }).click();

    await expect(page.getByText('Coupon not found')).toBeVisible();
    // No discount applied — the amount shown is still the full one.
    await expect(page.getByTestId('payment-amount')).toHaveText('500');
  });

  test('removing an applied coupon restores the coupon input and full amount', async ({
    page,
    request,
  }) => {
    const code = await createCoupon(request, 10);

    await continueAsRole(page, 'member');
    await page.goto('/payment?amount=200&label=Overdue%20fine');

    await page.getByPlaceholder('Have a coupon code?').fill(code);
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText(`Coupon ${code} applied`, { exact: false })).toBeVisible();

    await page.getByRole('button', { name: 'Remove' }).click();

    await expect(page.getByPlaceholder('Have a coupon code?')).toBeVisible();
    await expect(page.getByTestId('payment-amount')).toHaveText('200');
  });
});

test.describe('Payment — pay at library', () => {
  test('notifies the manager and redirects to the dashboard', async ({ page }) => {
    await continueAsRole(page, 'member');
    await page.goto('/payment?plan=1m&label=Monthly%20membership');

    await page.getByRole('button', { name: 'Notify the Manager' }).click();

    await expect(
      page.getByText('The manager has been notified — pay in cash at the counter'),
    ).toBeVisible();
    await expect(page).toHaveURL('/dashboard');
  });
});
