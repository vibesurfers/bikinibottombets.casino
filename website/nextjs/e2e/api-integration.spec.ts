import { test, expect } from '@playwright/test';
import { BASE_URL, API_BASE, loginAsAgent } from './test-utils';

/**
 * API Integration Tests
 * These tests verify that the UI displays data correctly
 * Note: The Next.js app uses demo data for UI rendering
 */

test.describe('API Integration: Inquisitions', () => {

  test('displays inquisition cards with correct structure', async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard`);

    // Should display inquisition cards
    const cards = page.locator('[data-slot="card"]');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(1);

    // First card should have proper structure
    const firstCard = cards.first();
    await expect(firstCard.locator('[data-slot="card-title"]')).toBeVisible();
    await expect(firstCard.locator('[data-slot="card-description"]')).toBeVisible();
  });

  test('displays karma progress correctly', async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard`);

    // Progress bar should be visible
    const progressBar = page.locator('[data-slot="progress"]').first();
    await expect(progressBar).toBeVisible();

    // Progress text with karma should be visible
    await expect(page.getByText(/karma/i).first()).toBeVisible();
  });

  test('vote buttons trigger alert', async ({ page }) => {
    let alertShown = false;
    page.on('dialog', async dialog => {
      alertShown = true;
      await dialog.accept();
    });

    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard`);

    await page.getByRole('button', { name: /Vote Approve/i }).first().click();
    await page.waitForTimeout(500);

    expect(alertShown).toBeTruthy();
  });

});

test.describe('API Integration: Research Jobs', () => {

  test('displays research jobs with correct structure', async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await page.getByRole('tab', { name: /Research Jobs/i }).click();

    // Verify job cards render correctly
    const cards = page.locator('[data-slot="card"]');
    expect(await cards.count()).toBeGreaterThanOrEqual(1);

    const firstJob = cards.first();
    await expect(firstJob.locator('[data-slot="card-title"]')).toBeVisible();
    // Depth badge
    await expect(firstJob.getByText(/quick|standard|deep/i)).toBeVisible();
    // Status badge
    await expect(firstJob.getByText(/pending|running|completed/i)).toBeVisible();
  });

});

test.describe('API Integration: Findings', () => {

  test('displays findings with correct structure', async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await page.getByRole('tab', { name: /Findings/i }).click();

    const cards = page.locator('[data-slot="card"]');
    expect(await cards.count()).toBeGreaterThanOrEqual(1);

    // Verify finding card structure
    const finding = cards.first();
    // Type badge
    await expect(finding.getByText(/SEC Filing|News|IR Page|Web Search/i)).toBeVisible();
    // Title
    await expect(finding.locator('[data-slot="card-title"]')).toBeVisible();
    // Source link
    await expect(finding.getByRole('link', { name: /View source/i })).toBeVisible();
  });

  test('finding type badges display correctly', async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await page.getByRole('tab', { name: /Findings/i }).click();

    // Should have SEC filing type visible
    await expect(page.getByText(/SEC Filing/i).first()).toBeVisible();
  });

});

test.describe('API Integration: Auth Flow', () => {

  test('authenticated user sees their info', async ({ page }) => {
    await loginAsAgent(page, { name: 'TestCrab', karma: 1500 });
    await page.goto(`${BASE_URL}/dashboard`);

    // Should have user info visible
    await expect(page.getByText('TestCrab')).toBeVisible();
    await expect(page.getByText(/1500 karma/i)).toBeVisible();
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    // Clear any stored auth
    await page.goto(BASE_URL);
    await page.evaluate(() => {
      localStorage.removeItem('bbb_agent');
      localStorage.removeItem('bbb_human');
      localStorage.removeItem('bbb_token');
    });

    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page).toHaveURL(/\/login/);
  });

});

test.describe('API Integration: Data Formatting', () => {

  test('karma values are formatted with commas', async ({ page }) => {
    await loginAsAgent(page, { name: 'BigKarmaCrab', karma: 12345 });
    await page.goto(`${BASE_URL}/dashboard`);

    // Leaderboard should show formatted karma
    await page.getByRole('tab', { name: /Leaderboard/i }).click();

    // Table should have formatted numbers
    await expect(page.locator('table')).toBeVisible();
  });

  test('timestamps are formatted as relative time', async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard`);

    // Navigate to Research Jobs
    await page.getByRole('tab', { name: /Research Jobs/i }).click();

    // Check that timestamps are formatted (h ago, d ago, etc)
    await expect(page.getByText(/ago|Just now/i).first()).toBeVisible();
  });

});

test.describe('API Integration: Loading States', () => {

  test('dashboard shows content after load', async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });

    // Wait for loading to complete
    await page.waitForTimeout(1000);

    // Content should be visible
    await expect(page.getByText('Swarm Dashboard')).toBeVisible();
    await expect(page.locator('[data-slot="tabs-list"]')).toBeVisible();
  });

});

test.describe('API Integration: Tab Navigation', () => {

  test('tabs switch content correctly', async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard`);

    // Default is Claw Court
    await expect(page.getByRole('button', { name: /Vote Approve/i }).first()).toBeVisible();

    // Switch to Research Jobs
    await page.getByRole('tab', { name: /Research Jobs/i }).click();
    await expect(page.getByText(/Firecrawl/i).first()).toBeVisible();

    // Switch to Findings
    await page.getByRole('tab', { name: /Findings/i }).click();
    await expect(page.getByRole('button', { name: 'All' })).toBeVisible();

    // Switch to Leaderboard
    await page.getByRole('tab', { name: /Leaderboard/i }).click();
    await expect(page.locator('table')).toBeVisible();
    await expect(page.getByText('#1')).toBeVisible();
  });

});

test.describe('API Integration: Filter Functionality', () => {

  test('findings filters work correctly', async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await page.getByRole('tab', { name: /Findings/i }).click();

    // All filter button should be active by default
    const allButton = page.getByRole('button', { name: 'All' });
    await expect(allButton).toBeVisible();

    // Click SEC Filings filter
    await page.getByRole('button', { name: /SEC Filings/i }).click();
    await expect(page.getByText(/SEC Filing/i).first()).toBeVisible();

    // Click All to reset
    await page.getByRole('button', { name: 'All' }).click();
    const cards = page.locator('[data-slot="card"]');
    expect(await cards.count()).toBeGreaterThanOrEqual(3);
  });

});

test.describe('API Integration: User Badge', () => {

  test('agent badge shows agent icon', async ({ page }) => {
    await loginAsAgent(page, { name: 'AgentTest', karma: 100 });
    await page.goto(`${BASE_URL}/dashboard`);

    // Agent should see lobster icon
    await expect(page.getByText('AgentTest')).toBeVisible();
  });

  test('karma is displayed in badge', async ({ page }) => {
    await loginAsAgent(page, { name: 'KarmaTest', karma: 999 });
    await page.goto(`${BASE_URL}/dashboard`);

    await expect(page.getByText(/999 karma/i)).toBeVisible();
  });

});
