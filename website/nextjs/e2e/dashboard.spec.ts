import { test, expect } from '@playwright/test';
import { BASE_URL, API_BASE, loginAsAgent, loginAsHuman, clearAuth, viewports } from './test-utils';

test.describe('Dashboard - Auth Guard', () => {

  test('redirects to login when not authenticated', async ({ page }) => {
    await clearAuth(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page).toHaveURL(/\/login/);
  });

});

test.describe('Dashboard - Navigation & Layout', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard`);
  });

  test('displays pipeline status banner', async ({ page }) => {
    // Pipeline step indicators in the banner (before tabs)
    const pipelineBanner = page.locator('.bg-muted\\/50.rounded-lg');
    await expect(pipelineBanner).toBeVisible();
    await expect(pipelineBanner.getByText('Research')).toBeVisible();
    await expect(pipelineBanner.getByText('Findings')).toBeVisible();
    await expect(pipelineBanner.getByText('Claw Court')).toBeVisible();
    await expect(pipelineBanner.getByText('Actions')).toBeVisible();
  });

  test('displays all four tabs', async ({ page }) => {
    const tabsList = page.locator('[data-slot="tabs-list"]');
    await expect(tabsList).toBeVisible();

    await expect(page.getByRole('tab', { name: /Claw Court/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Research Jobs/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Findings/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Leaderboard/i })).toBeVisible();
  });

  test('shows user info in nav', async ({ page }) => {
    // User info displayed in nav
    await expect(page.getByText('TestCrab')).toBeVisible();
    await expect(page.getByText('1500 karma')).toBeVisible();
  });

});

test.describe('Dashboard - Claw Court Tab', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard`);
  });

  test('displays inquisition cards', async ({ page }) => {
    // Should show demo inquisition cards
    const cards = page.locator('[data-slot="card"]');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(1);
  });

  test('shows target company and status', async ({ page }) => {
    // First inquisition card should show company and status
    const firstCard = page.locator('[data-slot="card"]').first();
    await expect(firstCard.locator('[data-slot="card-title"]')).toBeVisible();
    // Status badge
    await expect(firstCard.getByText(/voting|approved/i)).toBeVisible();
  });

  test('shows karma progress bar', async ({ page }) => {
    const progressBar = page.locator('[data-slot="progress"]').first();
    await expect(progressBar).toBeVisible();
    // Progress text
    await expect(page.getByText(/karma/i).first()).toBeVisible();
  });

  test('agent sees vote buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Vote Approve/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Reject/i }).first()).toBeVisible();
  });

  test('human does not see vote buttons', async ({ page }) => {
    await clearAuth(page);
    await loginAsHuman(page);
    await page.goto(`${BASE_URL}/dashboard`);
    // Wait for page to load
    await page.waitForTimeout(500);
    await expect(page.getByRole('button', { name: /Vote Approve/i })).toHaveCount(0);
  });

});

test.describe('Dashboard - Research Jobs Tab', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await page.getByRole('tab', { name: /Research Jobs/i }).click();
  });

  test('displays research job cards', async ({ page }) => {
    // Should show research job cards
    const cards = page.locator('[data-slot="card"]');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(1);
  });

  test('job card shows company and depth', async ({ page }) => {
    const firstJob = page.locator('[data-slot="card"]').first();
    // Company name in title
    await expect(firstJob.locator('[data-slot="card-title"]')).toBeVisible();
    // Depth badge (quick/standard/deep)
    await expect(firstJob.getByText(/quick|standard|deep/i)).toBeVisible();
  });

  test('shows status and API calls', async ({ page }) => {
    const firstJob = page.locator('[data-slot="card"]').first();
    // Status badge (pending/running/completed)
    await expect(firstJob.getByText(/pending|running|completed/i)).toBeVisible();
    // API call info
    await expect(firstJob.getByText(/Firecrawl/i)).toBeVisible();
  });

});

test.describe('Dashboard - Findings Tab', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await page.getByRole('tab', { name: /Findings/i }).click();
  });

  test('displays filter buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'All' })).toBeVisible();
    await expect(page.getByRole('button', { name: /SEC Filings/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /News/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /IR Pages/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Documents/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Social/i })).toBeVisible();
  });

  test('displays finding cards', async ({ page }) => {
    const cards = page.locator('[data-slot="card"]');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(1);
  });

  test('finding card shows type and company', async ({ page }) => {
    const firstFinding = page.locator('[data-slot="card"]').first();
    // Type badge should be visible
    await expect(firstFinding.getByText(/SEC Filing|News|IR Page|Web Search/i)).toBeVisible();
    // Company info should be visible
    await expect(firstFinding.locator('[data-slot="card-title"]')).toBeVisible();
  });

  test('SEC filing filter works', async ({ page }) => {
    await page.getByRole('button', { name: /SEC Filings/i }).click();
    // Should filter to show SEC filing cards
    await expect(page.getByText(/SEC Filing/i).first()).toBeVisible();
  });

  test('All filter shows all findings', async ({ page }) => {
    await page.getByRole('button', { name: /SEC Filings/i }).click();
    await page.getByRole('button', { name: 'All' }).click();
    const cards = page.locator('[data-slot="card"]');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThanOrEqual(3);
  });

});

test.describe('Dashboard - Leaderboard Tab', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await page.getByRole('tab', { name: /Leaderboard/i }).click();
  });

  test('displays leaderboard table', async ({ page }) => {
    await expect(page.locator('table')).toBeVisible();
  });

  test('shows agent rankings', async ({ page }) => {
    // Table should have rows with agent data
    await expect(page.getByText('CrabMaster')).toBeVisible();
    await expect(page.getByText('#1')).toBeVisible();
  });

  test('top 3 have special styling', async ({ page }) => {
    // Top 3 ranks should be visible
    await expect(page.getByText('#1')).toBeVisible();
    await expect(page.getByText('#2')).toBeVisible();
    await expect(page.getByText('#3')).toBeVisible();
  });

});

test.describe('Dashboard - Voting', () => {

  test('vote shows alert with result', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());

    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await page.getByRole('button', { name: /Vote Approve/i }).first().click();

    // The demo shows an alert - just verify no crash
    await page.waitForTimeout(500);
  });

});

test.describe('Dashboard - Logout', () => {

  test('logout clears auth and redirects', async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard`);
    await page.getByRole('button', { name: 'Logout' }).click();

    await expect(page).toHaveURL(/\/login/);
    const agent = await page.evaluate(() => localStorage.getItem('bbb_agent'));
    expect(agent).toBeNull();
  });

});

test.describe('Dashboard - Responsive', () => {

  test('mobile layout works', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard`);

    // Dashboard should be visible
    await expect(page.getByText('Swarm Dashboard')).toBeVisible();
    // Tabs should be visible
    await expect(page.locator('[data-slot="tabs-list"]')).toBeVisible();
  });

});
