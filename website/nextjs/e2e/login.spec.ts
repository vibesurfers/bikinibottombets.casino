import { test, expect } from '@playwright/test';
import { BASE_URL, API_BASE, loginAsAgent, clearAuth, viewports } from './test-utils';

test.describe('Login Page', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await clearAuth(page);
  });

  test('displays page with correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/Bikini Bottom Bets/);
  });

  test('shows both login options initially', async ({ page }) => {
    // Two cards with titles (CardTitle is a div, not a heading)
    await expect(page.locator('[data-slot="card-title"]').filter({ hasText: "I'm an Agent" })).toBeVisible();
    await expect(page.locator('[data-slot="card-title"]').filter({ hasText: "I'm a Human" })).toBeVisible();
    // Forms should be hidden (Select buttons visible instead)
    await expect(page.locator('[data-slot="card"]').first().getByRole('button', { name: 'Select' })).toBeVisible();
    await expect(page.locator('[data-slot="card"]').last().getByRole('button', { name: 'Select' })).toBeVisible();
  });

  test('selecting agent card reveals form', async ({ page }) => {
    // Click the Select button on the agent card
    const agentCard = page.locator('[data-slot="card"]').filter({ hasText: "I'm an Agent" });
    await agentCard.getByRole('button', { name: 'Select' }).click();

    // Form should now be visible
    await expect(page.locator('#moltbook-token')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Verify & Enter' })).toBeVisible();
  });

  test('selecting human card reveals form', async ({ page }) => {
    // Click the Select button on the human card
    const humanCard = page.locator('[data-slot="card"]').filter({ hasText: "I'm a Human" });
    await humanCard.getByRole('button', { name: 'Select' }).click();

    // Form should now be visible
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send Magic Link' })).toBeVisible();
  });

  test('successful agent login redirects to dashboard', async ({ page }) => {
    // The mock in the page handles auth automatically
    // Select agent card
    const agentCard = page.locator('[data-slot="card"]').filter({ hasText: "I'm an Agent" });
    await agentCard.getByRole('button', { name: 'Select' }).click();

    // Fill in token
    await page.locator('#moltbook-token').fill('valid-token');
    await page.getByRole('button', { name: 'Verify & Enter' }).click();

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('successful magic link shows success message', async ({ page }) => {
    // Select human card
    const humanCard = page.locator('[data-slot="card"]').filter({ hasText: "I'm a Human" });
    await humanCard.getByRole('button', { name: 'Select' }).click();

    // Fill in email
    await page.locator('#email').fill('test@example.com');
    await page.getByRole('button', { name: 'Send Magic Link' }).click();

    // Should show success message
    await expect(page.getByText('Check your inbox')).toBeVisible();
  });

  test('redirects to dashboard if already logged in', async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/login`);
    await expect(page).toHaveURL(/\/dashboard/);
  });

});

test.describe('Login Page - Responsive', () => {

  test('mobile layout stacks cards vertically', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
    await page.goto(`${BASE_URL}/login`);

    const cards = page.locator('[data-slot="card"]');
    await expect(cards).toHaveCount(2);

    const firstBox = await cards.first().boundingBox();
    const secondBox = await cards.last().boundingBox();

    // On mobile, second card should be below the first
    expect(secondBox!.y).toBeGreaterThan(firstBox!.y + firstBox!.height - 50);
  });

});
