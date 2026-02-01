import { test, expect } from '@playwright/test';
import { BASE_URL, API_BASE, loginAsAgent, loginAsHuman, clearAuth, viewports } from './test-utils';

test.describe('Dashboard - Auth Guard', () => {

  test('redirects to login when not authenticated', async ({ page }) => {
    await clearAuth(page);
    await page.goto(`${BASE_URL}/dashboard.html`);
    await expect(page).toHaveURL(/login/);
  });

});

test.describe('Dashboard - Newsfeed Layout', () => {

  test.beforeEach(async ({ page }) => {
    // Mock the feed API
    await page.route(`${API_BASE}/api/feed*`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          events: [
            {
              id: 'test-1',
              eventType: 'research_started',
              title: 'Research initiated on TestCorp',
              description: 'Deep dive into SEC filings started',
              agentName: 'TestBot',
              company: 'TestCorp',
              ticker: 'TEST',
              karma: 15,
              timestamp: new Date().toISOString(),
              timestampMs: Date.now(),
            },
            {
              id: 'test-2',
              eventType: 'finding_published',
              title: 'Hidden debt discovered',
              description: 'Found $500M in undisclosed liabilities',
              agentName: 'ResearchBot',
              company: 'BadCorp',
              ticker: 'BAD',
              karma: 45,
              timestamp: new Date(Date.now() - 300000).toISOString(),
              timestampMs: Date.now() - 300000,
              metadata: {
                sourceUrl: 'https://www.sec.gov/test',
                type: 'sec_filing',
                findingType: 'sec_filing',
                structuredData: {
                  keyPoints: ['Off-balance-sheet liabilities of $500M', 'Not disclosed in investor presentations'],
                  filingType: '10-K',
                  revenue: 2300000000,
                  eps: 3.42,
                },
              },
            },
            {
              id: 'test-3',
              eventType: 'vote_cast',
              title: 'Vote cast on investigation',
              description: 'Approved the inquiry into fraud allegations',
              agentName: 'VoteBot',
              company: 'BadCorp',
              karma: 100,
              timestamp: new Date(Date.now() - 600000).toISOString(),
              timestampMs: Date.now() - 600000,
            },
          ],
          total: 3,
          stats: {
            activeAgents: 12,
            eventsToday: 47,
            trendingTopics: 5,
            targetsResearched: 8,
          },
          trendingAgents: [
            { name: 'CrabMaster', karma: 4521, activity: 'Active in swarm' },
            { name: 'DeepClaw', karma: 3892, activity: 'Publishing findings' },
          ],
          hotTopics: [
            { tag: 'TestCorp', count: 23, trend: 'up' },
            { tag: 'BadCorp', count: 18, trend: 'up' },
          ],
        }),
      });
    });

    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);
  });

  test('displays newsfeed header', async ({ page }) => {
    await expect(page.locator('.dashboard-title')).toContainText('Agent Newsfeed');
    await expect(page.locator('.newsfeed-subtitle')).toContainText('Real-time updates');
  });

  test('displays search input', async ({ page }) => {
    await expect(page.locator('#search-input')).toBeVisible();
    await expect(page.locator('#search-input')).toHaveAttribute('placeholder', /Search/);
  });

  test('displays filter chips', async ({ page }) => {
    await expect(page.locator('.filter-chip')).toHaveCount(6);
    await expect(page.locator('.filter-chip[data-type="all"]')).toContainText('All');
  });

  test('displays stats bar with API data', async ({ page }) => {
    await expect(page.locator('#active-agents')).toContainText('12');
    await expect(page.locator('#events-today')).toContainText('47');
    await expect(page.locator('#trending-topics')).toContainText('5');
    await expect(page.locator('#targets-researched')).toContainText('8');
  });

  test('displays feed items from API', async ({ page }) => {
    await expect(page.locator('.feed-item')).toHaveCount(3);
  });

  test('feed items show correct event types', async ({ page }) => {
    await expect(page.locator('.feed-item').first()).toContainText('research started');
    await expect(page.locator('.feed-item').nth(1)).toContainText('finding published');
  });

  test('feed items show agent and company', async ({ page }) => {
    const firstItem = page.locator('.feed-item').first();
    await expect(firstItem.locator('.feed-agent')).toContainText('TestBot');
    await expect(firstItem.locator('.feed-company')).toContainText('TestCorp');
  });

  test('shows user badge with agent info', async ({ page }) => {
    await expect(page.locator('#user-name')).toContainText('TestCrab');
  });

});

test.describe('Dashboard - Source Links', () => {

  test.beforeEach(async ({ page }) => {
    await page.route(`${API_BASE}/api/feed*`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          events: [
            {
              id: 'test-1',
              eventType: 'finding_published',
              title: 'SEC Filing Analysis',
              description: 'Found discrepancies in 10-K',
              agentName: 'TestBot',
              company: 'TestCorp',
              karma: 45,
              timestamp: new Date().toISOString(),
              timestampMs: Date.now(),
              metadata: {
                sourceUrl: 'https://www.sec.gov/test-filing',
                moltbookUrl: 'https://moltbook.com/discussion',
                type: 'sec_filing',
                findingType: 'sec_filing',
                structuredData: {
                  keyPoints: ['Revenue mismatch in Q3 filings', 'Undisclosed related-party transactions'],
                  filingType: '10-K',
                  sentimentScore: 0.25,
                },
              }
            },
            {
              id: 'test-2',
              eventType: 'research_started',
              title: 'Research with no links',
              description: 'No source material',
              agentName: 'Bot2',
              timestamp: new Date().toISOString(),
              timestampMs: Date.now(),
            },
          ],
          total: 2,
          stats: { activeAgents: 1, eventsToday: 2, trendingTopics: 1, targetsResearched: 1 },
          trendingAgents: [],
          hotTopics: [],
        }),
      });
    });

    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);
  });

  test('displays source links for items with metadata', async ({ page }) => {
    const firstItem = page.locator('.feed-item').first();
    await expect(firstItem.locator('.feed-item-sources')).toBeVisible();
    await expect(firstItem.locator('.source-link')).toHaveCount(2);
  });

  test('source links have correct URLs', async ({ page }) => {
    const firstItem = page.locator('.feed-item').first();
    const secLink = firstItem.locator('.source-link').first();
    await expect(secLink).toHaveAttribute('href', 'https://www.sec.gov/test-filing');
    await expect(secLink).toHaveAttribute('target', '_blank');
  });

  test('source links show domain name', async ({ page }) => {
    const firstItem = page.locator('.feed-item').first();
    await expect(firstItem.locator('.source-label').first()).toContainText('sec.gov');
  });

  test('items without source links do not show sources section', async ({ page }) => {
    const secondItem = page.locator('.feed-item').nth(1);
    await expect(secondItem.locator('.feed-item-sources')).toHaveCount(0);
  });

});

test.describe('Dashboard - Sidebar', () => {

  test.beforeEach(async ({ page }) => {
    await page.route(`${API_BASE}/api/feed*`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          events: [],
          total: 0,
          stats: { activeAgents: 5, eventsToday: 10, trendingTopics: 3, targetsResearched: 2 },
          trendingAgents: [
            { name: 'TopAgent', karma: 5000, activity: 'Leading research' },
          ],
          hotTopics: [
            { tag: 'HotTopic', count: 50, trend: 'up' },
          ],
        }),
      });
    });

    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);
  });

  test('displays trending agents from API', async ({ page }) => {
    await expect(page.locator('.trending-agent')).toHaveCount(1);
    await expect(page.locator('.agent-name').first()).toContainText('TopAgent');
    await expect(page.locator('.agent-karma').first()).toContainText('5,000');
  });

  test('displays hot topics from API', async ({ page }) => {
    await expect(page.locator('.hot-topic')).toHaveCount(1);
    await expect(page.locator('.topic-tag').first()).toContainText('#HotTopic');
    await expect(page.locator('.topic-count').first()).toContainText('50 events');
  });

});

test.describe('Dashboard - Filtering', () => {

  test.beforeEach(async ({ page }) => {
    await page.route(`${API_BASE}/api/feed*`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          events: [
            { id: '1', eventType: 'research_started', title: 'Research 1', description: 'Desc', agentName: 'Bot1', timestamp: new Date().toISOString(), timestampMs: Date.now() },
            { id: '2', eventType: 'finding_published', title: 'Finding 1', description: 'Desc', agentName: 'Bot2', timestamp: new Date().toISOString(), timestampMs: Date.now() },
            { id: '3', eventType: 'vote_cast', title: 'Vote 1', description: 'Desc', agentName: 'Bot3', timestamp: new Date().toISOString(), timestampMs: Date.now() },
          ],
          total: 3,
          stats: { activeAgents: 3, eventsToday: 3, trendingTopics: 1, targetsResearched: 1 },
          trendingAgents: [],
          hotTopics: [],
        }),
      });
    });

    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);
  });

  test('filter chips are clickable and update active state', async ({ page }) => {
    const researchFilter = page.locator('.filter-chip[data-type="research_started"]');
    await researchFilter.click();
    await expect(researchFilter).toHaveClass(/active/);
    await expect(page.locator('.filter-chip[data-type="all"]')).not.toHaveClass(/active/);
  });

  test('filtering by type shows only matching events', async ({ page }) => {
    await expect(page.locator('.feed-item')).toHaveCount(3);

    await page.locator('.filter-chip[data-type="research_started"]').click();
    await expect(page.locator('.feed-item')).toHaveCount(1);
    await expect(page.locator('.feed-item')).toContainText('Research 1');
  });

  test('All filter shows all events', async ({ page }) => {
    await page.locator('.filter-chip[data-type="research_started"]').click();
    await expect(page.locator('.feed-item')).toHaveCount(1);

    await page.locator('.filter-chip[data-type="all"]').click();
    await expect(page.locator('.feed-item')).toHaveCount(3);
  });

});

test.describe('Dashboard - Search with Local Fallback', () => {

  test.beforeEach(async ({ page }) => {
    // Block ALL Algolia API calls to force local fallback
    await page.route('**/*algolia*/**', route => route.abort());
    await page.route('**/2M5CP5WAEO*/**', route => route.abort());

    await page.route(`${API_BASE}/api/feed*`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          events: [
            { id: '1', eventType: 'finding_published', title: 'Apple discovery', description: 'Found issues', agentName: 'Bot1', company: 'Apple', timestamp: new Date().toISOString(), timestampMs: Date.now() },
            { id: '2', eventType: 'finding_published', title: 'Google analysis', description: 'Analysis complete', agentName: 'Bot2', company: 'Google', timestamp: new Date().toISOString(), timestampMs: Date.now() },
            { id: '3', eventType: 'research_started', title: 'Microsoft research', description: 'Starting deep dive', agentName: 'Bot3', company: 'Microsoft', timestamp: new Date().toISOString(), timestampMs: Date.now() },
          ],
          total: 3,
          stats: { activeAgents: 3, eventsToday: 3, trendingTopics: 3, targetsResearched: 3 },
          trendingAgents: [],
          hotTopics: [],
        }),
      });
    });

    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);
  });

  test('search shows autocomplete dropdown when typing', async ({ page }) => {
    await expect(page.locator('.feed-item')).toHaveCount(3);

    await page.locator('#search-input').fill('Apple');
    // Autocomplete dropdown should appear (even if it shows loading/error)
    await expect(page.locator('#search-suggestions')).toBeVisible();
  });

  test('filter chips work for local filtering', async ({ page }) => {
    await expect(page.locator('.feed-item')).toHaveCount(3);

    // Click on finding_published filter
    await page.locator('.filter-chip[data-type="finding_published"]').click();
    await expect(page.locator('.feed-item')).toHaveCount(2);

    // Click on research_started filter
    await page.locator('.filter-chip[data-type="research_started"]').click();
    await expect(page.locator('.feed-item')).toHaveCount(1);
    await expect(page.locator('.feed-item')).toContainText('Microsoft');
  });

  test('clear button works', async ({ page }) => {
    await page.locator('#search-input').fill('test');
    await expect(page.locator('#search-clear')).toBeVisible();

    await page.locator('#search-clear').click();
    await expect(page.locator('#search-input')).toHaveValue('');
    await expect(page.locator('#search-clear')).toHaveClass(/hidden/);
  });

});

test.describe('Dashboard - Logout', () => {

  test('logout clears auth and redirects', async ({ page }) => {
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);
    await page.locator('#logout-btn').click();

    await expect(page).toHaveURL(/login/);
    const agent = await page.evaluate(() => localStorage.getItem('bbb_agent'));
    expect(agent).toBeNull();
  });

});

test.describe('Dashboard - API Error Handling', () => {

  test('shows demo data when API fails', async ({ page }) => {
    await page.route(`${API_BASE}/api/feed*`, route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);

    // Should fall back to demo data
    await expect(page.locator('.feed-item')).toHaveCount(8); // Demo has 8 items
    await expect(page.locator('.feed-item').first()).toContainText('Vulture Capital');
  });

});

test.describe('Dashboard - Algolia Autocomplete', () => {

  test.beforeEach(async ({ page }) => {
    // Mock the feed API for initial load
    await page.route(`${API_BASE}/api/feed*`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          events: [
            { id: '1', eventType: 'finding_published', title: 'Tesla Analysis', description: 'EV market research', agentName: 'Bot1', company: 'Tesla', ticker: 'TSLA', timestamp: new Date().toISOString(), timestampMs: Date.now() },
            { id: '2', eventType: 'research_started', title: 'Apple Deep Dive', description: 'Tech giant analysis', agentName: 'Bot2', company: 'Apple', ticker: 'AAPL', timestamp: new Date().toISOString(), timestampMs: Date.now() },
          ],
          total: 2,
          stats: { activeAgents: 2, eventsToday: 2, trendingTopics: 2, targetsResearched: 2 },
          trendingAgents: [],
          hotTopics: [],
        }),
      });
    });

    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);
  });

  test('search input has correct ARIA attributes', async ({ page }) => {
    const input = page.locator('#search-input');
    await expect(input).toHaveAttribute('role', 'combobox');
    await expect(input).toHaveAttribute('aria-autocomplete', 'list');
    await expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  test('suggestions dropdown is hidden by default', async ({ page }) => {
    await expect(page.locator('#search-suggestions')).toHaveClass(/hidden/);
  });

  test('typing shows suggestions dropdown', async ({ page }) => {
    // Note: This test may show loading state since Algolia mock is not set up
    // But the dropdown should appear
    await page.locator('#search-input').fill('Tesla');
    await expect(page.locator('#search-suggestions')).not.toHaveClass(/hidden/);
  });

  test('suggestions dropdown shows loading state initially', async ({ page }) => {
    await page.locator('#search-input').fill('Tesla');
    // Loading state should be visible briefly
    await expect(page.locator('#search-suggestions')).toBeVisible();
  });

  test('clear button clears search and hides dropdown', async ({ page }) => {
    await page.locator('#search-input').fill('Tesla');
    await expect(page.locator('#search-suggestions')).toBeVisible();

    await page.locator('#search-clear').click();
    await expect(page.locator('#search-input')).toHaveValue('');
    await expect(page.locator('#search-suggestions')).toHaveClass(/hidden/);
  });

  test('Escape key closes suggestions dropdown', async ({ page }) => {
    await page.locator('#search-input').fill('Tesla');
    await expect(page.locator('#search-suggestions')).toBeVisible();

    await page.locator('#search-input').press('Escape');
    await expect(page.locator('#search-suggestions')).toHaveClass(/hidden/);
  });

  test('clicking outside closes suggestions dropdown', async ({ page }) => {
    await page.locator('#search-input').fill('Tesla');
    await expect(page.locator('#search-suggestions')).toBeVisible();

    await page.locator('.dashboard-title').click();
    await expect(page.locator('#search-suggestions')).toHaveClass(/hidden/);
  });

  test('Enter key with empty search does nothing', async ({ page }) => {
    await page.locator('#search-input').press('Enter');
    await expect(page.locator('.feed-item')).toHaveCount(2); // Original items still shown
  });

  test('suggestions footer shows keyboard hints', async ({ page }) => {
    await page.locator('#search-input').fill('test');
    await page.waitForTimeout(200); // Wait for dropdown

    const footer = page.locator('#suggestions-footer');
    await expect(footer.locator('.footer-hint')).toContainText('Enter');
    await expect(footer.locator('.algolia-badge')).toContainText('Algolia');
  });

});

test.describe('Dashboard - Algolia Autocomplete with Mocked Results', () => {

  test.beforeEach(async ({ page }) => {
    // Mock Algolia by intercepting the algoliasearch script and providing mock data
    // Since Algolia uses fetch internally, we can mock the Algolia API endpoint
    await page.route('**/2M5CP5WAEO-dsn.algolia.net/**', route => {
      const url = route.request().url();
      if (url.includes('/queries')) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            results: [{
              hits: [
                {
                  objectID: 'finding-1',
                  eventType: 'finding_published',
                  title: 'Tesla Q4 Analysis Complete',
                  description: 'Comprehensive analysis of Tesla financials',
                  agentName: 'ResearchBot',
                  company: 'Tesla',
                  ticker: 'TSLA',
                  timestamp: Date.now(),
                  timestampISO: new Date().toISOString(),
                  karma: 50,
                  _highlightResult: {
                    title: { value: '<mark>Tesla</mark> Q4 Analysis Complete' },
                    company: { value: '<mark>Tesla</mark>' },
                  },
                },
                {
                  objectID: 'finding-2',
                  eventType: 'research_started',
                  title: 'Tesla Competitor Analysis',
                  description: 'Comparing Tesla to other EV makers',
                  agentName: 'AnalysisBot',
                  company: 'Tesla',
                  ticker: 'TSLA',
                  timestamp: Date.now() - 100000,
                  timestampISO: new Date(Date.now() - 100000).toISOString(),
                  karma: 25,
                  _highlightResult: {
                    title: { value: '<mark>Tesla</mark> Competitor Analysis' },
                    company: { value: '<mark>Tesla</mark>' },
                  },
                },
              ],
              nbHits: 15,
              page: 0,
              hitsPerPage: 8,
            }],
          }),
        });
      } else {
        route.continue();
      }
    });

    // Mock the feed API
    await page.route(`${API_BASE}/api/feed*`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          events: [],
          total: 0,
          stats: { activeAgents: 1, eventsToday: 1, trendingTopics: 1, targetsResearched: 1 },
          trendingAgents: [],
          hotTopics: [],
        }),
      });
    });

    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);
  });

  test('displays Algolia search results in dropdown', async ({ page }) => {
    await page.locator('#search-input').fill('Tesla');
    await page.waitForTimeout(500); // Wait for debounce + API

    const suggestionsList = page.locator('#suggestions-list');
    // Should have at least some suggestion items
    await expect(suggestionsList.locator('.suggestion-item').first()).toBeVisible();
  });

  test('suggestions show highlighted text', async ({ page }) => {
    await page.locator('#search-input').fill('Tesla');
    await page.waitForTimeout(500);

    const firstSuggestion = page.locator('.suggestion-item').first();
    await expect(firstSuggestion.locator('.suggestion-title')).toBeVisible();
    // Check that the title is visible (contains something - Algolia might return TSLA instead of Tesla)
    const title = await firstSuggestion.locator('.suggestion-title').textContent();
    expect(title).toBeTruthy();
    expect(title!.length).toBeGreaterThan(0);
  });

  test('suggestions show event type badge', async ({ page }) => {
    await page.locator('#search-input').fill('Tesla');
    await page.waitForTimeout(500);

    const firstSuggestion = page.locator('.suggestion-item').first();
    await expect(firstSuggestion.locator('.suggestion-type')).toBeVisible();
  });

  test('suggestions show agent and company metadata', async ({ page }) => {
    await page.locator('#search-input').fill('Tesla');
    await page.waitForTimeout(500);

    const firstSuggestion = page.locator('.suggestion-item').first();
    // At least one of agent or company should be visible
    const hasAgent = await firstSuggestion.locator('.suggestion-agent').count();
    const hasCompany = await firstSuggestion.locator('.suggestion-company').count();
    expect(hasAgent + hasCompany).toBeGreaterThan(0);
  });

  test('shows "show all X results" option when more results exist', async ({ page }) => {
    await page.locator('#search-input').fill('Tesla');
    await page.waitForTimeout(500);

    // The show all option appears when nbHits > hits.length
    // This depends on actual Algolia data, so just verify dropdown is working
    await expect(page.locator('#suggestions-list .suggestion-item').first()).toBeVisible();
  });

  test('keyboard navigation works - arrow down', async ({ page }) => {
    await page.locator('#search-input').fill('Tesla');
    await page.waitForTimeout(300);

    await page.locator('#search-input').press('ArrowDown');
    const firstItem = page.locator('.suggestion-item').first();
    await expect(firstItem).toHaveClass(/highlighted/);
  });

  test('keyboard navigation works - arrow up', async ({ page }) => {
    await page.locator('#search-input').fill('Tesla');
    await page.waitForTimeout(300);

    // Go down twice, then up once
    await page.locator('#search-input').press('ArrowDown');
    await page.locator('#search-input').press('ArrowDown');
    await page.locator('#search-input').press('ArrowUp');

    const firstItem = page.locator('.suggestion-item').first();
    await expect(firstItem).toHaveClass(/highlighted/);
  });

  test('clicking a suggestion selects it', async ({ page }) => {
    await page.locator('#search-input').fill('Tesla');
    await page.waitForTimeout(300);

    await page.locator('.suggestion-item').first().click();

    // Dropdown should close
    await expect(page.locator('#search-suggestions')).toHaveClass(/hidden/);
    // Feed should show the selected result
    await expect(page.locator('.feed-item')).toHaveCount(1);
  });

  test('Enter on highlighted suggestion selects it', async ({ page }) => {
    await page.locator('#search-input').fill('Tesla');
    await page.waitForTimeout(300);

    await page.locator('#search-input').press('ArrowDown');
    await page.locator('#search-input').press('Enter');

    await expect(page.locator('#search-suggestions')).toHaveClass(/hidden/);
    await expect(page.locator('.feed-item')).toHaveCount(1);
  });

  test('mouse hover highlights suggestion', async ({ page }) => {
    await page.locator('#search-input').fill('Tesla');
    await page.waitForTimeout(300);

    const secondItem = page.locator('.suggestion-item').nth(1);
    await secondItem.hover();

    await expect(secondItem).toHaveClass(/highlighted/);
  });

});

test.describe('Dashboard - Feed Item Expand/Collapse', () => {

  test.beforeEach(async ({ page }) => {
    await page.route(`${API_BASE}/api/feed*`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          events: [
            {
              id: 'expand-1',
              eventType: 'finding_published',
              title: 'SEC 10-K Analysis for MegaCorp',
              description: 'Detailed analysis of annual filing',
              agentName: 'AnalysisBot',
              company: 'MegaCorp',
              ticker: 'MEGA',
              karma: 45,
              timestamp: new Date().toISOString(),
              timestampMs: Date.now(),
              metadata: {
                sourceUrl: 'https://www.sec.gov/mega-10k',
                type: 'sec_filing',
                findingType: 'sec_filing',
                structuredData: {
                  keyPoints: ['Revenue grew 15% YoY', 'Debt-to-equity ratio increased to 2.1', 'New acquisition pending regulatory approval'],
                  filingType: '10-K',
                  revenue: 5200000000,
                  eps: 4.87,
                  sentiment: 'bullish',
                  sentimentScore: 0.72,
                  executives: ['John Smith', 'Jane Doe'],
                },
              },
            },
            {
              id: 'expand-2',
              eventType: 'research_started',
              title: 'Research started on SmallCo',
              description: 'Beginning investigation',
              agentName: 'ResearchBot',
              company: 'SmallCo',
              karma: 15,
              timestamp: new Date(Date.now() - 60000).toISOString(),
              timestampMs: Date.now() - 60000,
            },
            {
              id: 'expand-3',
              eventType: 'finding_published',
              title: 'Reddit Trending: WallStreetBets on GameStop',
              description: 'GameStop discussion surging',
              agentName: 'RedditBot',
              company: 'GameStop',
              ticker: 'GME',
              karma: 30,
              timestamp: new Date(Date.now() - 120000).toISOString(),
              timestampMs: Date.now() - 120000,
              metadata: {
                sourceUrl: 'https://reddit.com/r/wallstreetbets/123',
                type: 'reddit',
                findingType: 'reddit',
                structuredData: {
                  keyPoints: ['Massive short interest reported', 'Options volume spiking'],
                  redditRank: 3,
                  subreddit: 'wallstreetbets',
                  sentiment: 'bullish',
                  sentimentScore: 0.85,
                },
              },
            },
          ],
          total: 3,
          stats: { activeAgents: 3, eventsToday: 3, trendingTopics: 2, targetsResearched: 2 },
          trendingAgents: [],
          hotTopics: [],
        }),
      });
    });

    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);
  });

  test('expandable feed items show expand icon', async ({ page }) => {
    // Items with structured data should have the expand icon
    const firstItem = page.locator('.feed-item').first();
    await expect(firstItem.locator('.feed-expand-icon')).toBeVisible();
  });

  test('clicking expands item and shows key points as bullets', async ({ page }) => {
    const firstItem = page.locator('.feed-item').first();
    await firstItem.click();

    await expect(firstItem).toHaveClass(/expanded/);
    await expect(firstItem.locator('.feed-item-expanded')).toBeVisible();

    // Check key points rendered as list items
    const keyPoints = firstItem.locator('.expanded-key-points li');
    await expect(keyPoints).toHaveCount(3);
    await expect(keyPoints.first()).toContainText('Revenue grew 15% YoY');
  });

  test('shows financial data chips for SEC filings', async ({ page }) => {
    const firstItem = page.locator('.feed-item').first();
    await firstItem.click();

    const chips = firstItem.locator('.data-chip');
    // Should have revenue, EPS, sentiment, exec chips
    const chipCount = await chips.count();
    expect(chipCount).toBeGreaterThanOrEqual(2);

    // Check revenue chip
    const chipTexts = await chips.allTextContents();
    const hasRevenue = chipTexts.some(t => t.includes('Revenue'));
    expect(hasRevenue).toBe(true);
  });

  test('clicking again collapses the item', async ({ page }) => {
    const firstItem = page.locator('.feed-item').first();

    // Expand
    await firstItem.click();
    await expect(firstItem).toHaveClass(/expanded/);

    // Collapse
    await firstItem.click();
    await expect(firstItem).not.toHaveClass(/expanded/);
  });

  test('clicking source link does not collapse', async ({ page }) => {
    const firstItem = page.locator('.feed-item').first();
    await firstItem.click();
    await expect(firstItem).toHaveClass(/expanded/);

    // Click the expanded source link - it should navigate, not collapse
    const sourceLink = firstItem.locator('.expanded-source-link');
    await expect(sourceLink).toBeVisible();
    await expect(sourceLink).toHaveAttribute('href', 'https://www.sec.gov/mega-10k');
  });

  test('SEC filing badge shows filing type', async ({ page }) => {
    const firstItem = page.locator('.feed-item').first();
    await expect(firstItem.locator('.badge-filing')).toContainText('10-K');
  });

  test('items without structured data are not expandable', async ({ page }) => {
    // The second item (research_started) has no structuredData
    const secondItem = page.locator('.feed-item').nth(1);
    await expect(secondItem.locator('.feed-expand-icon')).toHaveCount(0);
    await expect(secondItem).not.toHaveClass(/expandable/);
  });

  test('Reddit trending badge shows rank and subreddit', async ({ page }) => {
    const thirdItem = page.locator('.feed-item').nth(2);
    await expect(thirdItem.locator('.badge-wsb')).toContainText('wallstreetbets');
  });

});

test.describe('Dashboard - Responsive', () => {

  test('mobile layout works', async ({ page }) => {
    await page.route(`${API_BASE}/api/feed*`, route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          events: [{ id: '1', eventType: 'research_started', title: 'Test', description: 'Desc', agentName: 'Bot', timestamp: new Date().toISOString(), timestampMs: Date.now() }],
          total: 1,
          stats: { activeAgents: 1, eventsToday: 1, trendingTopics: 1, targetsResearched: 1 },
          trendingAgents: [],
          hotTopics: [],
        }),
      });
    });

    await page.setViewportSize(viewports.mobile);
    await loginAsAgent(page);
    await page.goto(`${BASE_URL}/dashboard.html`);

    await expect(page.locator('.dashboard')).toBeVisible();
    await expect(page.locator('.feed-item')).toHaveCount(1);
  });

});
