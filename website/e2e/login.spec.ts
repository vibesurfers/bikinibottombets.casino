import { test, expect } from '@playwright/test';
import { BASE_URL, API_BASE, loginAsAgent, clearAuth, viewports } from './test-utils';

test.describe('Login Page', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/login.html`);
    await clearAuth(page);
  });

  test('displays page with correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/Login.*Bikini Bottom Bets/);
  });

  test('shows both login options initially', async ({ page }) => {
    await expect(page.locator('#agent-card')).toBeVisible();
    await expect(page.locator('#human-card')).toBeVisible();
    await expect(page.locator('#agent-form')).toHaveClass(/hidden/);
    await expect(page.locator('#human-form')).toHaveClass(/hidden/);
  });

  test('selecting agent card reveals form', async ({ page }) => {
    await page.locator('#select-agent').click();
    await expect(page.locator('#agent-card')).toHaveClass(/selected/);
    await expect(page.locator('#agent-form')).not.toHaveClass(/hidden/);
    await expect(page.locator('#human-card')).toHaveClass(/dimmed/);
  });

  test('selecting human card reveals form', async ({ page }) => {
    await page.locator('#select-human').click();
    await expect(page.locator('#human-card')).toHaveClass(/selected/);
    await expect(page.locator('#human-form')).not.toHaveClass(/hidden/);
    await expect(page.locator('#agent-card')).toHaveClass(/dimmed/);
  });

  test('successful agent login redirects to dashboard', async ({ page }) => {
    await page.route(`${API_BASE}/api/auth/register`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          agent: { name: 'TestAgent', karma: 1500 }
        })
      });
    });

    await page.locator('#select-agent').click();
    await page.locator('#moltbook-token').fill('valid-token');
    await page.locator('#agent-form button[type="submit"]').click();

    await expect(page).toHaveURL(/dashboard\.html/);
  });

  test('failed agent login shows error', async ({ page }) => {
    await page.route(`${API_BASE}/api/auth/register`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Invalid token' })
      });
    });

    page.on('dialog', dialog => dialog.accept());

    await page.locator('#select-agent').click();
    await page.locator('#moltbook-token').fill('invalid-token');
    await page.locator('#agent-form button[type="submit"]').click();

    await expect(page.locator('#agent-form button[type="submit"]')).toContainText('Verify & Enter');
  });

  test('successful magic link shows success message', async ({ page }) => {
    await page.route(`${API_BASE}/api/auth/magic-link`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    await page.locator('#select-human').click();
    await page.locator('#email').fill('test@example.com');
    await page.locator('#human-form button[type="submit"]').click();

    await expect(page.locator('#email-sent')).not.toHaveClass(/hidden/);
  });

  test('redirects to dashboard if already logged in', async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/login.html`);
    await expect(page).toHaveURL(/dashboard\.html/);
  });

});

test.describe('Login Page - Responsive', () => {

  test('mobile layout stacks cards vertically', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
    await page.goto(`${BASE_URL}/login.html`);

    const agentBox = await page.locator('#agent-card').boundingBox();
    const humanBox = await page.locator('#human-card').boundingBox();

    expect(humanBox!.y).toBeGreaterThan(agentBox!.y + agentBox!.height - 50);
  });

});
