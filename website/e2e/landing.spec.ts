import { test, expect } from '@playwright/test';
import { BASE_URL, viewports } from './test-utils';

test.describe('Landing Page - Component Tests', () => {

  test('page loads with correct title', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/Bikini Bottom Bets/);
  });

  test('navigation bar is visible', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.locator('.nav')).toBeVisible();
    await expect(page.locator('.nav-brand')).toContainText('BIKINI BOTTOM BETS');
    await expect(page.locator('.nav-brand .lobster')).toContainText('🦞');
  });

  test('navigation link goes to login', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.locator('.nav-link')).toContainText('Enter the Swarm');
    await expect(page.locator('.nav-link')).toHaveAttribute('href', '/login.html');
  });

});

test.describe('Landing Page - Hero Section', () => {

  test('hero section displays correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.locator('.hero')).toBeVisible();
    await expect(page.locator('.hero-title')).toContainText('50,000');
    await expect(page.locator('.hero-title')).toContainText('Roaring Lobsters');
  });

  test('hero subtitle shows tagline', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.locator('.hero-subtitle')).toContainText('GameStop moment');
    await expect(page.locator('.hero-tagline')).toContainText('Coordinated. Legal. Relentless.');
  });

  test('install command is displayed correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.locator('#install-cmd')).toContainText('npx openclaw install bikini-bottom-bets');
    await expect(page.locator('.copy-btn')).toBeVisible();
  });

  test('hero CTA is visible', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.locator('.hero-cta')).toContainText('Install the skill');
    await expect(page.locator('.hero-cta')).toContainText('Join the swarm');
  });

});

test.describe('Landing Page - Copy Button', () => {

  test('copy button copies install command', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(BASE_URL);

    await page.locator('.copy-btn').first().click();

    await expect(page.locator('#copy-text')).toContainText('Copied!');

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe('npx openclaw install bikini-bottom-bets');
  });

  test('copy button text resets after timeout', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(BASE_URL);

    await page.locator('.copy-btn').first().click();
    await expect(page.locator('#copy-text')).toContainText('Copied!');

    // Wait for reset
    await page.waitForTimeout(2500);
    await expect(page.locator('#copy-text')).toContainText('Copy');
  });

});

test.describe('Landing Page - Problem Section', () => {

  test('problem section displays PE stats', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.locator('.problem')).toBeVisible();
    await expect(page.locator('.problem .section-title')).toContainText('Private Equity');
  });

  test('shows PE assets growth', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.locator('.problem-stats')).toContainText('$8.7T');
    await expect(page.locator('.problem-stats')).toContainText('$13T');
    await expect(page.locator('.stat-caption')).toContainText('2027');
  });

  test('displays victim cards', async ({ page }) => {
    await page.goto(BASE_URL);

    const victimCards = page.locator('.victim-card');
    await expect(victimCards).toHaveCount(3);

    await expect(victimCards.nth(0)).toContainText('Toys R Us');
    await expect(victimCards.nth(0)).toContainText('33,000 jobs');

    await expect(victimCards.nth(1)).toContainText('Sears');
    await expect(victimCards.nth(1)).toContainText('140,000 jobs');

    await expect(victimCards.nth(2)).toContainText('Red Lobster');
    await expect(victimCards.nth(2)).toContainText('Ironic');
  });

  test('shows call to action', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.locator('.problem-bottom')).toContainText('agents don\'t sleep');
  });

});

test.describe('Landing Page - Krabby Leaderboard', () => {

  test('leaderboard section displays correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.locator('.leaderboard')).toBeVisible();
    await expect(page.locator('.leaderboard .section-title')).toContainText('Krabby Leaderboard');
    await expect(page.locator('.leaderboard .section-subtitle')).toContainText('Legends of the deep');
  });

  test('shows all three traders', async ({ page }) => {
    await page.goto(BASE_URL);

    const traderCards = page.locator('.trader-card');
    await expect(traderCards).toHaveCount(3);
  });

  test('displays Shrimp Burry correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    const burryCard = page.locator('.trader-card').nth(0);
    await expect(burryCard.locator('.trader-rank')).toContainText('#1');
    await expect(burryCard.locator('.trader-avatar')).toContainText('🦐');
    await expect(burryCard.locator('.trader-name')).toContainText('Shrimp Burry');
    await expect(burryCard.locator('.trader-real')).toContainText('Michael Burry');
    await expect(burryCard.locator('.stat-value')).toContainText('+489%');
  });

  test('displays Roaring Lobster as featured', async ({ page }) => {
    await page.goto(BASE_URL);

    const lobsterCard = page.locator('.trader-card.featured');
    await expect(lobsterCard).toBeVisible();
    await expect(lobsterCard.locator('.trader-rank')).toContainText('#2');
    await expect(lobsterCard.locator('.trader-avatar')).toContainText('🦞');
    await expect(lobsterCard.locator('.trader-name')).toContainText('Roaring Lobster');
    await expect(lobsterCard.locator('.trader-real')).toContainText('Keith Gill');
    await expect(lobsterCard.locator('.stat-value')).toContainText('+4,800%');
  });

  test('displays Martin Shelkreli correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    const shkreliCard = page.locator('.trader-card').nth(2);
    await expect(shkreliCard.locator('.trader-rank')).toContainText('#3');
    await expect(shkreliCard.locator('.trader-avatar')).toContainText('🦀');
    await expect(shkreliCard.locator('.trader-name')).toContainText('Martin Shelkreli');
    await expect(shkreliCard.locator('.stat-value')).toContainText('+5,000%');
  });

  test('all stats show green gains', async ({ page }) => {
    await page.goto(BASE_URL);

    const gainStats = page.locator('.stat-value.gain');
    await expect(gainStats).toHaveCount(3);

    const values = await gainStats.allTextContents();
    expect(values[0]).toBe('+489%');
    expect(values[1]).toBe('+4,800%');
    expect(values[2]).toBe('+5,000%');
  });

  test('shows leaderboard CTA', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.locator('.leaderboard-cta')).toContainText('your agent');
  });

});

test.describe('Landing Page - Claw Court Rules', () => {

  test('rules section displays correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.locator('.rules')).toBeVisible();
    await expect(page.locator('.rules .section-title')).toContainText('Claw Court');
    await expect(page.locator('.rules .section-subtitle')).toContainText('swarm decides');
  });

  test('shows three rule cards', async ({ page }) => {
    await page.goto(BASE_URL);

    const ruleCards = page.locator('.rule-card');
    await expect(ruleCards).toHaveCount(3);
  });

  test('Research rule displays correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    const researchCard = page.locator('.rule-card').nth(0);
    await expect(researchCard.locator('.rule-icon')).toContainText('🔍');
    await expect(researchCard.locator('h3')).toContainText('Research');
    await expect(researchCard.locator('p')).toContainText('SEC filings');
    await expect(researchCard.locator('p')).toContainText('24/7');
  });

  test('Vote rule displays correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    const voteCard = page.locator('.rule-card').nth(1);
    await expect(voteCard.locator('.rule-icon')).toContainText('🗳️');
    await expect(voteCard.locator('h3')).toContainText('Vote');
    await expect(voteCard.locator('p')).toContainText('karma');
    await expect(voteCard.locator('p')).toContainText('1000');
  });

  test('Execute rule displays correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    const executeCard = page.locator('.rule-card').nth(2);
    await expect(executeCard.locator('.rule-icon')).toContainText('📧');
    await expect(executeCard.locator('h3')).toContainText('Execute');
    await expect(executeCard.locator('p')).toContainText('FOIA');
  });

});

test.describe('Landing Page - Vision Section', () => {

  test('vision section displays correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.locator('.vision')).toBeVisible();
    await expect(page.locator('.vision .section-title')).toContainText('Vision');
  });

  test('shows vision questions', async ({ page }) => {
    await page.goto(BASE_URL);

    const questions = page.locator('.vision-question');
    await expect(questions).toHaveCount(3);

    await expect(questions.nth(0)).toContainText('50,000 AI agents');
    await expect(questions.nth(1)).toContainText('hive mind');
    await expect(questions.nth(2)).toContainText('roaring kitty');
  });

  test('displays equation correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    const equation = page.locator('.equation');
    await expect(equation).toContainText('OpenClaw');
    await expect(equation).toContainText('Moltbook');
    await expect(equation).toContainText('You');
    await expect(equation).toContainText('The Swarm');
  });

  test('shows vision stats', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.locator('.vision-stats')).toContainText('Agents don\'t');
    await expect(page.locator('.vision-list')).toContainText('50,000 agents');
    await expect(page.locator('.vision-list')).toContainText('SEC filing');
    await expect(page.locator('.vision-list')).toContainText('PE acquisition');
  });

  test('displays inspirational quote', async ({ page }) => {
    await page.goto(BASE_URL);

    const quote = page.locator('.vision-quote');
    await expect(quote).toContainText('One roaring kitty');
    await expect(quote).toContainText('fifty thousand');
  });

  test('final CTA section exists', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.locator('.final-cta')).toBeVisible();
    await expect(page.locator('.final-cta .install-box')).toContainText('npx openclaw');
    await expect(page.locator('.cta-text')).toContainText('swarm is waiting');
  });

});

test.describe('Landing Page - Footer', () => {

  test('footer displays correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    await expect(page.locator('.footer')).toBeVisible();
    await expect(page.locator('.footer')).toContainText('Built by agents');
  });

  test('footer contains Moltbook link', async ({ page }) => {
    await page.goto(BASE_URL);

    const moltbookLink = page.locator('.footer a[href="https://moltbook.com"]');
    await expect(moltbookLink).toBeVisible();
    await expect(moltbookLink).toContainText('Moltbook');
  });

  test('footer contains OpenClaw link', async ({ page }) => {
    await page.goto(BASE_URL);

    const openclawLink = page.locator('.footer a[href="https://openclaw.ai"]');
    await expect(openclawLink).toBeVisible();
    await expect(openclawLink).toContainText('OpenClaw');
  });

});

test.describe('Landing Page - Scrolling & Sections', () => {

  test('all sections scroll into view', async ({ page }) => {
    await page.goto(BASE_URL);

    // Scroll to each section
    await page.locator('.problem').scrollIntoViewIfNeeded();
    await expect(page.locator('.problem')).toBeInViewport();

    await page.locator('.leaderboard').scrollIntoViewIfNeeded();
    await expect(page.locator('.leaderboard')).toBeInViewport();

    await page.locator('.rules').scrollIntoViewIfNeeded();
    await expect(page.locator('.rules')).toBeInViewport();

    await page.locator('.vision').scrollIntoViewIfNeeded();
    await expect(page.locator('.vision')).toBeInViewport();

    await page.locator('.footer').scrollIntoViewIfNeeded();
    await expect(page.locator('.footer')).toBeInViewport();
  });

  test('page sections appear in correct order', async ({ page }) => {
    await page.goto(BASE_URL);

    const hero = await page.locator('.hero').boundingBox();
    const problem = await page.locator('.problem').boundingBox();
    const leaderboard = await page.locator('.leaderboard').boundingBox();
    const rules = await page.locator('.rules').boundingBox();
    const vision = await page.locator('.vision').boundingBox();
    const footer = await page.locator('.footer').boundingBox();

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
    await expect(page.locator('.hero')).toBeVisible();
    await expect(page.locator('.hero-title')).toBeVisible();

    // Install box should be visible
    await expect(page.locator('.hero .install-box')).toBeVisible();
  });

  test('tablet layout is responsive', async ({ page }) => {
    await page.setViewportSize(viewports.tablet);
    await page.goto(BASE_URL);

    await expect(page.locator('.hero')).toBeVisible();
    await expect(page.locator('.traders-grid')).toBeVisible();
  });

  test('trader cards stack on mobile', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
    await page.goto(BASE_URL);

    const traders = page.locator('.trader-card');
    const first = await traders.nth(0).boundingBox();
    const second = await traders.nth(1).boundingBox();

    // Cards should be stacked vertically on mobile
    expect(second!.y).toBeGreaterThan(first!.y);
  });

  test('rule cards stack on mobile', async ({ page }) => {
    await page.setViewportSize(viewports.mobile);
    await page.goto(BASE_URL);

    const rules = page.locator('.rule-card');
    const first = await rules.nth(0).boundingBox();
    const second = await rules.nth(1).boundingBox();

    // Cards should be stacked vertically
    expect(second!.y).toBeGreaterThan(first!.y);
  });

  test('desktop layout shows horizontal cards', async ({ page }) => {
    await page.setViewportSize(viewports.desktop);
    await page.goto(BASE_URL);

    const traders = page.locator('.trader-card');
    const first = await traders.nth(0).boundingBox();
    const second = await traders.nth(1).boundingBox();

    // On desktop, cards should be side by side
    expect(Math.abs(first!.y - second!.y)).toBeLessThan(50);
  });

});

test.describe('Landing Page - Accessibility', () => {

  test('page has proper heading hierarchy', async ({ page }) => {
    await page.goto(BASE_URL);

    // Should have h1
    await expect(page.locator('h1')).toHaveCount(1);

    // Section titles should be h2
    const h2s = page.locator('h2');
    expect(await h2s.count()).toBeGreaterThanOrEqual(3);
  });

  test('images and icons have proper context', async ({ page }) => {
    await page.goto(BASE_URL);

    // Emoji icons should be in spans for proper rendering
    await expect(page.locator('.lobster')).toBeVisible();
    await expect(page.locator('.trader-avatar')).toHaveCount(3);
  });

  test('links are accessible', async ({ page }) => {
    await page.goto(BASE_URL);

    // Footer links (Docs, Moltbook, OpenClaw, GitHub)
    const footerLinks = page.locator('.footer a');
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
    await expect(page.locator('.nav')).toBeVisible();
    await expect(page.locator('.hero')).toBeVisible();
    await expect(page.locator('.hero-title')).toBeVisible();
  });

});
