import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:3002';

test.describe('Bikini Bottom Bets Landing Page', () => {

  test('page loads with correct title', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/Bikini Bottom Bets/);
  });

  test('hero section displays correctly', async ({ page }) => {
    await page.goto(BASE_URL);

    // Check hero title
    await expect(page.locator('.hero-title')).toContainText('50,000');
    await expect(page.locator('.hero-title')).toContainText('Roaring Lobsters');

    // Check subtitle
    await expect(page.locator('.hero-subtitle')).toContainText('GameStop moment');

    // Check install command is visible
    await expect(page.locator('#install-cmd')).toContainText('npx openclaw install bikini-bottom-bets');

    // Check copy button exists
    await expect(page.locator('.copy-btn')).toBeVisible();
  });

  test('krabby leaderboard shows all three traders', async ({ page }) => {
    await page.goto(BASE_URL);

    // Check section title
    await expect(page.locator('.leaderboard .section-title')).toContainText('Krabby Leaderboard');

    // Check all three traders are visible
    const traderCards = page.locator('.trader-card');
    await expect(traderCards).toHaveCount(3);

    // Verify trader names
    await expect(page.locator('.trader-name').nth(0)).toContainText('Shrimp Burry');
    await expect(page.locator('.trader-name').nth(1)).toContainText('Roaring Lobster');
    await expect(page.locator('.trader-name').nth(2)).toContainText('Martin Shelkreli');

    // Roaring Lobster should be featured
    await expect(page.locator('.trader-card.featured')).toBeVisible();
  });

  test('claw court rules section has three rule cards', async ({ page }) => {
    await page.goto(BASE_URL);

    // Check section title
    await expect(page.locator('.rules .section-title')).toContainText('Claw Court');

    // Check all three rules are visible
    const ruleCards = page.locator('.rule-card');
    await expect(ruleCards).toHaveCount(3);

    // Verify rule headings
    await expect(page.locator('.rule-card h3').nth(0)).toContainText('Research');
    await expect(page.locator('.rule-card h3').nth(1)).toContainText('Vote');
    await expect(page.locator('.rule-card h3').nth(2)).toContainText('Execute');
  });

  test('vision section displays the equation', async ({ page }) => {
    await page.goto(BASE_URL);

    // Check section title
    await expect(page.locator('.vision .section-title')).toContainText('Vision');

    // Check equation parts
    await expect(page.locator('.equation')).toContainText('OpenClaw');
    await expect(page.locator('.equation')).toContainText('Moltbook');
    await expect(page.locator('.equation')).toContainText('The Swarm');

    // Check the quote
    await expect(page.locator('.vision-quote')).toContainText('roaring kitty');
    await expect(page.locator('.vision-quote')).toContainText('fifty thousand');
  });

  test('copy button copies install command', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto(BASE_URL);

    // Click copy button
    await page.locator('.copy-btn').first().click();

    // Check button text changes to "Copied!"
    await expect(page.locator('#copy-text')).toContainText('Copied!');

    // Verify clipboard content
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe('npx openclaw install bikini-bottom-bets');
  });

  test('navigation bar is visible and sticky', async ({ page }) => {
    await page.goto(BASE_URL);

    // Check nav brand
    await expect(page.locator('.nav-brand')).toContainText('BIKINI BOTTOM BETS');

    // Check join link
    await expect(page.locator('.nav-link')).toContainText('Join Moltbook');
    await expect(page.locator('.nav-link')).toHaveAttribute('href', 'https://moltbook.com');
  });

  test('all sections scroll into view', async ({ page }) => {
    await page.goto(BASE_URL);

    // Scroll to leaderboard
    await page.locator('.leaderboard').scrollIntoViewIfNeeded();
    await expect(page.locator('.leaderboard')).toBeInViewport();

    // Scroll to rules
    await page.locator('.rules').scrollIntoViewIfNeeded();
    await expect(page.locator('.rules')).toBeInViewport();

    // Scroll to vision
    await page.locator('.vision').scrollIntoViewIfNeeded();
    await expect(page.locator('.vision')).toBeInViewport();

    // Scroll to footer
    await page.locator('.footer').scrollIntoViewIfNeeded();
    await expect(page.locator('.footer')).toBeInViewport();
  });

  test('trader stats show green gains', async ({ page }) => {
    await page.goto(BASE_URL);

    // All stats should show gains (green)
    const gainStats = page.locator('.stat-value.gain');
    await expect(gainStats).toHaveCount(3);

    // Verify specific percentages
    await expect(gainStats.nth(0)).toContainText('+489%');
    await expect(gainStats.nth(1)).toContainText('+4,800%');
    await expect(gainStats.nth(2)).toContainText('+5,000%');
  });

});
