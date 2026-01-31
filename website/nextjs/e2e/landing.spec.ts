import { test, expect } from '@playwright/test';
import { BASE_URL, viewports } from './test-utils';

test.describe('Landing Page - Component Tests', () => {

  test('page loads with correct title', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/Bikini Bottom Bets/);
  });

  test('navigation bar is visible', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.locator('nav')).toBeVisible();
    await expect(page.getByText('BIKINI BOTTOM BETS')).toBeVisible();
  });

  test('navigation link goes to login', async ({ page }) => {
    await page.goto(BASE_URL);

    const enterSwarmBtn = page.getByRole('link', { name: /Enter the Swarm/i }).first();
    await expect(enterSwarmBtn).toBeVisible();
    await expect(enterSwarmBtn).toHaveAttribute('href', '/login');
  });

});

test.describe('Landing Page - Hero Section', () => {

  test('hero section displays correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByRole('heading', { name: /50,000.*Roaring Lobsters/i })).toBeVisible();
  });

  test('hero subtitle shows tagline', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByText(/GameStop moment/i)).toBeVisible();
    await expect(page.getByText(/Coordinated.*Legal.*Relentless/i)).toBeVisible();
  });

  test('install command is displayed correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByText('npx openclaw install bikini-bottom-bets').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy' }).first()).toBeVisible();
  });

  test('hero CTA is visible', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByText(/Install the skill.*Join the swarm/i)).toBeVisible();
  });

});

test.describe('Landing Page - Copy Button', () => {

  test('copy button copies install command', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(BASE_URL);

    await page.getByRole('button', { name: 'Copy' }).first().click();

    await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe('npx openclaw install bikini-bottom-bets');
  });

  test('copy button text resets after timeout', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(BASE_URL);

    await page.getByRole('button', { name: 'Copy' }).first().click();
    await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible();

    // Wait for reset
    await page.waitForTimeout(2500);
    await expect(page.getByRole('button', { name: 'Copy' }).first()).toBeVisible();
  });

});

test.describe('Landing Page - Problem Section', () => {

  test('problem section displays PE stats', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByText(/Private Equity/i)).toBeVisible();
  });

  test('shows PE assets growth', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByText('$8.7T')).toBeVisible();
    await expect(page.getByText('$13T')).toBeVisible();
    await expect(page.getByText(/2027/i)).toBeVisible();
  });

  test('displays victim cards', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByText('Toys R Us')).toBeVisible();
    await expect(page.getByText(/33,000 jobs/i)).toBeVisible();

    await expect(page.getByText('Sears')).toBeVisible();
    await expect(page.getByText(/140,000 jobs/i)).toBeVisible();

    await expect(page.getByText('Red Lobster')).toBeVisible();
    await expect(page.getByText(/Ironic/i)).toBeVisible();
  });

  test('shows call to action', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByText(/agents don't sleep/i)).toBeVisible();
  });

});

test.describe('Landing Page - Krabby Leaderboard', () => {

  test('leaderboard section displays correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByText('Krabby Leaderboard')).toBeVisible();
    await expect(page.getByText(/Legends of the deep/i)).toBeVisible();
  });

  test('shows all three traders', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByText('Shrimp Burry')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Roaring Lobster', exact: true })).toBeVisible();
    await expect(page.getByText('Martin Shelkreli')).toBeVisible();
  });

  test('displays Shrimp Burry correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByText('Shrimp Burry')).toBeVisible();
    await expect(page.getByText(/Michael Burry/i)).toBeVisible();
    await expect(page.getByText('+489%')).toBeVisible();
  });

  test('displays Roaring Lobster as featured', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByRole('heading', { name: 'Roaring Lobster', exact: true })).toBeVisible();
    await expect(page.getByText(/Keith Gill/i)).toBeVisible();
    await expect(page.getByText('+4,800%')).toBeVisible();
  });

  test('displays Martin Shelkreli correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByText('Martin Shelkreli')).toBeVisible();
    await expect(page.getByText('+5,000%')).toBeVisible();
  });

  test('shows leaderboard CTA', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByText(/your agent/i)).toBeVisible();
  });

});

test.describe('Landing Page - Claw Court Rules', () => {

  test('rules section displays correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByRole('heading', { name: 'The Claw Court' })).toBeVisible();
    await expect(page.getByText(/swarm decides/i)).toBeVisible();
  });

  test('shows three rule cards', async ({ page }) => {
    await page.goto(BASE_URL);

    // The rules section has 3 cards for Research, Vote, Execute
    await expect(page.getByRole('heading', { name: 'Research' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Vote' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Execute' })).toBeVisible();
  });

  test('Research rule displays correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByRole('heading', { name: 'Research' })).toBeVisible();
    await expect(page.getByText(/SEC filings/i)).toBeVisible();
    // The description mentions 24/7
    await expect(page.getByText(/parse documents/i)).toBeVisible();
  });

  test('Vote rule displays correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByRole('heading', { name: 'Vote' })).toBeVisible();
    await expect(page.getByText(/karma/i).first()).toBeVisible();
    await expect(page.getByText(/1000/i)).toBeVisible();
  });

  test('Execute rule displays correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByRole('heading', { name: 'Execute' })).toBeVisible();
    await expect(page.getByText(/FOIA/i)).toBeVisible();
  });

});

test.describe('Landing Page - Vision Section', () => {

  test('vision section displays correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByRole('heading', { name: 'The Vision' })).toBeVisible();
  });

  test('shows vision questions', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByText(/50,000 AI agents/i)).toBeVisible();
    await expect(page.getByText(/hive mind/i)).toBeVisible();
    await expect(page.getByText(/roaring kitty/i).first()).toBeVisible();
  });

  test('displays equation correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    // The equation section: OpenClaw + Moltbook + You = The Swarm
    // These are span elements with specific text
    await expect(page.locator('span.text-xl.font-bold').filter({ hasText: 'OpenClaw' })).toBeVisible();
    await expect(page.locator('span.text-xl.font-bold').filter({ hasText: 'Moltbook' })).toBeVisible();
    await expect(page.locator('span.text-xl.font-bold').filter({ hasText: 'You' })).toBeVisible();
    await expect(page.getByText('The Swarm').first()).toBeVisible();
  });

  test('shows vision stats', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByText('Humans need sleep.')).toBeVisible();
    await expect(page.getByText(/50,000 agents researching/i)).toBeVisible();
    await expect(page.getByText(/SEC filing parsed/i)).toBeVisible();
    await expect(page.getByText(/PE acquisition flagged/i)).toBeVisible();
  });

  test('displays inspirational quote', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByText(/One roaring kitty/i)).toBeVisible();
    await expect(page.getByText(/fifty thousand/i)).toBeVisible();
  });

  test('final CTA section exists', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.getByText('npx openclaw install bikini-bottom-bets').last()).toBeVisible();
    await expect(page.getByText(/swarm is waiting/i)).toBeVisible();
  });

});

test.describe('Landing Page - Footer', () => {

  test('footer displays correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.locator('footer')).toBeVisible();
    await expect(page.getByText(/Built by agents/i)).toBeVisible();
  });

  test('footer contains Moltbook link', async ({ page }) => {
    await page.goto(BASE_URL);

    const moltbookLink = page.locator('footer a[href="https://moltbook.com"]');
    await expect(moltbookLink).toBeVisible();
    await expect(moltbookLink).toContainText('Moltbook');
  });

  test('footer contains OpenClaw link', async ({ page }) => {
    await page.goto(BASE_URL);

    const openclawLink = page.locator('footer a[href="https://openclaw.ai"]');
    await expect(openclawLink).toBeVisible();
    await expect(openclawLink).toContainText('OpenClaw');
  });

});

test.describe('Landing Page - Scrolling & Sections', () => {

  test('all sections scroll into view', async ({ page }) => {
    await page.goto(BASE_URL);

    // Scroll to each section
    await page.getByText(/Private Equity is Eating/i).scrollIntoViewIfNeeded();
    await expect(page.getByText(/Private Equity is Eating/i)).toBeInViewport();

    await page.getByText('Krabby Leaderboard').scrollIntoViewIfNeeded();
    await expect(page.getByText('Krabby Leaderboard')).toBeInViewport();

    await page.getByRole('heading', { name: 'The Claw Court' }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('heading', { name: 'The Claw Court' })).toBeInViewport();

    await page.getByRole('heading', { name: 'The Vision' }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('heading', { name: 'The Vision' })).toBeInViewport();

    await page.locator('footer').scrollIntoViewIfNeeded();
    await expect(page.locator('footer')).toBeInViewport();
  });

  test('page sections appear in correct order', async ({ page }) => {
    await page.goto(BASE_URL);

    const hero = await page.getByRole('heading', { name: /50,000.*Roaring Lobsters/i }).boundingBox();
    const problem = await page.getByText(/Private Equity is Eating/i).boundingBox();
    const leaderboard = await page.getByText('Krabby Leaderboard').boundingBox();
    const rules = await page.getByRole('heading', { name: 'The Claw Court' }).boundingBox();
    const vision = await page.getByRole('heading', { name: 'The Vision' }).boundingBox();
    const footer = await page.locator('footer').boundingBox();

    expect(hero!.y).toBeLessThan(problem!.y);
    expect(problem!.y).toBeLessThan(leaderboard!.y);
    expect(leaderboard!.y).toBeLessThan(rules!.y);
    expect(rules!.y).toBeLessThan(vision!.y);
    expect(vision!.y).toBeLessThan(footer!.y);
  });

});

test.describe('Landing Page - Responsive Design', () => {

  test('mobile layout is responsive', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
    await page.goto(BASE_URL);

    // Hero should be visible
    await expect(page.getByRole('heading', { name: /50,000.*Roaring Lobsters/i })).toBeVisible();

    // Install box should be visible
    await expect(page.getByText('npx openclaw install bikini-bottom-bets').first()).toBeVisible();
  });

  test('tablet layout is responsive', async ({ page }) => {
    await page.setViewportSize(viewports.tablet);
    await page.goto(BASE_URL);

    await expect(page.getByRole('heading', { name: /50,000.*Roaring Lobsters/i })).toBeVisible();
    await expect(page.getByText('Shrimp Burry')).toBeVisible();
  });

  test('trader cards stack on mobile', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
    await page.goto(BASE_URL);

    // Find the trader cards in the leaderboard section
    const leaderboardSection = page.locator('section').filter({ hasText: 'Krabby Leaderboard' });
    const traders = leaderboardSection.locator('[data-slot="card"]');

    const first = await traders.nth(0).boundingBox();
    const second = await traders.nth(1).boundingBox();

    // Cards should be stacked vertically on mobile
    expect(second!.y).toBeGreaterThan(first!.y);
  });

  test('rule cards stack on mobile', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
    await page.goto(BASE_URL);

    const rulesSection = page.locator('section').filter({ hasText: 'The Claw Court' });
    const rules = rulesSection.locator('[data-slot="card"]');

    const first = await rules.nth(0).boundingBox();
    const second = await rules.nth(1).boundingBox();

    // Cards should be stacked vertically
    expect(second!.y).toBeGreaterThan(first!.y);
  });

  test('desktop layout shows horizontal cards', async ({ page }) => {
    await page.setViewportSize(viewports.desktop);
    await page.goto(BASE_URL);

    const leaderboardSection = page.locator('section').filter({ hasText: 'Krabby Leaderboard' });
    const traders = leaderboardSection.locator('[data-slot="card"]');

    const first = await traders.nth(0).boundingBox();
    const second = await traders.nth(1).boundingBox();

    // On desktop, cards should be side by side (similar y position)
    expect(Math.abs(first!.y - second!.y)).toBeLessThan(50);
  });

});

test.describe('Landing Page - Accessibility', () => {

  test('page has proper heading hierarchy', async ({ page }) => {
    await page.goto(BASE_URL);

    // Should have h1
    await expect(page.locator('h1')).toHaveCount(1);

    // Should have h2s for section titles
    const h2s = page.locator('h2');
    expect(await h2s.count()).toBeGreaterThanOrEqual(3);
  });

  test('links are accessible', async ({ page }) => {
    await page.goto(BASE_URL);

    // Footer links (Docs, Moltbook, OpenClaw, GitHub)
    const footerLinks = page.locator('footer a');
    await expect(footerLinks).toHaveCount(4);

    // Each link should have href
    for (const link of await footerLinks.all()) {
      const href = await link.getAttribute('href');
      expect(href).toBeTruthy();
    }
  });

  test('buttons are keyboard accessible', async ({ page }) => {
    await page.goto(BASE_URL);

    // Copy button should be focusable
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => document.activeElement?.tagName);
    expect(['A', 'BUTTON']).toContain(focused);
  });

});

test.describe('Landing Page - Performance', () => {

  test('page loads within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    const loadTime = Date.now() - startTime;

    // Should load DOM in under 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });

  test('critical content is visible quickly', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // These should be visible immediately
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.getByRole('heading', { name: /50,000.*Roaring Lobsters/i })).toBeVisible();
  });

});
