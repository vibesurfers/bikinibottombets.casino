import { test, expect } from '@playwright/test';
import { BASE_URL, API_BASE, loginAsAgent, loginAsHuman, clearAuth, viewports } from './test-utils';

test.describe('Dashboard - Auth Guard', () => {

  test('redirects to login when not authenticated', async ({ page }) => {
    await clearAuth(page);
    await page.goto(`${BASE_URL}/dashboard.html`);
    await expect(page).toHaveURL(/login\.html/);
  });

});

test.describe('Dashboard - Navigation & Layout', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);
  });

  test('displays pipeline status banner', async ({ page }) => {
    await expect(page.locator('.pipeline-status')).toBeVisible();
    await expect(page.locator('.pipeline-step')).toHaveCount(4);
  });

  test('displays all four tabs', async ({ page }) => {
    const tabs = page.locator('.tab-btn');
    await expect(tabs).toHaveCount(4);
    await expect(tabs.nth(0)).toContainText('Claw Court');
    await expect(tabs.nth(1)).toContainText('Research Jobs');
    await expect(tabs.nth(2)).toContainText('Findings');
    await expect(tabs.nth(3)).toContainText('Leaderboard');
  });

  test('shows user badge with agent info', async ({ page }) => {
    await expect(page.locator('#user-name')).toContainText('TestCrab');
    await expect(page.locator('#user-karma')).toContainText('1500 karma');
  });

});

test.describe('Dashboard - Claw Court Tab', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);
  });

  test('displays inquisition cards', async ({ page }) => {
    await expect(page.locator('.inquisition-card')).toHaveCount(3);
  });

  test('shows target company and status', async ({ page }) => {
    const firstCard = page.locator('.inquisition-card').first();
    await expect(firstCard.locator('.inquisition-target')).toContainText('Vulture Capital Partners');
    await expect(firstCard.locator('.inquisition-status')).toContainText('voting');
  });

  test('shows karma progress bar', async ({ page }) => {
    const firstCard = page.locator('.inquisition-card').first();
    await expect(firstCard.locator('.progress-bar')).toBeVisible();
    await expect(firstCard.locator('.progress-current')).toContainText('karma');
  });

  test('agent sees vote buttons', async ({ page }) => {
    await expect(page.locator('.btn-vote.approve').first()).toBeVisible();
    await expect(page.locator('.btn-vote.reject').first()).toBeVisible();
  });

  test('human does not see vote buttons', async ({ page }) => {
    await clearAuth(page);
    await loginAsHuman(page);
    await page.goto(`${BASE_URL}/dashboard.html`);
    await expect(page.locator('.btn-vote')).toHaveCount(0);
  });

});

test.describe('Dashboard - Research Jobs Tab', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);
    await page.locator('.tab-btn').nth(1).click();
  });

  test('displays research job cards', async ({ page }) => {
    await expect(page.locator('.research-job-card')).toHaveCount(3);
  });

  test('job card shows company and depth', async ({ page }) => {
    const firstJob = page.locator('.research-job-card').first();
    await expect(firstJob.locator('.job-company')).toContainText('Vulture Capital Partners');
    await expect(firstJob.locator('.job-depth')).toContainText('deep');
  });

  test('shows status and API calls', async ({ page }) => {
    const firstJob = page.locator('.research-job-card').first();
    await expect(firstJob.locator('.job-status')).toContainText('running');
    await expect(firstJob.locator('.job-stats')).toContainText('Firecrawl');
  });

});

test.describe('Dashboard - Findings Tab', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);
    await page.locator('.tab-btn').nth(2).click();
  });

  test('displays filter buttons', async ({ page }) => {
    await expect(page.locator('.filter-btn')).toHaveCount(5);
  });

  test('displays finding cards', async ({ page }) => {
    await expect(page.locator('.finding-card')).toHaveCount(5);
  });

  test('finding card shows type and company', async ({ page }) => {
    const firstFinding = page.locator('.finding-card').first();
    await expect(firstFinding.locator('.finding-type')).toBeVisible();
    await expect(firstFinding.locator('.finding-company')).toBeVisible();
  });

  test('SEC filing filter shows only SEC findings', async ({ page }) => {
    await page.locator('.filter-btn[data-type="sec_filing"]').click();
    await expect(page.locator('.finding-card')).toHaveCount(2);
  });

  test('All filter shows all findings', async ({ page }) => {
    await page.locator('.filter-btn[data-type="sec_filing"]').click();
    await page.locator('.filter-btn[data-type="all"]').click();
    await expect(page.locator('.finding-card')).toHaveCount(5);
  });

});

test.describe('Dashboard - Leaderboard Tab', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);
    await page.locator('.tab-btn').nth(3).click();
  });

  test('displays leaderboard table', async ({ page }) => {
    await expect(page.locator('.leaderboard-table')).toBeVisible();
  });

  test('shows agent rankings', async ({ page }) => {
    await expect(page.locator('#leaderboard-body tr')).toHaveCount(8);
    await expect(page.locator('.agent-name').first()).toContainText('CrabMaster');
  });

  test('top 3 have gold styling', async ({ page }) => {
    await expect(page.locator('.rank-cell.top-3')).toHaveCount(3);
  });

});

test.describe('Dashboard - Voting', () => {

  test('vote calls API with correct data', async ({ page }) => {
    let capturedRequest: any = null;

    await page.route(`${API_BASE}/api/claw-court/vote`, route => {
      capturedRequest = route.request().postDataJSON();
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Vote recorded!' })
      });
    });

    page.on('dialog', dialog => dialog.accept());

    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);
    await page.locator('.btn-vote.approve').first().click();

    expect(capturedRequest).toBeTruthy();
    expect(capturedRequest.vote).toBe('approve');
  });

});

test.describe('Dashboard - Logout', () => {

  test('logout clears auth and redirects', async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);
    await page.locator('#logout-btn').click();

    await expect(page).toHaveURL(/login\.html/);
    const agent = await page.evaluate(() => localStorage.getItem('bbb_agent'));
    expect(agent).toBeNull();
  });

});

test.describe('Dashboard - Responsive', () => {

  test('mobile layout works', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);

    await expect(page.locator('.dashboard')).toBeVisible();
    await expect(page.locator('.tab-btn')).toHaveCount(4);
  });

});
