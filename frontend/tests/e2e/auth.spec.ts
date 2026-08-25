import { test, expect, type Page } from '@playwright/test';

import { continueAsRole, DEV_EMAIL_DOMAIN, DEV_PASSWORD, ROLE_HOME, ROLE_LABEL, type Role } from './helpers';

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

async function fillRegisterForm(
  page: Page,
  values: { name: string; email: string; phone: string; password: string; confirmPassword: string },
) {
  await page.getByLabel('Full name').fill(values.name);
  await page.getByLabel('Email').fill(values.email);
  await page.getByLabel('Phone number').fill(values.phone);
  await page.getByLabel('Password', { exact: true }).fill(values.password);
  await page.getByLabel('Confirm password').fill(values.confirmPassword);
}

test.describe('Register', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
  });

  test('shows validation errors on empty submit', async ({ page }) => {
    await page.getByRole('button', { name: 'Proceed' }).click();
    await expect(page.getByText('Name must be 2–100 characters and contain only letters.')).toBeVisible();
    await expect(
      page.getByText('Enter a valid 10-digit Indian mobile number (e.g. 9876543210).'),
    ).toBeVisible();
    await expect(page.getByText('You must accept the terms to continue.')).toBeVisible();
  });

  test('rejects an invalid email address', async ({ page }) => {
    await fillRegisterForm(page, {
      name: 'Jordan Reader',
      email: 'not-an-email',
      phone: '9876543210',
      password: 'StrongPass1!',
      confirmPassword: 'StrongPass1!',
    });
    await page.getByRole('button', { name: 'Proceed' }).click();
    await expect(
      page.getByText('Enter a valid email address (e.g. name@example.com).'),
    ).toBeVisible();
  });

  test('rejects a weak password', async ({ page }) => {
    await fillRegisterForm(page, {
      name: 'Jordan Reader',
      email: uniqueEmail('weakpass'),
      phone: '9876543210',
      password: 'weak',
      confirmPassword: 'weak',
    });
    await page.getByRole('button', { name: 'Proceed' }).click();
    await expect(
      page.getByText(
        'Password must be 8+ characters with uppercase, lowercase, a number, and a special character.',
      ),
    ).toBeVisible();
  });

  test('rejects mismatched confirm password', async ({ page }) => {
    await fillRegisterForm(page, {
      name: 'Jordan Reader',
      email: uniqueEmail('mismatch'),
      phone: '9876543210',
      password: 'StrongPass1!',
      confirmPassword: 'DifferentPass1!',
    });
    await page.getByRole('button', { name: 'Proceed' }).click();
    await expect(page.getByText('Passwords do not match.')).toBeVisible();
  });

  test('registers successfully and redirects to payment', async ({ page }) => {
    await fillRegisterForm(page, {
      name: 'Jordan Reader',
      email: uniqueEmail('newmember'),
      phone: '9876543210',
      password: 'StrongPass1!',
      confirmPassword: 'StrongPass1!',
    });
    await page.getByLabel('I agree to the terms of service').check();
    await page.getByRole('button', { name: 'Proceed' }).click();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/payment/);
  });

  test('rejects a duplicate email', async ({ page }) => {
    const email = uniqueEmail('dupe');
    const values = {
      name: 'Jordan Reader',
      email,
      phone: '9876543210',
      password: 'StrongPass1!',
      confirmPassword: 'StrongPass1!',
    };

    await fillRegisterForm(page, values);
    await page.getByLabel('I agree to the terms of service').check();
    await page.getByRole('button', { name: 'Proceed' }).click();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/payment/);

    // Registering logs you in immediately, and /register is a PublicRoute that redirects
    // an authenticated visitor away — clear the session so the second attempt actually
    // reaches the form instead of bouncing straight back to /payment.
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/register');
    await expect(page).toHaveURL('/register');
    await fillRegisterForm(page, values);
    await page.getByLabel('I agree to the terms of service').check();
    await page.getByRole('button', { name: 'Proceed' }).click();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('An account with this email already exists')).toBeVisible();
  });
});

test.describe('Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('logs in with valid credentials', async ({ page }) => {
    await page.getByLabel('Email').fill(`member@${DEV_EMAIL_DOMAIN}`);
    await page.getByLabel('Password', { exact: true }).fill(DEV_PASSWORD);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('rejects the wrong password', async ({ page }) => {
    await page.getByLabel('Email').fill(`member@${DEV_EMAIL_DOMAIN}`);
    await page.getByLabel('Password', { exact: true }).fill('WrongPassword1!');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.getByText('Incorrect email or password')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('rejects a nonexistent email', async ({ page }) => {
    await page.getByLabel('Email').fill('ghost@example.com');
    await page.getByLabel('Password', { exact: true }).fill('WhateverPass1!');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.getByText('Incorrect email or password')).toBeVisible();
  });

  test('shows a validation error on empty submit', async ({ page }) => {
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.getByText('Password is required.')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });
});

test.describe('Role-based route guards', () => {
  for (const role of Object.keys(ROLE_LABEL) as Role[]) {
    test(`"Continue as ${ROLE_LABEL[role]}" lands on ${ROLE_HOME[role]}`, async ({ page }) => {
      await continueAsRole(page, role);
      await expect(page).toHaveURL(ROLE_HOME[role]);
    });
  }

  test('an unauthenticated visit to a protected route redirects to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/login');
  });

  test('a member cannot reach the admin dashboard', async ({ page }) => {
    await continueAsRole(page, 'member');
    await page.goto('/admin');
    await expect(page).toHaveURL('/dashboard');
  });

  test('a member cannot reach the IT-Head dashboard', async ({ page }) => {
    await continueAsRole(page, 'member');
    await page.goto('/it-head');
    await expect(page).toHaveURL('/dashboard');
  });

  test('a member cannot reach manager-only pages by direct URL', async ({ page }) => {
    await continueAsRole(page, 'member');
    for (const path of ['/manager/books', '/manager/borrow-history']) {
      await page.goto(path);
      await expect(page).toHaveURL('/dashboard');
    }
  });

  test('a librarian receives the staff dashboard and manager book workflow', async ({ page }) => {
    await continueAsRole(page, 'librarian');
    await expect(page.getByRole('heading', { name: /manager dashboard/i })).toBeVisible();
    await page.goto('/manager/books');
    await expect(page).toHaveURL('/manager/books');
    await expect(page.getByRole('heading', { name: /book/i })).toBeVisible();
  });

  test('an already-authenticated visit to /login redirects to their role home', async ({ page }) => {
    await continueAsRole(page, 'admin');
    await page.goto('/login');
    await expect(page).toHaveURL('/admin');
  });

  test('logging out locks protected routes again', async ({ page }) => {
    await continueAsRole(page, 'member');
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Log out' }).click();
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/login');
  });

  test('a 401 during logout cannot refresh and restore the session', async ({ page }) => {
    await continueAsRole(page, 'member');
    let refreshRequests = 0;
    await page.route('**/api/v1/auth/logout', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"Expired"}' }),
    );
    await page.route('**/api/v1/auth/refresh', (route) => {
      refreshRequests += 1;
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/settings');
    await page.getByRole('button', { name: 'Log out' }).click();
    await page.waitForTimeout(200);
    await page.goto('/dashboard');

    await expect(page).toHaveURL('/login');
    expect(refreshRequests).toBe(0);
  });
});
