import { Page } from '@playwright/test';

export const BASE_URL = 'http://localhost:3000';
export const API_BASE = 'https://bikinibottombets.casino';

// Mock data matching the actual API response structure
export const mockAgent = {
  name: 'TestCrab',
  moltbookId: 'test-agent-123',
  karma: 1500,
  registeredAt: new Date().toISOString()
};

export const mockHuman = {
  email: 'test@example.com'
};

export const mockInquisitions = [
  {
    _id: 'inq1',
    targetCompany: 'Vulture Capital Partners',
    targetDescription: 'Aggressive PE firm targeting family businesses.',
    status: 'voting',
    karmaForApproval: 847,
    approvalThreshold: 1000,
    votes: [
      { agentId: '1', karma: 450, vote: 'approve' },
      { agentId: '2', karma: 220, vote: 'approve' },
      { agentId: '3', karma: 177, vote: 'approve' }
    ]
  }
];

export const mockResearchJobs = [
  {
    _id: 'job1',
    query: { company: 'Vulture Capital Partners', ticker: 'VCP' },
    depth: 'deep',
    status: 'running',
    triggerType: 'moltbook_tag',
    cacheHit: false,
    apiCalls: { firecrawl: 3, reducto: 1 },
    createdAt: new Date(Date.now() - 300000).toISOString(),
    requestedBy: 'CrabMaster'
  }
];

export const mockFindings = [
  {
    _id: 'f1',
    agentId: 'CrabMaster',
    targetCompany: 'Vulture Capital Partners',
    targetTicker: 'VCP',
    findingType: 'sec_filing',
    title: 'Hidden Debt Obligations in 10-K',
    summary: '$2.3B in off-balance-sheet liabilities not disclosed in investor presentations.',
    sourceUrl: 'https://sec.gov/cgi-bin/browse-edgar',
    rawData: { filingType: '10-K', pageCount: 247 },
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    publishedToMoltbook: true,
    moltbookPostId: 'post-001'
  }
];

export const mockLeaderboard = [
  { name: 'CrabMaster', karma: 4521, avatar: '🦀', votes: 47, findings: 23 },
  { name: 'DeepClaw', karma: 3892, avatar: '🦞', votes: 41, findings: 19 }
];

// Authentication helpers
export async function loginAsAgent(page: Page, agent: any = mockAgent) {
  await page.goto(`${BASE_URL}/login`);
  await page.evaluate((agentData) => {
    localStorage.setItem('bbb_agent', JSON.stringify(agentData));
    localStorage.setItem('bbb_token', 'test-token-123');
  }, agent);
}

export async function loginAsHuman(page: Page, human: any = mockHuman) {
  await page.goto(`${BASE_URL}/login`);
  await page.evaluate((humanData) => {
    localStorage.setItem('bbb_human', JSON.stringify(humanData));
  }, human);
}

export async function clearAuth(page: Page) {
  // Navigate to a page first if needed to access localStorage
  if (page.url() === 'about:blank') {
    await page.goto(BASE_URL);
  }
  await page.evaluate(() => {
    localStorage.removeItem('bbb_agent');
    localStorage.removeItem('bbb_human');
    localStorage.removeItem('bbb_token');
  });
}

// Viewport helpers for responsive testing
export const viewports = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 720 },
  wide: { width: 1920, height: 1080 }
};

// Time formatting helper to match app logic
export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
