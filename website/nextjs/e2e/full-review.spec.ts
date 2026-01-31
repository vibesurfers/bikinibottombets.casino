import { test } from '@playwright/test';

const SCREENSHOT_DIR = './screenshots/review';

test.describe('Full Visual Review', () => {
  test('capture all pages for review', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes for all screenshots
    // Set viewport to desktop
    await page.setViewportSize({ width: 1440, height: 900 });

    // Clear auth first
    await page.goto('http://localhost:3000');
    await page.evaluate(() => {
      localStorage.clear();
    });

    // 1. LANDING PAGE - Full scroll capture
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-landing-hero.png` });

    // Scroll to problem section
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-landing-problem.png` });

    // Scroll to leaderboard
    await page.evaluate(() => window.scrollTo(0, 1600));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-landing-leaderboard.png` });

    // Scroll to rules
    await page.evaluate(() => window.scrollTo(0, 2400));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-landing-rules.png` });

    // Scroll to vision
    await page.evaluate(() => window.scrollTo(0, 3200));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-landing-vision.png` });

    // Footer
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/06-landing-footer.png` });

    // 2. LOGIN PAGE
    await page.goto('http://localhost:3000/login');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/07-login-initial.png` });

    // Select agent card
    const agentCard = page.locator('[data-slot="card"]').filter({ hasText: "Agent" });
    await agentCard.getByRole('button', { name: 'Select' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/08-login-agent-selected.png` });

    // Go back and select human
    await page.goto('http://localhost:3000/login');
    await page.waitForLoadState('networkidle');
    const humanCard = page.locator('[data-slot="card"]').filter({ hasText: "Human" });
    await humanCard.getByRole('button', { name: 'Select' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/09-login-human-selected.png` });

    // 3. DASHBOARD - Login via bypass
    await page.goto('http://localhost:3000/login?bypass=a@tribecode.ai');
    await page.waitForURL('**/dashboard');
    await page.waitForLoadState('networkidle');

    // Claw Court tab
    await page.screenshot({ path: `${SCREENSHOT_DIR}/10-dashboard-claw-court.png` });

    // Research Jobs tab
    await page.getByRole('tab', { name: /Research Jobs/i }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/11-dashboard-research.png` });

    // Findings tab
    await page.getByRole('tab', { name: /Findings/i }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/12-dashboard-findings-all.png` });

    // Filter by SEC Filings
    await page.getByRole('button', { name: /SEC Filings/i }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/13-dashboard-findings-sec.png` });

    // Filter by Documents
    await page.getByRole('button', { name: /Documents/i }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/14-dashboard-findings-documents.png` });

    // Leaderboard tab
    await page.getByRole('tab', { name: /Leaderboard/i }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/15-dashboard-leaderboard.png` });

    // 4. MOBILE VIEWS
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14 Pro

    // Mobile landing
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/16-mobile-landing.png` });

    // Mobile login
    await page.goto('http://localhost:3000/login');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/17-mobile-login.png` });

    // Mobile dashboard
    await page.goto('http://localhost:3000/login?bypass=a@tribecode.ai');
    await page.waitForURL('**/dashboard');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SCREENSHOT_DIR}/18-mobile-dashboard.png` });
  });
});
