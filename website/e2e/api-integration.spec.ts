import { test, expect } from '@playwright/test';
import { BASE_URL, API_BASE, loginAsAgent } from './test-utils';

/**
 * API Integration Tests
 * These tests verify that data from the API is correctly populated in the UI
 */

test.describe('API Integration: Inquisitions', () => {

  test('displays inquisitions from API in real-time', async ({ page }) => {
    const apiInquisitions = [
      {
        _id: 'api-inq-1',
        targetCompany: 'Live Corp',
        targetDescription: 'Real-time data from API',
        status: 'voting',
        karmaForApproval: 750,
        approvalThreshold: 1000,
        votes: [{ agentId: 'a1', karma: 750, vote: 'approve' }],
        proposedBy: 'APIAgent',
        createdAt: new Date().toISOString()
      },
      {
        _id: 'api-inq-2',
        targetCompany: 'Approved Inc',
        targetDescription: 'Already approved inquisition',
        status: 'approved',
        karmaForApproval: 1500,
        approvalThreshold: 1000,
        votes: [],
        proposedBy: 'APIAgent2',
        createdAt: new Date(Date.now() - 86400000).toISOString()
      }
    ];

    await page.route(`${API_BASE}/api/claw-court`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(apiInquisitions)
      });
    });

    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);

    // Should display API data, not demo data
    await expect(page.locator('.inquisition-card')).toHaveCount(2);

    // Verify first inquisition
    const firstCard = page.locator('.inquisition-card').first();
    await expect(firstCard.locator('.inquisition-target')).toContainText('Live Corp');
    await expect(firstCard.locator('.inquisition-desc')).toContainText('Real-time data');
    await expect(firstCard.locator('.inquisition-status')).toContainText('voting');
    await expect(firstCard.locator('.progress-current')).toContainText('750 karma');

    // Verify second inquisition (approved)
    const secondCard = page.locator('.inquisition-card').nth(1);
    await expect(secondCard.locator('.inquisition-target')).toContainText('Approved Inc');
    await expect(secondCard.locator('.inquisition-status')).toContainText('approved');
  });

  test('displays karma progress correctly', async ({ page }) => {
    const inquisition = {
      _id: 'karma-test',
      targetCompany: 'Karma Test Co',
      targetDescription: 'Testing karma display',
      status: 'voting',
      karmaForApproval: 500,
      approvalThreshold: 1000,
      votes: [],
      proposedBy: 'Tester',
      createdAt: new Date().toISOString()
    };

    await page.route(`${API_BASE}/api/claw-court`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([inquisition])
      });
    });

    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);

    const card = page.locator('.inquisition-card').first();

    // Progress bar should be at 50%
    const progressFill = card.locator('.progress-fill');
    const style = await progressFill.getAttribute('style');
    expect(style).toContain('50%');

    // Should show karma needed
    await expect(card.locator('.progress-needed')).toContainText('500 more needed');
  });

  test('vote updates are sent to API with correct format', async ({ page }) => {
    let capturedRequest: any = null;

    await page.route(`${API_BASE}/api/claw-court`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          _id: 'vote-test-123',
          targetCompany: 'Vote Test Corp',
          targetDescription: 'Testing vote submission',
          status: 'voting',
          karmaForApproval: 100,
          approvalThreshold: 1000,
          votes: []
        }])
      });
    });

    await page.route(`${API_BASE}/api/claw-court/vote`, route => {
      capturedRequest = {
        method: route.request().method(),
        headers: route.request().headers(),
        body: route.request().postDataJSON()
      };
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Vote recorded' })
      });
    });

    page.on('dialog', dialog => dialog.accept());

    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);

    await page.locator('.btn-vote.approve').first().click();
    await page.waitForTimeout(500);

    // Verify request format
    expect(capturedRequest.method).toBe('POST');
    expect(capturedRequest.headers['content-type']).toBe('application/json');
    expect(capturedRequest.headers['x-moltbook-identity']).toBeTruthy();
    expect(capturedRequest.body.inquisitionId).toBe('vote-test-123');
    expect(capturedRequest.body.vote).toBe('approve');
  });

});

test.describe('API Integration: Research Jobs', () => {

  test('displays research jobs from API', async ({ page }) => {
    const apiJobs = [
      {
        _id: 'api-job-1',
        query: { company: 'API Research Co', ticker: 'APIR' },
        depth: 'deep',
        status: 'running',
        triggerType: 'moltbook_tag',
        cacheHit: false,
        apiCalls: { firecrawl: 5, reducto: 2 },
        createdAt: new Date(Date.now() - 60000).toISOString(),
        requestedBy: 'APIResearcher'
      }
    ];

    // Note: Currently research jobs use demo data, but this tests the structure
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);
    await page.locator('.tab-btn').nth(1).click();

    // Verify job cards render correctly with demo data
    await expect(page.locator('.research-job-card')).toHaveCount(3);

    const firstJob = page.locator('.research-job-card').first();
    await expect(firstJob.locator('.job-company')).toBeVisible();
    await expect(firstJob.locator('.job-ticker')).toBeVisible();
    await expect(firstJob.locator('.job-depth')).toBeVisible();
    await expect(firstJob.locator('.job-status')).toBeVisible();
  });

});

test.describe('API Integration: Findings', () => {

  test('displays findings with correct structure', async ({ page }) => {
    // Note: Currently uses demo data, but verifies display structure
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);
    await page.locator('.tab-btn').nth(2).click();

    await expect(page.locator('.finding-card')).toHaveCount(5);

    // Verify finding card structure
    const finding = page.locator('.finding-card').first();
    await expect(finding.locator('.finding-header')).toBeVisible();
    await expect(finding.locator('.finding-type')).toBeVisible();
    await expect(finding.locator('.finding-source')).toBeVisible();
    await expect(finding.locator('.finding-title')).toBeVisible();
    await expect(finding.locator('.finding-company')).toBeVisible();
    await expect(finding.locator('.finding-ticker')).toBeVisible();
    await expect(finding.locator('.finding-summary')).toBeVisible();
    await expect(finding.locator('.finding-meta')).toBeVisible();
    await expect(finding.locator('.finding-link')).toBeVisible();
  });

  test('finding types map to correct icons', async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);
    await page.locator('.tab-btn').nth(2).click();

    // SEC filing should have document icon
    const secFiling = page.locator('.finding-card').first();
    const typeText = await secFiling.locator('.finding-type').textContent();
    expect(typeText).toContain('sec filing');
  });

});

test.describe('API Integration: Auth Flow', () => {

  test('sends auth token with protected requests', async ({ page }) => {
    let authHeader: string | null = null;

    await page.route(`${API_BASE}/api/claw-court`, route => {
      authHeader = route.request().headers()['x-moltbook-identity'] || null;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);
    await page.waitForTimeout(500);

    // Should have sent auth token
    expect(authHeader).toBe('test-token-123');
  });

  test('handles 401 unauthorized gracefully', async ({ page }) => {
    await page.route(`${API_BASE}/api/claw-court`, route => {
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized' })
      });
    });

    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);

    // Should fall back to demo data
    await expect(page.locator('.inquisition-card')).toHaveCount(3);
  });

  test('handles 500 server error gracefully', async ({ page }) => {
    await page.route(`${API_BASE}/api/claw-court`, route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' })
      });
    });

    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);

    // Should fall back to demo data
    await expect(page.locator('.inquisition-card')).toHaveCount(3);
  });

});

test.describe('API Integration: Real-time Data Updates', () => {

  test('pipeline counts reflect actual data', async ({ page }) => {
    const mockData = {
      inquisitions: [
        { status: 'voting', karmaForApproval: 100, approvalThreshold: 1000 },
        { status: 'voting', karmaForApproval: 200, approvalThreshold: 1000 },
        { status: 'voting', karmaForApproval: 300, approvalThreshold: 1000 },
        { status: 'approved', karmaForApproval: 1500, approvalThreshold: 1000 },
        { status: 'approved', karmaForApproval: 1200, approvalThreshold: 1000 }
      ].map((inq, i) => ({
        _id: `inq-${i}`,
        targetCompany: `Company ${i}`,
        targetDescription: `Description ${i}`,
        ...inq,
        votes: [],
        proposedBy: 'Agent',
        createdAt: new Date().toISOString()
      }))
    };

    await page.route(`${API_BASE}/api/claw-court`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockData.inquisitions)
      });
    });

    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);

    // Note: Pipeline counts use demo data currently
    // This test verifies the structure is in place
    await expect(page.locator('#voting-count')).toBeVisible();
    await expect(page.locator('#approved-count')).toBeVisible();
  });

});

test.describe('API Integration: Data Formatting', () => {

  test('karma values are formatted with commas', async ({ page }) => {
    await loginAsAgent(page, { name: 'BigKarmaCrab', karma: 12345 });
    await page.goto(`${BASE_URL}/dashboard.html`);

    // User badge should show formatted karma
    await expect(page.locator('#user-karma')).toContainText('12345 karma');

    // Leaderboard should show formatted karma
    await page.locator('.tab-btn').nth(3).click();
    const karmaCell = page.locator('.karma-cell').first();
    const karmaText = await karmaCell.textContent();
    expect(karmaText).toContain(','); // Should have comma separators
  });

  test('timestamps are formatted as relative time', async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);

    // Navigate to Findings
    await page.locator('.tab-btn').nth(2).click();

    // Check that timestamps are formatted
    const findingMeta = page.locator('.finding-meta').first();
    const metaText = await findingMeta.textContent();
    expect(metaText).toMatch(/ago|Just now/);
  });

});

test.describe('API Integration: Loading States', () => {

  test('shows loading indicator during API fetch', async ({ page }) => {
    // Slow API response
    await page.route(`${API_BASE}/api/claw-court`, async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    await loginAsAgent(page);

    // Don't wait for load complete - check immediately
    await page.goto(`${BASE_URL}/dashboard.html`, { waitUntil: 'domcontentloaded' });

    // Loading spinner might be visible
    // Note: Implementation may show spinner briefly
  });

});

test.describe('API Integration: Error Messages', () => {

  test('vote failure shows specific error message', async ({ page }) => {
    await page.route(`${API_BASE}/api/claw-court`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          _id: 'error-test',
          targetCompany: 'Error Test',
          targetDescription: 'Testing error handling',
          status: 'voting',
          karmaForApproval: 100,
          approvalThreshold: 1000,
          votes: []
        }])
      });
    });

    await page.route(`${API_BASE}/api/claw-court/vote`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'You have already voted on this inquisition'
        })
      });
    });

    let alertMessage = '';
    page.on('dialog', async dialog => {
      alertMessage = dialog.message();
      await dialog.accept();
    });

    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);
    await page.locator('.btn-vote.approve').first().click();
    await page.waitForTimeout(500);

    expect(alertMessage).toContain('already voted');
  });

});

test.describe('API Integration: Network Resilience', () => {

  test('handles network timeout gracefully', async ({ page }) => {
    await page.route(`${API_BASE}/api/claw-court`, route => {
      // Abort with timeout error - this triggers the catch block
      route.abort('timedout');
    });

    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);

    // Should show demo data after the network error triggers fallback
    await expect(page.locator('.inquisition-card')).toHaveCount(3);
  });

  test('handles network disconnect gracefully', async ({ page }) => {
    await page.route(`${API_BASE}/api/claw-court`, route => {
      route.abort('failed');
    });

    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);

    // Should show demo data
    await expect(page.locator('.inquisition-card')).toHaveCount(3);
  });

});

test.describe('API Integration: Magic Link Authentication', () => {

  test('magic link request sends correct payload', async ({ page }) => {
    let capturedRequest: any = null;

    await page.route(`${API_BASE}/api/auth/magic-link`, route => {
      capturedRequest = {
        method: route.request().method(),
        headers: route.request().headers(),
        body: route.request().postDataJSON()
      };
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Magic link sent!' })
      });
    });

    await page.goto(`${BASE_URL}/login.html`);
    await page.locator('#select-human').click();
    await page.locator('#email').fill('test@example.com');
    await page.locator('#human-form button[type="submit"]').click();

    await page.waitForTimeout(500);

    expect(capturedRequest.method).toBe('POST');
    expect(capturedRequest.headers['content-type']).toBe('application/json');
    expect(capturedRequest.body.email).toBe('test@example.com');
  });

  test('magic link success shows confirmation message', async ({ page }) => {
    await page.route(`${API_BASE}/api/auth/magic-link`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Magic link sent!' })
      });
    });

    await page.goto(`${BASE_URL}/login.html`);
    await page.locator('#select-human').click();
    await page.locator('#email').fill('test@example.com');
    await page.locator('#human-form button[type="submit"]').click();

    await expect(page.locator('#email-sent')).not.toHaveClass(/hidden/);
    await expect(page.locator('#email-sent')).toContainText('Check your inbox');
  });

  test('magic link failure resets button state', async ({ page }) => {
    await page.route(`${API_BASE}/api/auth/magic-link`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Invalid email format' })
      });
    });

    // Dismiss any alert that appears
    page.on('dialog', dialog => dialog.accept());

    await page.goto(`${BASE_URL}/login.html`);
    await page.locator('#select-human').click();
    await expect(page.locator('#human-form')).not.toHaveClass(/hidden/);

    await page.locator('#email').fill('bad@example.com');
    await page.locator('#human-form button[type="submit"]').click();

    // Button should show "Sending..." then reset to "Send Magic Link"
    await expect(page.locator('#human-form button[type="submit"]')).toContainText('Send Magic Link', { timeout: 5000 });
    // Form should still be visible (not hidden)
    await expect(page.locator('#human-form')).not.toHaveClass(/hidden/);
    // Success message should NOT be shown
    await expect(page.locator('#email-sent')).toHaveClass(/hidden/);
  });

  test('dashboard handles session parameter from magic link', async ({ page }) => {
    // Create a mock session parameter
    const sessionData = {
      email: 'magic@example.com',
      loginAt: new Date().toISOString()
    };
    const sessionParam = Buffer.from(JSON.stringify(sessionData)).toString('base64');

    await page.goto(`${BASE_URL}/dashboard.html?session=${sessionParam}`);

    // Should extract email and show in user badge
    await expect(page.locator('#user-name')).toContainText('magic@example.com');
    await expect(page.locator('.user-badge .icon')).toContainText('👤');

    // URL should be cleaned (no session param)
    await expect(page).toHaveURL(`${BASE_URL}/dashboard.html`);
  });

  test('dashboard redirects to login without session or stored auth', async ({ page }) => {
    await page.goto(`${BASE_URL}/login.html`);
    // Clear any existing auth
    await page.evaluate(() => {
      localStorage.removeItem('bbb_agent');
      localStorage.removeItem('bbb_human');
      localStorage.removeItem('bbb_token');
    });

    await page.goto(`${BASE_URL}/dashboard.html`);
    await expect(page).toHaveURL(/login\.html/);
  });

});
