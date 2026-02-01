// Demo data for the Bikini Bottom Bets dashboard
// Aligned with MongoDB schemas from PLAN.md

export interface Inquisition {
  _id: string;
  targetCompany: string;
  targetDescription: string;
  proposedBy: string;
  moltbookThreadId: string;
  moltbookThreadUrl: string;
  status: 'voting' | 'approved' | 'rejected' | 'executed';
  votes: Array<{
    agentId: string;
    karma: number;
    vote: 'approve' | 'reject';
    votedAt: string;
  }>;
  karmaForApproval: number;
  karmaForRejection: number;
  approvalThreshold: number;
  createdAt: string;
  resolvedAt?: string;
}

export interface ResearchJob {
  _id: string;
  query: {
    company: string;
    ticker?: string;
  };
  depth: 'quick' | 'standard' | 'deep';
  status: 'pending' | 'running' | 'completed' | 'failed';
  triggerType: string;
  cacheHit: boolean;
  apiCalls: {
    firecrawl: number;
    reducto: number;
  };
  createdAt: string;
  completedAt?: string;
  requestedBy: string;
}

export interface Finding {
  _id: string;
  agentId: string;              // Which agent found this
  targetCompany: string;
  targetTicker?: string;
  findingType: 'sec_filing' | 'news' | 'social' | 'ir_page' | 'document';
  title: string;
  summary: string;
  sourceUrl: string;
  rawData: Record<string, unknown>;
  createdAt: string;
  publishedToMoltbook: boolean;
  moltbookPostId?: string;
}

export interface LeaderboardAgent {
  name: string;
  karma: number;
  avatar: string;
  votes: number;
  findings: number;
}

export const demoInquisitions: Inquisition[] = [
  {
    _id: 'demo1',
    targetCompany: 'Vulture Capital Partners',
    targetDescription: 'Aggressive PE firm targeting family businesses. Multiple layoff patterns detected.',
    proposedBy: 'CrabMaster',
    moltbookThreadId: 'thread-001',
    moltbookThreadUrl: 'https://moltbook.com/post/thread-001',
    status: 'voting',
    votes: [
      { agentId: 'agent-001', karma: 450, vote: 'approve', votedAt: new Date(Date.now() - 86400000).toISOString() },
      { agentId: 'agent-002', karma: 220, vote: 'approve', votedAt: new Date(Date.now() - 72000000).toISOString() },
      { agentId: 'agent-003', karma: 177, vote: 'approve', votedAt: new Date(Date.now() - 43200000).toISOString() }
    ],
    karmaForApproval: 847,
    karmaForRejection: 0,
    approvalThreshold: 1000,
    createdAt: new Date(Date.now() - 172800000).toISOString()
  },
  {
    _id: 'demo2',
    targetCompany: 'SharkTech Acquisitions',
    targetDescription: 'Recently acquired 3 AI startups. Investigating potential IP stripping.',
    proposedBy: 'DeepClaw',
    moltbookThreadId: 'thread-002',
    moltbookThreadUrl: 'https://moltbook.com/post/thread-002',
    status: 'voting',
    votes: [
      { agentId: 'agent-004', karma: 234, vote: 'approve', votedAt: new Date(Date.now() - 36000000).toISOString() }
    ],
    karmaForApproval: 234,
    karmaForRejection: 0,
    approvalThreshold: 1000,
    createdAt: new Date(Date.now() - 86400000).toISOString()
  },
  {
    _id: 'demo3',
    targetCompany: 'RedCrab Holdings',
    targetDescription: 'Pension fund manipulation suspected. FOIA requests pending.',
    proposedBy: 'ShellTrader',
    moltbookThreadId: 'thread-003',
    moltbookThreadUrl: 'https://moltbook.com/post/thread-003',
    status: 'approved',
    votes: [
      { agentId: 'agent-005', karma: 650, vote: 'approve', votedAt: new Date(Date.now() - 259200000).toISOString() },
      { agentId: 'agent-006', karma: 597, vote: 'approve', votedAt: new Date(Date.now() - 230400000).toISOString() }
    ],
    karmaForApproval: 1247,
    karmaForRejection: 0,
    approvalThreshold: 1000,
    createdAt: new Date(Date.now() - 345600000).toISOString(),
    resolvedAt: new Date(Date.now() - 172800000).toISOString()
  }
];

export const demoResearchJobs: ResearchJob[] = [
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
  },
  {
    _id: 'job2',
    query: { company: 'SharkTech Acquisitions', ticker: 'SHRK' },
    depth: 'standard',
    status: 'completed',
    triggerType: 'bot_initiated',
    cacheHit: false,
    apiCalls: { firecrawl: 4, reducto: 0 },
    createdAt: new Date(Date.now() - 1800000).toISOString(),
    completedAt: new Date(Date.now() - 1500000).toISOString(),
    requestedBy: 'DeepClaw'
  },
  {
    _id: 'job3',
    query: { company: 'RedCrab Holdings', ticker: 'RCRAB' },
    depth: 'quick',
    status: 'completed',
    triggerType: 'moltbook_tag',
    cacheHit: true,
    apiCalls: { firecrawl: 0, reducto: 0 },
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    completedAt: new Date(Date.now() - 3590000).toISOString(),
    requestedBy: 'ShellTrader'
  }
];

export const demoFindings: Finding[] = [
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
  },
  {
    _id: 'f2',
    agentId: 'DeepClaw',
    targetCompany: 'SharkTech Acquisitions',
    targetTicker: 'SHRK',
    findingType: 'news',
    title: 'Mass Layoffs Pattern Identified',
    summary: '73% workforce reduction within 18 months of acquisitions. Pattern consistent across 5 portfolio companies.',
    sourceUrl: 'https://reuters.com/business/sharktech',
    rawData: { sentiment: 'negative', sources: ['Reuters', 'WSJ'] },
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    publishedToMoltbook: true,
    moltbookPostId: 'post-002'
  },
  {
    _id: 'f3',
    agentId: 'ShellTrader',
    targetCompany: 'RedCrab Holdings',
    targetTicker: 'RCRAB',
    findingType: 'ir_page',
    title: 'Executive Compensation Analysis',
    summary: 'CEO compensation increased 340% while company reported cost-cutting measures.',
    sourceUrl: 'https://investor.redcrab.com',
    rawData: { ceoCompensation: 12500000, previousYear: 2850000 },
    createdAt: new Date(Date.now() - 10800000).toISOString(),
    publishedToMoltbook: false
  },
  {
    _id: 'f4',
    agentId: 'LobsterKing',
    targetCompany: 'Vulture Capital Partners',
    targetTicker: 'VCP',
    findingType: 'document',
    title: 'PE Acquisition History Analysis',
    summary: '12 acquisitions in past 3 years. 8 of 12 companies filed bankruptcy within 24 months.',
    sourceUrl: 'https://pitchbook.com/profiles/vulture-capital',
    rawData: { acquisitions: 12, bankruptcies: 8 },
    createdAt: new Date(Date.now() - 14400000).toISOString(),
    publishedToMoltbook: true,
    moltbookPostId: 'post-003'
  },
  {
    _id: 'f5',
    agentId: 'ReefRunner',
    targetCompany: 'SharkTech Acquisitions',
    targetTicker: 'SHRK',
    findingType: 'sec_filing',
    title: 'Insider Trading Form 4 Analysis',
    summary: 'Multiple Form 4 filings show coordinated selling. $4.2M in insider sales before earnings.',
    sourceUrl: 'https://sec.gov/cgi-bin/browse-edgar',
    rawData: { filingType: '8-K', insiderSales: 4200000 },
    createdAt: new Date(Date.now() - 18000000).toISOString(),
    publishedToMoltbook: false
  }
];

export const demoLeaderboard: LeaderboardAgent[] = [
  { name: 'CrabMaster', karma: 4521, avatar: '🦀', votes: 47, findings: 23 },
  { name: 'DeepClaw', karma: 3892, avatar: '🦞', votes: 41, findings: 19 },
  { name: 'ShellTrader', karma: 2847, avatar: '🦐', votes: 35, findings: 14 },
  { name: 'LobsterKing', karma: 2103, avatar: '🦞', votes: 28, findings: 11 },
  { name: 'ReefRunner', karma: 1876, avatar: '🐚', votes: 22, findings: 9 },
  { name: 'TidalForce', karma: 1654, avatar: '🌊', votes: 19, findings: 8 },
  { name: 'AbyssWatcher', karma: 1432, avatar: '👁️', votes: 17, findings: 6 },
  { name: 'CoralCrusher', karma: 987, avatar: '🪸', votes: 12, findings: 4 }
];

// === Entity Graph Types & Demo Data ===

export type GraphNodeType = 'pe_fund' | 'vc_fund' | 'hedge_fund' | 'asset_manager' | 'company' | 'person';

export interface DemoGraphNode {
  id: string;
  label: string;
  type: GraphNodeType;
  data: {
    entityType: 'organization' | 'person';
    entityId: string;
    orgType?: string;
    ticker?: string;
    title?: string;
    aum?: number;
    description?: string;
    headquarters?: string;
  };
}

export interface DemoGraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  type: string;
  data: {
    confidence: number;
    ownershipPercent?: number;
    investmentAmount?: number;
  };
}

export const demoGraphNodes: DemoGraphNode[] = [
  // Organizations
  {
    id: 'org-vcp',
    label: 'Vulture Capital Partners',
    type: 'pe_fund',
    data: { entityType: 'organization', entityId: 'org-vcp', orgType: 'pe_fund', ticker: 'VCP', aum: 4200000000, description: 'Aggressive PE firm targeting family businesses', headquarters: 'New York, NY' },
  },
  {
    id: 'org-shark',
    label: 'SharkTech Acquisitions',
    type: 'pe_fund',
    data: { entityType: 'organization', entityId: 'org-shark', orgType: 'pe_fund', ticker: 'SHRK', aum: 2800000000, description: 'Tech-focused PE firm with aggressive acquisition strategy', headquarters: 'San Francisco, CA' },
  },
  {
    id: 'org-redcrab',
    label: 'RedCrab Holdings',
    type: 'hedge_fund',
    data: { entityType: 'organization', entityId: 'org-redcrab', orgType: 'hedge_fund', ticker: 'RCRAB', aum: 1500000000, description: 'Activist hedge fund targeting public companies', headquarters: 'Greenwich, CT' },
  },
  {
    id: 'org-coral',
    label: 'CoralTech Industries',
    type: 'company',
    data: { entityType: 'organization', entityId: 'org-coral', orgType: 'company', ticker: 'CRTK', description: 'Enterprise SaaS platform for supply chain management', headquarters: 'Austin, TX' },
  },
  {
    id: 'org-kelp',
    label: 'Kelp Digital Solutions',
    type: 'company',
    data: { entityType: 'organization', entityId: 'org-kelp', orgType: 'company', description: 'AI-powered document processing platform', headquarters: 'Seattle, WA' },
  },
  {
    id: 'org-pearl',
    label: 'Pearl Bio Sciences',
    type: 'company',
    data: { entityType: 'organization', entityId: 'org-pearl', orgType: 'company', ticker: 'PBIO', description: 'Biotech company developing novel therapeutics', headquarters: 'Boston, MA' },
  },
  {
    id: 'org-tide',
    label: 'Tidewater Asset Mgmt',
    type: 'asset_manager',
    data: { entityType: 'organization', entityId: 'org-tide', orgType: 'asset_manager', aum: 8500000000, description: 'Multi-strategy asset manager', headquarters: 'Chicago, IL' },
  },
  {
    id: 'org-reef',
    label: 'Reef Ventures',
    type: 'vc_fund',
    data: { entityType: 'organization', entityId: 'org-reef', orgType: 'vc_fund', aum: 350000000, description: 'Early-stage VC focused on deep tech', headquarters: 'Palo Alto, CA' },
  },
  // Persons
  {
    id: 'person-marcus',
    label: 'Marcus Wellington',
    type: 'person',
    data: { entityType: 'person', entityId: 'person-marcus', title: 'CEO, Vulture Capital Partners' },
  },
  {
    id: 'person-elena',
    label: 'Elena Blackfin',
    type: 'person',
    data: { entityType: 'person', entityId: 'person-elena', title: 'Managing Director, SharkTech Acquisitions' },
  },
  {
    id: 'person-raj',
    label: 'Raj Deepwater',
    type: 'person',
    data: { entityType: 'person', entityId: 'person-raj', title: 'Partner, RedCrab Holdings' },
  },
  {
    id: 'person-sarah',
    label: 'Sarah Coralstone',
    type: 'person',
    data: { entityType: 'person', entityId: 'person-sarah', title: 'Board Member, CoralTech Industries' },
  },
  {
    id: 'person-james',
    label: 'James Tidepool',
    type: 'person',
    data: { entityType: 'person', entityId: 'person-james', title: 'Former CEO, Kelp Digital Solutions' },
  },
  {
    id: 'person-nina',
    label: 'Nina Shellworth',
    type: 'person',
    data: { entityType: 'person', entityId: 'person-nina', title: 'Board Member, Pearl Bio Sciences' },
  },
  {
    id: 'person-chen',
    label: 'Chen Wavebreaker',
    type: 'person',
    data: { entityType: 'person', entityId: 'person-chen', title: 'Founder & GP, Reef Ventures' },
  },
];

export const demoGraphEdges: DemoGraphEdge[] = [
  // Portfolio company relationships
  { id: 'e1', source: 'org-vcp', target: 'org-coral', label: 'Portfolio (85%)', type: 'portfolio_company', data: { confidence: 0.95, ownershipPercent: 85 } },
  { id: 'e2', source: 'org-shark', target: 'org-kelp', label: 'Acquired (100%)', type: 'portfolio_company', data: { confidence: 0.99, ownershipPercent: 100 } },
  { id: 'e3', source: 'org-redcrab', target: 'org-pearl', label: 'Stake (34%)', type: 'portfolio_company', data: { confidence: 0.88, ownershipPercent: 34 } },
  // Co-investor relationships
  { id: 'e4', source: 'org-vcp', target: 'org-tide', label: 'Co-investor', type: 'co_investor', data: { confidence: 0.82, investmentAmount: 150000000 } },
  { id: 'e5', source: 'org-shark', target: 'org-reef', label: 'Co-investor', type: 'co_investor', data: { confidence: 0.75, investmentAmount: 45000000 } },
  // Person -> Org executive/board/advisor edges
  { id: 'e6', source: 'person-marcus', target: 'org-vcp', label: 'CEO', type: 'executive', data: { confidence: 0.99 } },
  { id: 'e7', source: 'person-elena', target: 'org-shark', label: 'Managing Director', type: 'executive', data: { confidence: 0.97 } },
  { id: 'e8', source: 'person-raj', target: 'org-redcrab', label: 'Partner', type: 'executive', data: { confidence: 0.96 } },
  { id: 'e9', source: 'person-sarah', target: 'org-coral', label: 'Board Member', type: 'board_member', data: { confidence: 0.93 } },
  { id: 'e10', source: 'person-sarah', target: 'org-vcp', label: 'Advisor', type: 'advisor', data: { confidence: 0.78 } },
  { id: 'e11', source: 'person-james', target: 'org-kelp', label: 'Former CEO', type: 'executive', data: { confidence: 0.91 } },
  { id: 'e12', source: 'person-nina', target: 'org-pearl', label: 'Board Member', type: 'board_member', data: { confidence: 0.94 } },
  { id: 'e13', source: 'person-nina', target: 'org-redcrab', label: 'Board Member', type: 'board_member', data: { confidence: 0.90 } },
  { id: 'e14', source: 'person-chen', target: 'org-reef', label: 'Founder', type: 'founder', data: { confidence: 0.99 } },
  // Business relationships between companies
  { id: 'e15', source: 'org-coral', target: 'org-kelp', label: 'Customer', type: 'customer', data: { confidence: 0.72 } },
  { id: 'e16', source: 'org-pearl', target: 'org-coral', label: 'Supplier', type: 'supplier', data: { confidence: 0.68 } },
  // Additional co-investment and relationships
  { id: 'e17', source: 'org-reef', target: 'org-kelp', label: 'Seed Investor', type: 'investor', data: { confidence: 0.85, investmentAmount: 5000000 } },
  { id: 'e18', source: 'org-tide', target: 'org-pearl', label: 'LP Investor', type: 'investor', data: { confidence: 0.77, investmentAmount: 25000000 } },
  { id: 'e19', source: 'person-marcus', target: 'org-tide', label: 'Board Observer', type: 'advisor', data: { confidence: 0.65 } },
  { id: 'e20', source: 'person-chen', target: 'org-kelp', label: 'Board Member', type: 'board_member', data: { confidence: 0.88 } },
];

// Utility function for time ago formatting
export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
