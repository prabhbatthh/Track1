import { test, expect } from '@playwright/test';

const VALID_CONTACT_FORM = {
  name: 'Jordan Visitor',
  email: 'jordan.visitor@example.com',
  phoneNumber: '+91 98765 43210',
  organization: 'Acme Reading Circle',
  subject: 'Bulk membership question',
  message: "We'd like to enroll 20 people, what's the process?",
};

async function fillContactForm(page: import('@playwright/test').Page) {
  await page.getByLabel('Name').fill(VALID_CONTACT_FORM.name);
  await page.getByLabel('Email').fill(VALID_CONTACT_FORM.email);
  await page.getByLabel('Phone Number').fill(VALID_CONTACT_FORM.phoneNumber);
  await page.getByLabel('Organization / Reading Club').fill(VALID_CONTACT_FORM.organization);
  await page.getByLabel('Subject').fill(VALID_CONTACT_FORM.subject);
  await page.getByLabel('Message').fill(VALID_CONTACT_FORM.message);
}

test.describe('Contact Us — library map', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/contact-us');
  });

  test('renders the embedded map and a working "Get directions" link', async ({ page }) => {
    const map = page.frameLocator('iframe[title="Visit Us"]');
    // The embed points at OpenStreetMap's Connaught Place bbox — assert the iframe
    // is the real thing rather than a broken/blank embed.
    await expect(page.locator('iframe[title="Visit Us"]')).toHaveAttribute(
      'src',
      /openstreetmap\.org\/export\/embed\.html/,
    );
    await expect(map.locator('body')).toBeVisible();

    const directionsLink = page.getByRole('link', { name: 'Get directions' });
    await expect(directionsLink).toHaveAttribute(
      'href',
      /google\.com\/maps\/search\/\?api=1&query=28\.632889,77\.219361/,
    );
    await expect(directionsLink).toHaveAttribute('target', '_blank');
  });
});

test.describe('Contact Us — inquiry form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/contact-us');
  });

  test('shows validation errors on empty submit', async ({ page }) => {
    await page.getByRole('button', { name: 'Submit Inquiry' }).click();

    await expect(page.getByText('Name is required.', { exact: true })).toBeVisible();
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
    await expect(page.getByText('Enter a valid phone number.')).toBeVisible();
    await expect(page.getByText('Organization or club name is required.')).toBeVisible();
    await expect(page.getByText('Subject is required.')).toBeVisible();
    await expect(page.getByText('Please share a brief message.')).toBeVisible();
  });

  test('submits successfully and shows a confirmation toast', async ({ page }) => {
    await fillContactForm(page);
    await page.getByRole('button', { name: 'Submit Inquiry' }).click();

    await expect(
      page.getByText('Your inquiry has been sent. We will contact you soon.'),
    ).toBeVisible();
  });

  test('lists a department contact for pricing and fines', async ({ page }) => {
    await expect(page.getByRole('cell', { name: 'Pricing & Fines', exact: true })).toBeVisible();
  });
});
