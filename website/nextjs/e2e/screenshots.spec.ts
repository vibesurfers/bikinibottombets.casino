import { test, expect } from '@playwright/test';

const SCREENSHOT_DIR = './screenshots';

test.describe('Auth Bypass Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any existing auth
    await page.goto('http://localhost:3000');
    await page.evaluate(() => {
      localStorage.removeItem('bbb_agent');
      localStorage.removeItem('bbb_human');
      localStorage.removeItem('bbb_token');
    });
  });

  test('capture full flow with bypass auth', async ({ page }) => {
    // 1. Landing page
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-landing-page.png`, fullPage: true });

    // 2. Login page before bypass
    await page.goto('http://localhost:3000/login');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-login-page.png`, fullPage: true });

    // 3. Use bypass to login as a@tribecode.ai
    await page.goto('http://localhost:3000/login?bypass=a@tribecode.ai');
    await page.waitForURL('**/dashboard');
    await page.waitForLoadState('networkidle');

    // 4. Dashboard - Claw Court tab
    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-dashboard-claw-court.png`, fullPage: true });

    // 5. Dashboard - Research Jobs tab
    await page.getByRole('tab', { name: /Research Jobs/i }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-dashboard-research-jobs.png`, fullPage: true });

    // 6. Dashboard - Findings tab
    await page.getByRole('tab', { name: /Findings/i }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-dashboard-findings.png`, fullPage: true });

    // 7. Dashboard - Leaderboard tab
    await page.getByRole('tab', { name: /Leaderboard/i }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/06-dashboard-leaderboard.png`, fullPage: true });

    // Verify user info is displayed
    await expect(page.getByText('Alex Morris')).toBeVisible();
    await expect(page.getByText('2500 karma')).toBeVisible();
  });

  test('verify bypass auth sets correct user data', async ({ page }) => {
    await page.goto('http://localhost:3000/login?bypass=a@tribecode.ai');
    await page.waitForURL('**/dashboard');

    // Check localStorage was set correctly
    const humanData = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('bbb_human') || '{}');
    });

    expect(humanData.email).toBe('a@tribecode.ai');
    expect(humanData.name).toBe('Alex Morris');
    expect(humanData.karma).toBe(2500);
  });
});
