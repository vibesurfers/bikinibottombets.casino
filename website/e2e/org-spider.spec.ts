import { test, expect } from '@playwright/test';
import { BASE_URL, API_BASE, loginAsAgent, clearAuth, viewports } from './test-utils';

// --- Mock Data ---
const mockTopFunds = {
  funds: [
    { id: 'fund-1', name: 'Blackstone', ticker: 'BX', aum: 1000000000000, portfolioCount: 15, teamCount: 8, coInvestorCount: 5 },
    { id: 'fund-2', name: 'KKR', ticker: 'KKR', aum: 550000000000, portfolioCount: 12, teamCount: 6, coInvestorCount: 4 },
  ],
  count: 2,
};

const mockGraphData = {
  nodes: [
    { id: 'org-fund-1', label: 'Blackstone', type: 'pe_fund', data: { entityType: 'organization', entityId: 'fund-1', orgType: 'pe_fund', ticker: 'BX', aum: 1000000000000 } },
    { id: 'org-comp-1', label: 'Hilton', type: 'company', data: { entityType: 'organization', entityId: 'comp-1', orgType: 'portfolio_company', ticker: 'HLT' } },
    { id: 'person-1', label: 'Steve Schwarzman', type: 'person', data: { entityType: 'person', entityId: 'person-1', title: 'CEO' } },
  ],
  edges: [
    { id: 'e1', source: 'org-fund-1', target: 'org-comp-1', label: 'Portfolio Company', type: 'portfolio_company', data: { confidence: 0.95 } },
    { id: 'e2', source: 'person-1', target: 'org-fund-1', label: 'Founder', type: 'founder', data: { confidence: 0.99 } },
  ],
  meta: { rootEntityType: 'organization', rootEntityId: 'fund-1', depth: 2, nodeCount: 3, edgeCount: 2 },
};

const mockJobRunning = {
  jobId: 'job-123',
  status: 'running',
  targetName: 'Blackstone',
  message: 'Spider job started for organization: Blackstone',
};

const mockJobCompleted = {
  id: 'job-123',
  targetType: 'organization',
  targetName: 'Blackstone',
  targetId: 'fund-1',
  status: 'completed',
  depth: 'standard',
  progress: {
    stepsCompleted: 6,
    totalSteps: 6,
    currentStep: 'Complete',
    organizationsFound: 15,
    personsFound: 8,
    relationshipsFound: 23,
  },
};

const mockJobInProgress = {
  id: 'job-123',
  targetType: 'organization',
  targetName: 'Blackstone',
  status: 'running',
  depth: 'standard',
  progress: {
    stepsCompleted: 3,
    totalSteps: 6,
    currentStep: 'Extracting SEC filings data',
    organizationsFound: 5,
    personsFound: 3,
    relationshipsFound: 10,
  },
};

// Helper to set up common API mocks
async function setupApiMocks(page: import('@playwright/test').Page) {
  // Mock top funds
  await page.route('**/api/pe/top-funds*', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockTopFunds),
    });
  });

  // Mock graph endpoint (default empty)
  await page.route('**/api/graph*', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockGraphData),
    });
  });
}

// =========================================================================
// Auth Guard
// =========================================================================
test.describe('Org Spider - Auth Guard', () => {
  test('redirects to login when not authenticated', async ({ page }) => {
    await clearAuth(page);
    await page.goto(`${BASE_URL}/org-spider.html`);
    await expect(page).toHaveURL(/login/);
  });
});

// =========================================================================
// Page Layout
// =========================================================================
test.describe('Org Spider - Page Layout', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/org-spider.html`);
  });

  test('displays page title "Org Spider"', async ({ page }) => {
    await expect(page.locator('.dashboard-title')).toContainText('Org Spider');
  });

  test('displays search input with placeholder', async ({ page }) => {
    await expect(page.locator('#spider-input')).toBeVisible();
    await expect(page.locator('#spider-input')).toHaveAttribute('placeholder', /PE fund|organization/);
  });

  test('displays depth selector with three options', async ({ page }) => {
    await expect(page.locator('.depth-btn')).toHaveCount(3);
    await expect(page.locator('.depth-btn[data-depth="shallow"]')).toBeVisible();
    await expect(page.locator('.depth-btn[data-depth="standard"]')).toBeVisible();
    await expect(page.locator('.depth-btn[data-depth="deep"]')).toBeVisible();
  });

  test('standard depth is active by default', async ({ page }) => {
    await expect(page.locator('.depth-btn[data-depth="standard"]')).toHaveClass(/active/);
    await expect(page.locator('.depth-btn[data-depth="shallow"]')).not.toHaveClass(/active/);
    await expect(page.locator('.depth-btn[data-depth="deep"]')).not.toHaveClass(/active/);
  });

  test('displays fund chips for quick select', async ({ page }) => {
    const chips = page.locator('.fund-chip');
    await expect(chips.first()).toBeVisible();
    // Check that at least Blackstone and KKR chips exist
    await expect(page.locator('.fund-chip[data-fund="Blackstone"]')).toBeVisible();
    await expect(page.locator('.fund-chip[data-fund="KKR"]')).toBeVisible();
  });

  test('displays graph legend with node types', async ({ page }) => {
    await expect(page.locator('.graph-legend')).toBeVisible();
    await expect(page.locator('.legend-item')).toHaveCount(5); // PE Fund, VC Fund, Asset Mgr, Company, Person
  });

  test('displays empty state message', async ({ page }) => {
    // Need to not have graph loaded - block graph api
    await page.route('**/api/graph*', route => {
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"fail"}' });
    });
    await page.goto(`${BASE_URL}/org-spider.html`);
    await expect(page.locator('#graph-empty')).toBeVisible();
    await expect(page.locator('#graph-empty')).toContainText('Search for a PE fund');
  });

  test('displays graph controls', async ({ page }) => {
    await expect(page.locator('#zoom-in')).toBeVisible();
    await expect(page.locator('#zoom-out')).toBeVisible();
    await expect(page.locator('#fit-graph')).toBeVisible();
    await expect(page.locator('#reset-layout')).toBeVisible();
  });
});

// =========================================================================
// Top Funds Panel
// =========================================================================
test.describe('Org Spider - Top Funds Panel', () => {
  test('loads and displays top funds from API', async ({ page }) => {
    await setupApiMocks(page);
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/org-spider.html`);

    await expect(page.locator('.top-fund-item')).toHaveCount(2);
  });

  test('shows fund name, ticker, portfolio count, team count', async ({ page }) => {
    await setupApiMocks(page);
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/org-spider.html`);

    const firstFund = page.locator('.top-fund-item').first();
    await expect(firstFund.locator('.fund-name')).toContainText('Blackstone');
    await expect(firstFund.locator('.fund-ticker')).toContainText('BX');
    await expect(firstFund.locator('.fund-stats')).toContainText('15 portfolio');
    await expect(firstFund.locator('.fund-stats')).toContainText('8 team');
  });

  test('shows fallback when API fails', async ({ page }) => {
    await page.route('**/api/pe/top-funds*', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Server error' }),
      });
    });
    await page.route('**/api/graph*', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ nodes: [], edges: [], meta: {} }) });
    });

    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/org-spider.html`);

    await expect(page.locator('#top-funds-list')).toContainText('No funds loaded yet');
  });
});

// =========================================================================
// Depth Selection
// =========================================================================
test.describe('Org Spider - Depth Selection', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/org-spider.html`);
  });

  test('clicking depth button updates active state', async ({ page }) => {
    await page.locator('.depth-btn[data-depth="deep"]').click();
    await expect(page.locator('.depth-btn[data-depth="deep"]')).toHaveClass(/active/);
    await expect(page.locator('.depth-btn[data-depth="standard"]')).not.toHaveClass(/active/);
  });

  test('only one depth can be active at a time', async ({ page }) => {
    await page.locator('.depth-btn[data-depth="shallow"]').click();

    const activeDepths = page.locator('.depth-btn.active');
    await expect(activeDepths).toHaveCount(1);
    await expect(page.locator('.depth-btn[data-depth="shallow"]')).toHaveClass(/active/);
  });
});

// =========================================================================
// Spider Search Flow
// =========================================================================
test.describe('Org Spider - Spider Search Flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await loginAsAgent(page);
  });

  test('clicking Start Spider with empty input shows alert', async ({ page }) => {
    await page.goto(`${BASE_URL}/org-spider.html`);

    // Register dialog handler before triggering it — alert() blocks the page
    let dialogMessage = '';
    page.on('dialog', async dialog => {
      dialogMessage = dialog.message();
      await dialog.dismiss();
    });

    await page.locator('#spider-btn').click();
    // Give time for the dialog event to fire and resolve
    await page.waitForTimeout(200);
    expect(dialogMessage).toContain('enter a fund');
  });

  test('typing name and clicking Start Spider sends POST', async ({ page }) => {
    let capturedBody: any = null;
    await page.route('**/api/org-spider/research', route => {
      capturedBody = route.request().postDataJSON();
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockJobRunning),
      });
    });
    // Also mock the job status polling
    await page.route('**/api/org-spider/job*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockJobCompleted),
      });
    });

    await page.goto(`${BASE_URL}/org-spider.html`);
    await page.locator('#spider-input').fill('Blackstone');
    await page.locator('#spider-btn').click();

    // Wait for the POST to be captured
    await page.waitForTimeout(500);

    expect(capturedBody).not.toBeNull();
    expect(capturedBody.targetName).toBe('Blackstone');
    expect(capturedBody.targetType).toBe('organization');
    expect(capturedBody.depth).toBe('standard');
  });

  test('button becomes disabled with Starting text during search', async ({ page }) => {
    // Delay the research response
    await page.route('**/api/org-spider/research', route => {
      // Don't fulfill immediately — let the button state be checked
      setTimeout(() => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockJobRunning),
        });
      }, 1000);
    });
    await page.route('**/api/org-spider/job*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockJobCompleted),
      });
    });

    await page.goto(`${BASE_URL}/org-spider.html`);
    await page.locator('#spider-input').fill('Test Fund');
    await page.locator('#spider-btn').click();

    // Check disabled state immediately
    await expect(page.locator('#spider-btn')).toBeDisabled();
    await expect(page.locator('#spider-btn')).toContainText('Starting');
  });

  test('job status panel appears when spider starts', async ({ page }) => {
    await page.route('**/api/org-spider/research', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockJobRunning),
      });
    });
    await page.route('**/api/org-spider/job*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockJobInProgress),
      });
    });

    await page.goto(`${BASE_URL}/org-spider.html`);
    await page.locator('#spider-input').fill('Blackstone');
    await page.locator('#spider-btn').click();

    await expect(page.locator('#job-status')).toHaveClass(/active/);
  });

  test('button re-enables after completion', async ({ page }) => {
    await page.route('**/api/org-spider/research', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockJobRunning),
      });
    });
    await page.route('**/api/org-spider/job*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockJobCompleted),
      });
    });

    await page.goto(`${BASE_URL}/org-spider.html`);
    await page.locator('#spider-input').fill('Blackstone');
    await page.locator('#spider-btn').click();

    // Wait for polling to complete (polling interval is 2s)
    await expect(page.locator('#spider-btn')).toBeEnabled({ timeout: 5000 });
    await expect(page.locator('#spider-btn')).toContainText('Start Spider');
  });
});

// =========================================================================
// Fund Chip Quick Select
// =========================================================================
test.describe('Org Spider - Fund Chip Quick Select', () => {
  test('clicking a fund chip fills the search input', async ({ page }) => {
    await setupApiMocks(page);

    // Mock spider endpoints
    await page.route('**/api/org-spider/research', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockJobRunning),
      });
    });
    await page.route('**/api/org-spider/job*', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockJobCompleted),
      });
    });

    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/org-spider.html`);

    await page.locator('.fund-chip[data-fund="KKR"]').click();

    await expect(page.locator('#spider-input')).toHaveValue('KKR');
  });
});

// =========================================================================
// Graph Rendering
// =========================================================================
test.describe('Org Spider - Graph Rendering', () => {
  test('graph container is present with #cy element', async ({ page }) => {
    await setupApiMocks(page);
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/org-spider.html`);

    await expect(page.locator('#cy')).toBeVisible();
    await expect(page.locator('.graph-container')).toBeVisible();
  });
});

// =========================================================================
// Logout
// =========================================================================
test.describe('Org Spider - Logout', () => {
  test('logout clears auth and redirects to login', async ({ page }) => {
    await setupApiMocks(page);
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/org-spider.html`);

    await page.locator('#logout-btn').click();

    await expect(page).toHaveURL(/login/);
    const agent = await page.evaluate(() => localStorage.getItem('bbb_agent'));
    expect(agent).toBeNull();
  });
});
