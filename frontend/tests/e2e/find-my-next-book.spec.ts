import { expect, test } from '@playwright/test';

import { continueAsRole } from './helpers';

// The quiz's question count/options are computed live from the real catalog (that's the
// point of the feature), so this deliberately never asserts on specific question text or
// option labels — it walks whatever the backend actually returns and checks the flow
// reaches a real terminal state, matching how the modal itself is built to handle any
// catalog shape.
test.describe('Find My Next Book', () => {
  test('is only offered to members, and the quiz reaches a real result', async ({ page }) => {
    test.setTimeout(60_000);
    await continueAsRole(page, 'member');
    await page.goto('/books');

    const quizButton = page.getByRole('button', { name: 'Find My Next Book' });
    await expect(quizButton).toBeVisible({ timeout: 15_000 });
    await quizButton.click();

    const dialog = page.getByRole('dialog', { name: 'Find My Next Book' });
    await expect(dialog).toBeVisible();

    const startQuizBtn = dialog.getByRole('button', { name: /Take the 30-sec Quiz|Answer Questions|Start Quiz/i });
    const notEnoughBooks = dialog.getByText('Not enough books yet');

    await expect(startQuizBtn.or(notEnoughBooks)).toBeVisible({ timeout: 15_000 });
    if (await startQuizBtn.isVisible()) {
      await startQuizBtn.click();
    }

    // Walk however many questions the live catalog produced (zero if the catalog can't
    // support any), picking the first option each time.
    for (let guard = 0; guard < 10; guard++) {
      const next = dialog.getByRole('button', { name: 'Next' });
      const finish = dialog.getByRole('button', { name: 'See my recommendations' });
      if (!(await next.isVisible()) && !(await finish.isVisible())) break;

      await dialog.getByTestId('quiz-option').first().click();

      if (await finish.isVisible()) {
        await finish.click();
        break;
      }
      await next.click();
    }

    // Terminal state: either real recommendations or the "not enough books" empty state,
    // both of which present the "Done" action button — never a stuck loading spinner.
    const done = dialog.getByRole('button', { name: 'Done' });
    await expect(done).toBeVisible({ timeout: 15_000 });
  });

  test('is not offered to non-member roles', async ({ page }) => {
    await continueAsRole(page, 'librarian');
    await page.goto('/books');

    await expect(page.getByRole('button', { name: 'Find My Next Book' })).toHaveCount(0);
  });
});
