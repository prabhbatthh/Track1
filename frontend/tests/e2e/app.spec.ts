import { expect, test } from '@playwright/test';

test('loads the application shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Community Reading Club & Library Platform')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Your library, your community, all in one place.' }),
  ).toBeVisible();
});
