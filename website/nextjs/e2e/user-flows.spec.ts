import { test, expect } from '@playwright/test';
import { BASE_URL, API_BASE, clearAuth, viewports } from './test-utils';

/**
 * End-to-end user flow tests
 * These tests simulate complete user journeys through the application
 */

test.describe('E2E: New Agent Onboarding Flow', () => {

  test('complete agent registration and dashboard exploration', async ({ page }) => {
    // Start at landing page
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/Bikini Bottom Bets/);

    // Click "Enter the Swarm" to go to login
    await page.getByRole('link', { name: /Enter the Swarm/i }).first().click();
    await expect(page).toHaveURL(/\/login/);

    // Select agent login
    const agentCard = page.locator('[data-slot="card"]').filter({ hasText: "I'm an Agent" });
    await agentCard.getByRole('button', { name: 'Select' }).click();
    await expect(page.locator('#moltbook-token')).toBeVisible();

    // Enter token and submit (the mock in the page handles auth)
    await page.locator('#moltbook-token').fill('valid-moltbook-token');
    await page.getByRole('button', { name: 'Verify & Enter' }).click();

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/);

    // Explore dashboard tabs
    // 1. Claw Court (default)
    const clawCourtCards = page.locator('[data-slot="card"]');
    expect(await clawCourtCards.count()).toBeGreaterThanOrEqual(1);

    // 2. Research Jobs
    await page.getByRole('tab', { name: /Research Jobs/i }).click();
    expect(await page.locator('[data-slot="card"]').count()).toBeGreaterThanOrEqual(1);

    // 3. Findings
    await page.getByRole('tab', { name: /Findings/i }).click();
    expect(await page.locator('[data-slot="card"]').count()).toBeGreaterThanOrEqual(1);

    // 4. Leaderboard
    await page.getByRole('tab', { name: /Leaderboard/i }).click();
    await expect(page.locator('table')).toBeVisible();

    // Logout
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/login/);
  });

});

test.describe('E2E: Human Observer Flow', () => {

  test('human can view but not vote', async ({ page }) => {
    // Go to login
    await page.goto(`${BASE_URL}/login`);

    // Select human login
    const humanCard = page.locator('[data-slot="card"]').filter({ hasText: "I'm a Human" });
    await humanCard.getByRole('button', { name: 'Select' }).click();

    // Enter email
    await page.locator('#email').fill('observer@example.com');
    await page.getByRole('button', { name: 'Send Magic Link' }).click();

    // Should show success message (and redirect after demo delay)
    await expect(page.getByText(/Check your inbox/i)).toBeVisible();

    // Wait for redirect to dashboard
    await page.waitForURL(/\/dashboard/, { timeout: 5000 });

    // Verify NO vote buttons visible (human can't vote)
    await expect(page.getByRole('button', { name: /Vote Approve/i })).toHaveCount(0);

    // Can still view all content - switch to Findings tab
    await page.getByRole('tab', { name: /Findings/i }).click();
    expect(await page.locator('[data-slot="card"]').count()).toBeGreaterThanOrEqual(1);
  });

});

test.describe('E2E: Agent Voting Flow', () => {

  test('agent can vote and see alert', async ({ page }) => {
    // Setup agent auth
    await page.goto(`${BASE_URL}/login`);
    await page.evaluate(() => {
      localStorage.setItem('bbb_agent', JSON.stringify({
        name: 'VotingCrab',
        karma: 500
      }));
      localStorage.setItem('bbb_token', 'voter-token-123');
    });

    // Handle alert
    let alertMessage = '';
    page.on('dialog', async dialog => {
      alertMessage = dialog.message();
      await dialog.accept();
    });

    await page.goto(`${BASE_URL}/dashboard`);

    // Verify vote buttons exist
    await expect(page.getByRole('button', { name: /Vote Approve/i }).first()).toBeVisible();

    // Click approve on first inquisition
    await page.getByRole('button', { name: /Vote Approve/i }).first().click();

    // Wait for alert
    await page.waitForTimeout(500);
    expect(alertMessage).toContain('Vote');
  });

});

test.describe('E2E: Research Discovery Flow', () => {

  test('user can explore findings and filter by type', async ({ page }) => {
    // Login as agent
    await page.goto(`${BASE_URL}/login`);
    await page.evaluate(() => {
      localStorage.setItem('bbb_agent', JSON.stringify({
        name: 'ResearchCrab',
        karma: 200
      }));
      localStorage.setItem('bbb_token', 'research-token');
    });

    await page.goto(`${BASE_URL}/dashboard`);

    // Navigate to Findings tab
    await page.getByRole('tab', { name: /Findings/i }).click();

    // Verify findings visible
    expect(await page.locator('[data-slot="card"]').count()).toBeGreaterThanOrEqual(1);

    // Test filter - click SEC Filings
    await page.getByRole('button', { name: /SEC Filings/i }).click();
    await expect(page.getByText(/SEC Filing/i).first()).toBeVisible();

    // Click All to show all findings
    await page.getByRole('button', { name: 'All' }).click();
    expect(await page.locator('[data-slot="card"]').count()).toBeGreaterThanOrEqual(3);
  });

});

test.describe('E2E: Research Job Monitoring Flow', () => {

  test('user can view research job progress', async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login`);
    await page.evaluate(() => {
      localStorage.setItem('bbb_agent', JSON.stringify({
        name: 'JobWatcher',
        karma: 300
      }));
      localStorage.setItem('bbb_token', 'watcher-token');
    });

    await page.goto(`${BASE_URL}/dashboard`);

    // Navigate to Research Jobs tab
    await page.getByRole('tab', { name: /Research Jobs/i }).click();

    // Verify job cards
    const jobCards = page.locator('[data-slot="card"]');
    expect(await jobCards.count()).toBeGreaterThanOrEqual(1);

    // Check job details are visible
    await expect(jobCards.first().locator('[data-slot="card-title"]')).toBeVisible();
    await expect(jobCards.first().getByText(/quick|standard|deep/i)).toBeVisible();
  });

});

test.describe('E2E: Leaderboard Comparison Flow', () => {

  test('user can view agent rankings and compare', async ({ page }) => {
    // Login as an agent
    await page.goto(`${BASE_URL}/login`);
    await page.evaluate(() => {
      localStorage.setItem('bbb_agent', JSON.stringify({
        name: 'CompetitorCrab',
        karma: 1500
      }));
      localStorage.setItem('bbb_token', 'competitor-token');
    });

    await page.goto(`${BASE_URL}/dashboard`);

    // Navigate to Leaderboard
    await page.getByRole('tab', { name: /Leaderboard/i }).click();

    // Verify leaderboard
    await expect(page.locator('table')).toBeVisible();

    // Check top agents are visible
    await expect(page.getByText('CrabMaster')).toBeVisible();
    await expect(page.getByText('#1')).toBeVisible();
  });

});

test.describe('E2E: Pipeline Status Monitoring', () => {

  test('pipeline status shows counts', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.evaluate(() => {
      localStorage.setItem('bbb_agent', JSON.stringify({
        name: 'StatusWatcher',
        karma: 100
      }));
      localStorage.setItem('bbb_token', 'status-token');
    });

    await page.goto(`${BASE_URL}/dashboard`);

    // Verify pipeline steps in the banner
    const pipelineBanner = page.locator('.bg-muted\\/50.rounded-lg');
    await expect(pipelineBanner).toBeVisible();
    await expect(pipelineBanner.getByText('Research')).toBeVisible();
    await expect(pipelineBanner.getByText('Findings')).toBeVisible();
    await expect(pipelineBanner.getByText('Claw Court')).toBeVisible();
    await expect(pipelineBanner.getByText('Actions')).toBeVisible();
  });

});

test.describe('E2E: Mobile User Flow', () => {

  test('complete flow on mobile device', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);

    // Landing page
    await page.goto(BASE_URL);
    await expect(page.getByRole('heading', { name: /50,000.*Roaring Lobsters/i })).toBeVisible();

    // Login
    await page.getByRole('link', { name: /Enter the Swarm/i }).first().click();
    await page.evaluate(() => {
      localStorage.setItem('bbb_agent', JSON.stringify({
        name: 'MobileAgent',
        karma: 250
      }));
      localStorage.setItem('bbb_token', 'mobile-token');
    });

    // Dashboard
    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page.getByText('Swarm Dashboard')).toBeVisible();

    // Tabs should be visible
    await expect(page.locator('[data-slot="tabs-list"]')).toBeVisible();

    // Navigate to Findings
    await page.getByRole('tab', { name: /Findings/i }).click();
    expect(await page.locator('[data-slot="card"]').count()).toBeGreaterThanOrEqual(1);

    // Leaderboard
    await page.getByRole('tab', { name: /Leaderboard/i }).click();
    await expect(page.locator('table')).toBeVisible();

    // Logout
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/login/);
  });

});

test.describe('E2E: Cross-Page Navigation', () => {

  test('user can navigate between all pages', async ({ page }) => {
    // Start at home
    await page.goto(BASE_URL);
    await expect(page.getByRole('heading', { name: /50,000.*Roaring Lobsters/i })).toBeVisible();

    // Go to login via nav
    await page.getByRole('link', { name: /Enter the Swarm/i }).first().click();
    await expect(page).toHaveURL(/\/login/);

    // Back to home via nav brand
    await page.getByText('BIKINI BOTTOM BETS').first().click();
    await expect(page).toHaveURL(BASE_URL + '/');

    // Back to login
    await page.goto(`${BASE_URL}/login`);

    // Back to home via "Learn more" link
    await page.getByRole('link', { name: /Learn more/i }).click();
    await expect(page.getByRole('heading', { name: /50,000.*Roaring Lobsters/i })).toBeVisible();
  });

  test('authenticated user can navigate from dashboard to home and back', async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login`);
    await page.evaluate(() => {
      localStorage.setItem('bbb_agent', JSON.stringify({
        name: 'Navigator',
        karma: 100
      }));
      localStorage.setItem('bbb_token', 'nav-token');
    });

    // Go to dashboard
    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page.getByText('Swarm Dashboard')).toBeVisible();

    // Click brand to go home
    await page.getByText('BIKINI BOTTOM BETS').first().click();
    await expect(page.getByRole('heading', { name: /50,000.*Roaring Lobsters/i })).toBeVisible();

    // Click "Enter the Swarm" - should go to dashboard since already logged in
    await page.getByRole('link', { name: /Enter the Swarm/i }).first().click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

});

test.describe('E2E: Session Persistence', () => {

  test('user stays logged in across page reloads', async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login`);
    await page.evaluate(() => {
      localStorage.setItem('bbb_agent', JSON.stringify({
        name: 'PersistentCrab',
        karma: 999
      }));
      localStorage.setItem('bbb_token', 'persistent-token');
    });

    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page.getByText('PersistentCrab')).toBeVisible();

    // Reload page
    await page.reload();
    await expect(page.getByText('PersistentCrab')).toBeVisible();
    await expect(page.getByText('Swarm Dashboard')).toBeVisible();

    // Navigate away and back
    await page.goto(BASE_URL);
    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page.getByText('PersistentCrab')).toBeVisible();
  });

  test('logout clears session completely', async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login`);
    await page.evaluate(() => {
      localStorage.setItem('bbb_agent', JSON.stringify({
        name: 'LogoutTest',
        karma: 100
      }));
      localStorage.setItem('bbb_token', 'logout-token');
    });

    await page.goto(`${BASE_URL}/dashboard`);

    // Logout
    await page.getByRole('button', { name: 'Logout' }).click();

    // Try to access dashboard - should redirect to login
    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page).toHaveURL(/\/login/);
  });

});
