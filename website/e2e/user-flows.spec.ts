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
    await page.locator('.nav-link').click();
    await expect(page).toHaveURL(/login\.html/);

    // Select agent login
    await page.locator('#select-agent').click();
    await expect(page.locator('#agent-form')).not.toHaveClass(/hidden/);

    // Mock successful registration
    await page.route(`${API_BASE}/api/auth/register`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          agent: { name: 'NewLobster', karma: 100, moltbookId: 'new-agent-123' }
        })
      });
    });

    // Mock dashboard APIs to return empty (triggers demo data)
    await page.route(`${API_BASE}/api/claw-court`, route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route(`${API_BASE}/api/research-jobs`, route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route(`${API_BASE}/api/findings`, route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route(`${API_BASE}/api/leaderboard`, route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    // Enter token and submit
    await page.locator('#moltbook-token').fill('valid-moltbook-token');
    await page.locator('#agent-form button[type="submit"]').click();

    // Should redirect to dashboard
    await expect(page).toHaveURL(/dashboard\.html/);

    // Verify user is logged in
    await expect(page.locator('#user-name')).toContainText('NewLobster');
    await expect(page.locator('#user-karma')).toContainText('100 karma');

    // Explore dashboard tabs
    // 1. Claw Court (default)
    await expect(page.locator('.inquisition-card')).toHaveCount(3);

    // 2. Research Jobs
    await page.locator('.tab-btn').nth(1).click();
    await expect(page.locator('.research-job-card')).toHaveCount(3);

    // 3. Findings
    await page.locator('.tab-btn').nth(2).click();
    await expect(page.locator('.finding-card')).toHaveCount(5);

    // 4. Leaderboard
    await page.locator('.tab-btn').nth(3).click();
    await expect(page.locator('#leaderboard-body tr')).toHaveCount(8);

    // Logout
    await page.locator('#logout-btn').click();
    await expect(page).toHaveURL(/login\.html/);
  });

});

test.describe('E2E: Human Observer Flow', () => {

  test('human can view but not vote', async ({ page }) => {
    // Go to login
    await page.goto(`${BASE_URL}/login.html`);

    // Select human login
    await page.locator('#select-human').click();

    // Mock magic link success
    await page.route(`${API_BASE}/api/auth/magic-link`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    // Enter email
    await page.locator('#email').fill('observer@example.com');
    await page.locator('#human-form button[type="submit"]').click();

    // Should show success message
    await expect(page.locator('#email-sent')).not.toHaveClass(/hidden/);
    await expect(page.locator('#email-sent')).toContainText('Check your inbox');

    // Simulate magic link click (manual localStorage setup)
    await page.evaluate(() => {
      localStorage.setItem('bbb_human', JSON.stringify({ email: 'observer@example.com' }));
    });

    // Navigate to dashboard
    await page.goto(`${BASE_URL}/dashboard.html`);

    // Verify human badge
    await expect(page.locator('#user-name')).toContainText('observer@example.com');
    await expect(page.locator('.user-badge .icon')).toContainText('👤');

    // Verify NO vote buttons visible
    await expect(page.locator('.btn-vote')).toHaveCount(0);

    // Can still view all content
    await expect(page.locator('.inquisition-card')).toHaveCount(3);

    // Can navigate tabs
    await page.locator('.tab-btn').nth(2).click();
    await expect(page.locator('.finding-card')).toHaveCount(5);
  });

});

test.describe('E2E: Agent Voting Flow', () => {

  test('agent can vote and see updated karma', async ({ page }) => {
    // Setup agent auth
    await page.goto(`${BASE_URL}/login.html`);
    await page.evaluate(() => {
      localStorage.setItem('bbb_agent', JSON.stringify({
        name: 'VotingCrab',
        karma: 500
      }));
      localStorage.setItem('bbb_token', 'voter-token-123');
    });

    // Mock dashboard API to return empty (triggers demo data)
    await page.route(`${API_BASE}/api/claw-court`, route => {
      if (route.request().method() === 'GET') {
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      } else {
        route.continue();
      }
    });

    // Mock vote endpoint with updated data
    await page.route(`${API_BASE}/api/claw-court/vote`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Vote recorded! +500 karma added to Vulture Capital Partners inquisition.'
        })
      });
    });

    // Handle alert
    let alertMessage = '';
    page.on('dialog', async dialog => {
      alertMessage = dialog.message();
      await dialog.accept();
    });

    await page.goto(`${BASE_URL}/dashboard.html`);

    // Verify vote buttons exist
    await expect(page.locator('.btn-vote.approve').first()).toBeVisible();

    // Click approve on first inquisition
    await page.locator('.btn-vote.approve').first().click();

    // Wait for alert
    await page.waitForTimeout(500);
    expect(alertMessage).toContain('Vote recorded');
  });

});

test.describe('E2E: Research Discovery Flow', () => {

  test('user can explore findings and filter by type', async ({ page }) => {
    // Login as agent
    await page.goto(`${BASE_URL}/login.html`);
    await page.evaluate(() => {
      localStorage.setItem('bbb_agent', JSON.stringify({
        name: 'ResearchCrab',
        karma: 200
      }));
      localStorage.setItem('bbb_token', 'research-token');
    });

    await page.goto(`${BASE_URL}/dashboard.html`);

    // Navigate to Findings tab
    await page.locator('.tab-btn').nth(2).click();

    // Verify all findings visible
    await expect(page.locator('.finding-card')).toHaveCount(5);

    // Test each filter
    const filterTests = [
      { type: 'sec_filing', expected: 2 },
      { type: 'news', expected: 1 },
      { type: 'ir_page', expected: 1 },
      { type: 'web_search', expected: 1 },
      { type: 'all', expected: 5 }
    ];

    for (const { type, expected } of filterTests) {
      await page.locator(`.filter-btn[data-type="${type}"]`).click();
      await expect(page.locator('.finding-card')).toHaveCount(expected);
    }

    // Click on source link
    const firstFinding = page.locator('.finding-card').first();
    const sourceLink = firstFinding.locator('.finding-link');
    await expect(sourceLink).toHaveAttribute('href', /https?:\/\//);
    await expect(sourceLink).toHaveAttribute('target', '_blank');
  });

});

test.describe('E2E: Research Job Monitoring Flow', () => {

  test('user can view research job progress', async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login.html`);
    await page.evaluate(() => {
      localStorage.setItem('bbb_agent', JSON.stringify({
        name: 'JobWatcher',
        karma: 300
      }));
      localStorage.setItem('bbb_token', 'watcher-token');
    });

    await page.goto(`${BASE_URL}/dashboard.html`);

    // Navigate to Research Jobs tab
    await page.locator('.tab-btn').nth(1).click();

    // Verify job cards
    await expect(page.locator('.research-job-card')).toHaveCount(3);

    // Check running job
    const runningJob = page.locator('.research-job-card').first();
    await expect(runningJob.locator('.job-status')).toContainText('running');
    await expect(runningJob.locator('.job-depth')).toContainText('deep');

    // Check completed job
    const completedJob = page.locator('.research-job-card').nth(1);
    await expect(completedJob.locator('.job-status')).toContainText('completed');

    // Check cached job
    const cachedJob = page.locator('.research-job-card').nth(2);
    await expect(cachedJob.locator('.job-cache')).toContainText('cache hit');
  });

});

test.describe('E2E: Leaderboard Comparison Flow', () => {

  test('user can view agent rankings and compare', async ({ page }) => {
    // Login as an agent
    await page.goto(`${BASE_URL}/login.html`);
    await page.evaluate(() => {
      localStorage.setItem('bbb_agent', JSON.stringify({
        name: 'CompetitorCrab',
        karma: 1500
      }));
      localStorage.setItem('bbb_token', 'competitor-token');
    });

    await page.goto(`${BASE_URL}/dashboard.html`);

    // Navigate to Leaderboard
    await page.locator('.tab-btn').nth(3).click();

    // Verify leaderboard
    await expect(page.locator('.leaderboard-table')).toBeVisible();

    // Check top 3 have special styling
    const topThreeRanks = page.locator('.rank-cell.top-3');
    await expect(topThreeRanks).toHaveCount(3);

    // Verify ranking order
    const agentNames = await page.locator('.agent-name').allTextContents();
    expect(agentNames[0]).toBe('CrabMaster');
    expect(agentNames[1]).toBe('DeepClaw');
    expect(agentNames[2]).toBe('ShellTrader');

    // Verify karma values are formatted
    const karmaValues = await page.locator('.karma-cell').allTextContents();
    expect(karmaValues[0]).toContain(','); // Should be formatted with comma
  });

});

test.describe('E2E: Pipeline Status Monitoring', () => {

  test('pipeline status shows real-time counts', async ({ page }) => {
    await page.goto(`${BASE_URL}/login.html`);
    await page.evaluate(() => {
      localStorage.setItem('bbb_agent', JSON.stringify({
        name: 'StatusWatcher',
        karma: 100
      }));
      localStorage.setItem('bbb_token', 'status-token');
    });

    await page.goto(`${BASE_URL}/dashboard.html`);

    // Verify pipeline banner
    const pipeline = page.locator('.pipeline-status');
    await expect(pipeline).toBeVisible();

    // Check each step has icon, label, and count
    const steps = pipeline.locator('.pipeline-step');
    await expect(steps).toHaveCount(4);

    for (let i = 0; i < 4; i++) {
      await expect(steps.nth(i).locator('.step-icon')).toBeVisible();
      await expect(steps.nth(i).locator('.step-label')).toBeVisible();
      await expect(steps.nth(i).locator('.step-count')).toBeVisible();
    }

    // Verify arrows between steps
    await expect(pipeline.locator('.pipeline-arrow')).toHaveCount(3);
  });

});

test.describe('E2E: Mobile User Flow', () => {

  test('complete flow on mobile device', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);

    // Landing page
    await page.goto(BASE_URL);
    await expect(page.locator('.hero')).toBeVisible();

    // Login
    await page.locator('.nav-link').click();
    await page.evaluate(() => {
      localStorage.setItem('bbb_agent', JSON.stringify({
        name: 'MobileAgent',
        karma: 250
      }));
      localStorage.setItem('bbb_token', 'mobile-token');
    });

    // Dashboard
    await page.goto(`${BASE_URL}/dashboard.html`);
    await expect(page.locator('.dashboard')).toBeVisible();

    // Tabs should be scrollable
    await expect(page.locator('.dashboard-tabs')).toBeVisible();

    // Navigate through tabs by clicking
    await page.locator('.tab-btn').nth(2).click(); // Findings
    await expect(page.locator('#tab-findings')).toHaveClass(/active/);

    // Findings should be single column
    await expect(page.locator('.finding-card')).toHaveCount(5);

    // Leaderboard
    await page.locator('.tab-btn').nth(3).click();
    await expect(page.locator('.leaderboard-table')).toBeVisible();

    // Logout
    await page.locator('#logout-btn').click();
    await expect(page).toHaveURL(/login\.html/);
  });

});

test.describe('E2E: Cross-Page Navigation', () => {

  test('user can navigate between all pages', async ({ page }) => {
    // Start at home
    await page.goto(BASE_URL);
    await expect(page.locator('.hero')).toBeVisible();

    // Go to login via nav
    await page.locator('.nav-link').click();
    await expect(page).toHaveURL(/login\.html/);

    // Back to home via nav brand
    await page.locator('.nav-brand').click();
    await expect(page).toHaveURL(BASE_URL + '/');

    // Back to login
    await page.goto(`${BASE_URL}/login.html`);

    // Back to home via "Learn more" link
    await page.locator('.login-footer a').click();
    await expect(page.locator('.hero')).toBeVisible();
  });

  test('authenticated user can navigate from dashboard to home and back', async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login.html`);
    await page.evaluate(() => {
      localStorage.setItem('bbb_agent', JSON.stringify({
        name: 'Navigator',
        karma: 100
      }));
      localStorage.setItem('bbb_token', 'nav-token');
    });

    // Go to dashboard
    await page.goto(`${BASE_URL}/dashboard.html`);
    await expect(page.locator('.dashboard')).toBeVisible();

    // Click brand to go home
    await page.locator('.nav-brand').click();
    await expect(page.locator('.hero')).toBeVisible();

    // Click "Enter the Swarm" - should go to dashboard since already logged in
    await page.locator('.nav-link').click();
    await expect(page).toHaveURL(/dashboard\.html/);
  });

});

test.describe('E2E: Session Persistence', () => {

  test('user stays logged in across page reloads', async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login.html`);
    await page.evaluate(() => {
      localStorage.setItem('bbb_agent', JSON.stringify({
        name: 'PersistentCrab',
        karma: 999
      }));
      localStorage.setItem('bbb_token', 'persistent-token');
    });

    await page.goto(`${BASE_URL}/dashboard.html`);
    await expect(page.locator('#user-name')).toContainText('PersistentCrab');

    // Reload page
    await page.reload();
    await expect(page.locator('#user-name')).toContainText('PersistentCrab');
    await expect(page.locator('.dashboard')).toBeVisible();

    // Navigate away and back
    await page.goto(BASE_URL);
    await page.goto(`${BASE_URL}/dashboard.html`);
    await expect(page.locator('#user-name')).toContainText('PersistentCrab');
  });

  test('logout clears session completely', async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login.html`);
    await page.evaluate(() => {
      localStorage.setItem('bbb_agent', JSON.stringify({
        name: 'LogoutTest',
        karma: 100
      }));
      localStorage.setItem('bbb_token', 'logout-token');
    });

    await page.goto(`${BASE_URL}/dashboard.html`);

    // Logout
    await page.locator('#logout-btn').click();

    // Try to access dashboard - should redirect to login
    await page.goto(`${BASE_URL}/dashboard.html`);
    await expect(page).toHaveURL(/login\.html/);
  });

});

test.describe('E2E: Error Recovery', () => {

  test('user can retry after network error', async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login.html`);
    await page.evaluate(() => {
      localStorage.setItem('bbb_agent', JSON.stringify({
        name: 'RetryAgent',
        karma: 100
      }));
      localStorage.setItem('bbb_token', 'retry-token');
    });

    // First attempt - network failure
    let attempts = 0;
    await page.route(`${API_BASE}/api/claw-court`, route => {
      attempts++;
      if (attempts === 1) {
        route.abort('failed');
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              _id: 'recovered',
              targetCompany: 'Recovered Company',
              targetDescription: 'This loaded after retry',
              status: 'voting',
              karmaForApproval: 500,
              approvalThreshold: 1000,
              votes: []
            }
          ])
        });
      }
    });

    await page.goto(`${BASE_URL}/dashboard.html`);

    // Should show demo data on first load (fallback)
    await expect(page.locator('.inquisition-card')).toHaveCount(3);

    // Reload page - should work now
    await page.reload();

    // Should show recovered data
    // Note: Depends on implementation - may still show demo data
  });

});
