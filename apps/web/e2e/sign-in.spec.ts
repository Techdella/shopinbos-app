import { expect, test } from '@playwright/test';

/**
 * Phase 0: sign in by phone.
 * The full flow needs a Supabase project with a test phone number configured
 * (Auth → Phone → "Test phone numbers and OTPs"), so it only runs when E2E_TEST_PHONE and E2E_TEST_OTP are set.
 */
test('sign-in page renders and validates the phone number', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: 'Sign in or start your shop' })).toBeVisible();
  await page.getByLabel('Phone number').fill('123');
  await page.getByRole('button', { name: 'Send my code' }).click();
  await expect(page.getByText('Enter a valid phone number')).toBeVisible();
  await page.getByRole('button', { name: 'Use email instead' }).click();
  await expect(page.getByLabel('Email')).toBeVisible();
});

test('signs in with a phone code and sees memberships', async ({ page }) => {
  const phone = process.env.E2E_TEST_PHONE;
  const otp = process.env.E2E_TEST_OTP;
  test.skip(!phone || !otp, 'Set E2E_TEST_PHONE and E2E_TEST_OTP (a Supabase test number)');

  await page.goto('/sign-in');
  await page.getByLabel('Phone number').fill(phone!);
  await page.getByRole('button', { name: 'Send my code' }).click();
  await page.getByLabel('Code').fill(otp!);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Hi');

  const me = await page.request.get('/api/me');
  expect(me.ok()).toBe(true);
  const body = await me.json();
  expect(Array.isArray(body.data.memberships)).toBe(true);
});

test('api/me rejects anonymous calls with the error envelope', async ({ request }) => {
  const res = await request.get('/api/me');
  expect(res.status()).toBe(401);
  expect(await res.json()).toEqual({
    error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' },
  });
});
