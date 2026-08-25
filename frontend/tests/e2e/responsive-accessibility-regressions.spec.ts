import { expect, test, type Page } from '@playwright/test';

import { continueAsRole, type Role } from './helpers';

async function expectStatisticContentInsideCards(page: Page) {
  const issues = await page.locator('main [role="button"][aria-pressed]').evaluateAll((cards) =>
    cards.flatMap((card) => {
      const cardRect = card.getBoundingClientRect();
      return Array.from(card.querySelectorAll('p')).flatMap((paragraph) => {
        const rect = paragraph.getBoundingClientRect();
        const outside =
          rect.left < cardRect.left - 1 ||
          rect.right > cardRect.right + 1 ||
          rect.top < cardRect.top - 1 ||
          rect.bottom > cardRect.bottom + 1;
        return outside ? [`${paragraph.textContent}: [${rect.left}, ${rect.right}]`] : [];
      });
    }),
  );
  expect(issues).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} mobile statistic cards and IT-head pagination stay within 320px`, async ({
    page,
  }) => {
    await page.addInitScript(
      (selectedTheme) => localStorage.setItem('theme', JSON.stringify(selectedTheme)),
      theme,
    );
    await page.setViewportSize({ width: 320, height: 568 });

    await continueAsRole(page, 'member');
    await expectStatisticContentInsideCards(page);

    await page.getByRole('button', { name: 'Open account menu' }).click();
    await page.getByRole('button', { name: 'Log out' }).click();
    await continueAsRole(page, 'it-head' as Role);
    await expectStatisticContentInsideCards(page);

    const pagination = page.getByRole('navigation', { name: 'Pagination' }).first();
    await expect(pagination).toBeVisible();
    const controls = pagination.getByRole('button');
    for (let index = 0; index < (await controls.count()); index += 1) {
      const box = await controls.nth(index).boundingBox();
      expect(box).not.toBeNull();
      if (!box) continue;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
    }
  });
}

test('filters move focus into the popup, close on Escape, and restore focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await continueAsRole(page, 'member');
  await page.goto('/leaderboard');

  const trigger = page.getByRole('button', { name: 'Filters' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Filters' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button').first()).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
