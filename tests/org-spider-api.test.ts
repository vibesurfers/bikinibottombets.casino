import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';

// --- Stable ObjectIds for mock data ---
const fundObjectId = new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa');
const companyObjectId = new ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb');
const personObjectId = new ObjectId('cccccccccccccccccccccccc');
const jobObjectId = new ObjectId('dddddddddddddddddddddddd');
const relObjectId = new ObjectId('eeeeeeeeeeeeeeeeeeeeeeee');

// --- Mock org-spider-db ---
const mockOrg = {
  _id: fundObjectId,
  canonicalName: 'Blackstone',
  aliases: ['BX'],
  ticker: 'BX',
  orgType: 'pe_fund' as const,
  aum: 1000000000000,
  investmentFocus: ['buyout'],
  headquarters: { city: 'New York', state: 'NY', country: 'US' },
  website: 'https://blackstone.com',
  description: 'Global PE firm',
  foundedYear: 1985,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockCompany = {
  _id: companyObjectId,
  canonicalName: 'Hilton',
  aliases: [],
  ticker: 'HLT',
  orgType: 'portfolio_company' as const,
  investmentFocus: ['hospitality'],
  website: 'https://hilton.com',
  description: 'Hotel chain',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPerson = {
  _id: personObjectId,
  fullName: 'Steve Schwarzman',
  aliases: [],
  linkedInUrl: 'https://linkedin.com/in/schwarzman',
  currentRole: {
    organizationId: fundObjectId,
    title: 'CEO',
    startDate: new Date('2020-01-01'),
  },
  biography: 'Founder of Blackstone',
  education: [{ institution: 'Yale', degree: 'BA', year: 1969 }],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRelationship = {
  _id: relObjectId,
  sourceType: 'organization' as const,
  sourceId: fundObjectId,
  targetType: 'organization' as const,
  targetId: companyObjectId,
  relationshipType: 'portfolio_company' as const,
  confidence: 0.95,
  metadata: {
    dealType: 'buyout',
    investmentAmount: 26000000000,
    ownershipPercent: 100,
    startDate: new Date('2007-10-01'),
    endDate: new Date('2018-12-01'),
    exitType: 'ipo',
  },
  evidence: [],
  firstSeen: new Date(),
  lastVerified: new Date(),
};

const mockPersonRelationship = {
  _id: new ObjectId(),
  sourceType: 'person' as const,
  sourceId: personObjectId,
  targetType: 'organization' as const,
  targetId: fundObjectId,
  relationshipType: 'partner' as const,
  confidence: 0.95,
  metadata: { title: 'CEO' },
  evidence: [],
  firstSeen: new Date(),
  lastVerified: new Date(),
};

const mockSpiderJob = {
  _id: jobObjectId,
  targetType: 'organization' as const,
  targetId: fundObjectId,
  targetName: 'Blackstone',
  depth: 'standard' as const,
  maxHops: 2,
  status: 'completed' as const,
  progress: {
    currentStep: 'Complete',
    stepsCompleted: 6,
    totalSteps: 6,
    organizationsFound: 15,
    personsFound: 8,
    relationshipsFound: 23,
  },
  createdAt: new Date(),
  startedAt: new Date(),
  completedAt: new Date(),
};

// Mock org-spider-db functions
vi.mock('../api/lib/org-spider-db', () => ({
  findOrganizationById: vi.fn(),
  findRelationshipsForEntity: vi.fn(),
  searchOrganizations: vi.fn(),
  findPersonById: vi.fn(),
  searchPersons: vi.fn(),
  getTopPEFunds: vi.fn(),
  getPortfolioCompanies: vi.fn(),
  getFundTeam: vi.fn(),
  getCoInvestors: vi.fn(),
}));

// Mock org-spider functions
vi.mock('../api/lib/org-spider', () => ({
  spiderPEFund: vi.fn(),
  spiderPerson: vi.fn(),
  getSpiderJobStatus: vi.fn(),
  getGraphData: vi.fn(),
}));

// Import mocked modules
import {
  findOrganizationById,
  findRelationshipsForEntity,
  searchOrganizations,
  findPersonById,
  searchPersons,
  getTopPEFunds,
  getPortfolioCompanies,
  getFundTeam,
  getCoInvestors,
} from '../api/lib/org-spider-db';

import {
  spiderPEFund,
  spiderPerson,
  getSpiderJobStatus,
  getGraphData,
} from '../api/lib/org-spider';

// Import handlers after mocking
import researchHandler from '../api/org-spider/research';
import jobHandler from '../api/org-spider/job';
import organizationsHandler from '../api/organizations/index';
import personsHandler from '../api/persons/index';
import graphHandler from '../api/graph/index';
import topFundsHandler from '../api/pe/top-funds';
import portfolioHandler from '../api/pe/portfolio';
import teamHandler from '../api/pe/team';

// --- Test Helpers ---
function createMockRes() {
  return {
    headers: {} as Record<string, string>,
    statusCode: 200,
    body: null as any,
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
    end() {},
  };
}

function createReq(overrides: any = {}) {
  return { method: 'GET', query: {}, body: {}, ...overrides } as any;
}

// =========================================================================
// POST /api/org-spider/research
// =========================================================================
describe('POST /api/org-spider/research', () => {
  let mockRes: ReturnType<typeof createMockRes>;

  beforeEach(() => {
    mockRes = createMockRes();
    vi.clearAllMocks();
  });

  it('returns 405 for non-POST methods', async () => {
    await researchHandler(createReq({ method: 'GET' }), mockRes as any);
    expect(mockRes.statusCode).toBe(405);
  });

  it('returns 200 for OPTIONS (CORS)', async () => {
    await researchHandler(createReq({ method: 'OPTIONS' }), mockRes as any);
    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('returns 400 when targetName missing', async () => {
    await researchHandler(
      createReq({ method: 'POST', body: { targetType: 'organization' } }),
      mockRes as any,
    );
    expect(mockRes.statusCode).toBe(400);
    expect(mockRes.body.error).toContain('targetName');
  });

  it('returns 400 when targetType invalid', async () => {
    await researchHandler(
      createReq({ method: 'POST', body: { targetName: 'Test', targetType: 'invalid' } }),
      mockRes as any,
    );
    expect(mockRes.statusCode).toBe(400);
    expect(mockRes.body.error).toContain('targetType');
  });

  it('returns 200 and jobId for valid organization request', async () => {
    vi.mocked(spiderPEFund).mockResolvedValue(mockSpiderJob);

    await researchHandler(
      createReq({
        method: 'POST',
        body: { targetName: 'Blackstone', targetType: 'organization' },
      }),
      mockRes as any,
    );

    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.body.jobId).toBe(jobObjectId.toString());
    expect(mockRes.body.targetName).toBe('Blackstone');
    expect(vi.mocked(spiderPEFund)).toHaveBeenCalledWith('Blackstone', { depth: 'standard' });
  });

  it('returns 200 and jobId for valid person request', async () => {
    const personJob = { ...mockSpiderJob, targetType: 'person' as const, targetName: 'John Doe' };
    vi.mocked(spiderPerson).mockResolvedValue(personJob);

    await researchHandler(
      createReq({
        method: 'POST',
        body: { targetName: 'John Doe', targetType: 'person' },
      }),
      mockRes as any,
    );

    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.body.jobId).toBeDefined();
    expect(vi.mocked(spiderPerson)).toHaveBeenCalledWith('John Doe', { depth: 'shallow' });
  });

  it('defaults depth to standard for org, shallow for person', async () => {
    vi.mocked(spiderPEFund).mockResolvedValue(mockSpiderJob);
    vi.mocked(spiderPerson).mockResolvedValue(mockSpiderJob);

    // Organization defaults to standard
    await researchHandler(
      createReq({
        method: 'POST',
        body: { targetName: 'Test', targetType: 'organization' },
      }),
      mockRes as any,
    );
    expect(vi.mocked(spiderPEFund)).toHaveBeenCalledWith('Test', { depth: 'standard' });

    // Person defaults to shallow
    mockRes = createMockRes();
    await researchHandler(
      createReq({
        method: 'POST',
        body: { targetName: 'Test Person', targetType: 'person' },
      }),
      mockRes as any,
    );
    expect(vi.mocked(spiderPerson)).toHaveBeenCalledWith('Test Person', { depth: 'shallow' });
  });

  it('returns 500 on spider error', async () => {
    vi.mocked(spiderPEFund).mockRejectedValue(new Error('Spider failure'));

    await researchHandler(
      createReq({
        method: 'POST',
        body: { targetName: 'FailCorp', targetType: 'organization' },
      }),
      mockRes as any,
    );

    expect(mockRes.statusCode).toBe(500);
    expect(mockRes.body.error).toBe('Spider failure');
  });
});

// =========================================================================
// GET /api/org-spider/job
// =========================================================================
describe('GET /api/org-spider/job', () => {
  let mockRes: ReturnType<typeof createMockRes>;

  beforeEach(() => {
    mockRes = createMockRes();
    vi.clearAllMocks();
  });

  it('returns 405 for non-GET methods', async () => {
    await jobHandler(createReq({ method: 'POST' }), mockRes as any);
    expect(mockRes.statusCode).toBe(405);
  });

  it('returns 400 when id missing', async () => {
    await jobHandler(createReq({ query: {} }), mockRes as any);
    expect(mockRes.statusCode).toBe(400);
  });

  it('returns 404 when job not found', async () => {
    vi.mocked(getSpiderJobStatus).mockResolvedValue(null);

    await jobHandler(createReq({ query: { id: 'some-id' } }), mockRes as any);
    expect(mockRes.statusCode).toBe(404);
  });

  it('returns 200 with job status for valid id', async () => {
    vi.mocked(getSpiderJobStatus).mockResolvedValue(mockSpiderJob);

    await jobHandler(createReq({ query: { id: 'job-123' } }), mockRes as any);

    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.body.id).toBe(jobObjectId.toString());
    expect(mockRes.body.status).toBe('completed');
    expect(mockRes.body.targetName).toBe('Blackstone');
    expect(mockRes.body.progress.stepsCompleted).toBe(6);
  });
});

// =========================================================================
// GET /api/organizations
// =========================================================================
describe('GET /api/organizations', () => {
  let mockRes: ReturnType<typeof createMockRes>;

  beforeEach(() => {
    mockRes = createMockRes();
    vi.clearAllMocks();
  });

  it('returns 400 when neither id nor query provided', async () => {
    await organizationsHandler(createReq({ query: {} }), mockRes as any);
    expect(mockRes.statusCode).toBe(400);
    expect(mockRes.body.error).toContain('id or query');
  });

  it('returns 400 for invalid ObjectId', async () => {
    await organizationsHandler(createReq({ query: { id: 'not-valid' } }), mockRes as any);
    expect(mockRes.statusCode).toBe(400);
    expect(mockRes.body.error).toContain('Invalid');
  });

  it('returns 404 when org not found', async () => {
    vi.mocked(findOrganizationById).mockResolvedValue(null);

    await organizationsHandler(
      createReq({ query: { id: fundObjectId.toString() } }),
      mockRes as any,
    );
    expect(mockRes.statusCode).toBe(404);
  });

  it('returns org with relationships for valid id', async () => {
    vi.mocked(findOrganizationById).mockResolvedValue(mockOrg);
    vi.mocked(findRelationshipsForEntity).mockResolvedValue([mockRelationship]);

    await organizationsHandler(
      createReq({ query: { id: fundObjectId.toString() } }),
      mockRes as any,
    );

    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.body.organization.canonicalName).toBe('Blackstone');
    expect(mockRes.body.organization.ticker).toBe('BX');
    expect(mockRes.body.relationships).toHaveLength(1);
    expect(mockRes.body.relationships[0].relationshipType).toBe('portfolio_company');
  });

  it('returns search results for valid query', async () => {
    vi.mocked(searchOrganizations).mockResolvedValue([mockOrg, mockCompany]);

    await organizationsHandler(
      createReq({ query: { query: 'Black' } }),
      mockRes as any,
    );

    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.body.organizations).toHaveLength(2);
    expect(mockRes.body.count).toBe(2);
  });

  it('respects orgType and limit filters', async () => {
    vi.mocked(searchOrganizations).mockResolvedValue([mockOrg]);

    await organizationsHandler(
      createReq({ query: { query: 'Black', orgType: 'pe_fund', limit: '5' } }),
      mockRes as any,
    );

    expect(vi.mocked(searchOrganizations)).toHaveBeenCalledWith('Black', 'pe_fund', 5);
  });
});

// =========================================================================
// GET /api/persons
// =========================================================================
describe('GET /api/persons', () => {
  let mockRes: ReturnType<typeof createMockRes>;

  beforeEach(() => {
    mockRes = createMockRes();
    vi.clearAllMocks();
  });

  it('returns 400 when neither id nor query provided', async () => {
    await personsHandler(createReq({ query: {} }), mockRes as any);
    expect(mockRes.statusCode).toBe(400);
    expect(mockRes.body.error).toContain('id or query');
  });

  it('returns 404 when person not found', async () => {
    vi.mocked(findPersonById).mockResolvedValue(null);

    await personsHandler(
      createReq({ query: { id: personObjectId.toString() } }),
      mockRes as any,
    );
    expect(mockRes.statusCode).toBe(404);
  });

  it('returns person with relationships for valid id', async () => {
    vi.mocked(findPersonById).mockResolvedValue(mockPerson);
    vi.mocked(findRelationshipsForEntity).mockResolvedValue([mockPersonRelationship]);

    await personsHandler(
      createReq({ query: { id: personObjectId.toString() } }),
      mockRes as any,
    );

    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.body.person.fullName).toBe('Steve Schwarzman');
    expect(mockRes.body.person.currentRole.title).toBe('CEO');
    expect(mockRes.body.relationships).toHaveLength(1);
  });

  it('returns search results for valid query', async () => {
    vi.mocked(searchPersons).mockResolvedValue([mockPerson]);

    await personsHandler(
      createReq({ query: { query: 'Steve' } }),
      mockRes as any,
    );

    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.body.persons).toHaveLength(1);
    expect(mockRes.body.persons[0].fullName).toBe('Steve Schwarzman');
    expect(mockRes.body.count).toBe(1);
  });
});

// =========================================================================
// GET /api/graph
// =========================================================================
describe('GET /api/graph', () => {
  let mockRes: ReturnType<typeof createMockRes>;

  beforeEach(() => {
    mockRes = createMockRes();
    vi.clearAllMocks();
  });

  it('returns 400 for invalid entityType', async () => {
    await graphHandler(
      createReq({ query: { entityType: 'invalid', entityId: fundObjectId.toString() } }),
      mockRes as any,
    );
    expect(mockRes.statusCode).toBe(400);
    expect(mockRes.body.error).toContain('entityType');
  });

  it('returns 400 for missing entityId', async () => {
    await graphHandler(
      createReq({ query: { entityType: 'organization' } }),
      mockRes as any,
    );
    expect(mockRes.statusCode).toBe(400);
    expect(mockRes.body.error).toContain('entityId');
  });

  it('returns 400 for invalid ObjectId', async () => {
    await graphHandler(
      createReq({ query: { entityType: 'organization', entityId: 'bad-id' } }),
      mockRes as any,
    );
    expect(mockRes.statusCode).toBe(400);
    expect(mockRes.body.error).toContain('Invalid');
  });

  it('returns 400 for depth out of range', async () => {
    // depth 0 (below minimum) — parseInt('0') = 0, but the handler defaults 0 to 2 via ||
    // depth 5 (above maximum)
    await graphHandler(
      createReq({
        query: { entityType: 'organization', entityId: fundObjectId.toString(), depth: '5' },
      }),
      mockRes as any,
    );
    expect(mockRes.statusCode).toBe(400);
    expect(mockRes.body.error).toContain('depth');
  });

  it('returns nodes and edges with meta for valid request', async () => {
    const mockGraphData = {
      nodes: [
        { id: 'org-1', label: 'Blackstone', type: 'pe_fund' as const, data: { entityType: 'organization' as const, entityId: fundObjectId.toString(), orgType: 'pe_fund' as const, ticker: 'BX', aum: 1e12 } },
        { id: 'person-1', label: 'Steve Schwarzman', type: 'person' as const, data: { entityType: 'person' as const, entityId: personObjectId.toString(), title: 'CEO' } },
      ],
      edges: [
        { id: 'e1', source: 'person-1', target: 'org-1', label: 'Partner', type: 'partner' as const, data: { confidence: 0.95 } },
      ],
    };

    vi.mocked(getGraphData).mockResolvedValue(mockGraphData);

    await graphHandler(
      createReq({
        query: { entityType: 'organization', entityId: fundObjectId.toString(), depth: '2' },
      }),
      mockRes as any,
    );

    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.body.nodes).toHaveLength(2);
    expect(mockRes.body.edges).toHaveLength(1);
    expect(mockRes.body.meta.rootEntityType).toBe('organization');
    expect(mockRes.body.meta.nodeCount).toBe(2);
    expect(mockRes.body.meta.edgeCount).toBe(1);
    expect(mockRes.body.meta.depth).toBe(2);
  });
});

// =========================================================================
// GET /api/pe/top-funds
// =========================================================================
describe('GET /api/pe/top-funds', () => {
  let mockRes: ReturnType<typeof createMockRes>;

  beforeEach(() => {
    mockRes = createMockRes();
    vi.clearAllMocks();
  });

  it('returns fund summaries sorted by AUM', async () => {
    const fund1 = { ...mockOrg, aum: 1e12 };
    const fund2 = { ...mockOrg, _id: new ObjectId(), canonicalName: 'KKR', ticker: 'KKR', aum: 5e11 };
    vi.mocked(getTopPEFunds).mockResolvedValue([fund1, fund2]);
    vi.mocked(getPortfolioCompanies).mockResolvedValue([mockCompany]);
    vi.mocked(getFundTeam).mockResolvedValue([mockPerson]);
    vi.mocked(getCoInvestors).mockResolvedValue([]);

    await topFundsHandler(createReq({ query: {} }), mockRes as any);

    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.body.funds).toHaveLength(2);
    // First should be higher AUM
    expect(mockRes.body.funds[0].aum).toBeGreaterThanOrEqual(mockRes.body.funds[1].aum);
  });

  it('respects limit parameter', async () => {
    vi.mocked(getTopPEFunds).mockResolvedValue([]);

    await topFundsHandler(createReq({ query: { limit: '5' } }), mockRes as any);

    expect(vi.mocked(getTopPEFunds)).toHaveBeenCalledWith(5);
  });

  it('returns portfolio/team/co-investor counts', async () => {
    vi.mocked(getTopPEFunds).mockResolvedValue([mockOrg]);
    vi.mocked(getPortfolioCompanies).mockResolvedValue([mockCompany, mockCompany]);
    vi.mocked(getFundTeam).mockResolvedValue([mockPerson]);
    vi.mocked(getCoInvestors).mockResolvedValue([mockOrg]);

    await topFundsHandler(createReq({ query: {} }), mockRes as any);

    const fund = mockRes.body.funds[0];
    expect(fund.portfolioCount).toBe(2);
    expect(fund.teamCount).toBe(1);
    expect(fund.coInvestorCount).toBe(1);
  });
});

// =========================================================================
// GET /api/pe/portfolio
// =========================================================================
describe('GET /api/pe/portfolio', () => {
  let mockRes: ReturnType<typeof createMockRes>;

  beforeEach(() => {
    mockRes = createMockRes();
    vi.clearAllMocks();
  });

  it('returns 400 when fundId missing', async () => {
    await portfolioHandler(createReq({ query: {} }), mockRes as any);
    expect(mockRes.statusCode).toBe(400);
    expect(mockRes.body.error).toContain('fundId');
  });

  it('returns 404 when fund not found', async () => {
    vi.mocked(findOrganizationById).mockResolvedValue(null);

    await portfolioHandler(
      createReq({ query: { fundId: fundObjectId.toString() } }),
      mockRes as any,
    );
    expect(mockRes.statusCode).toBe(404);
  });

  it('returns portfolio companies with investment details', async () => {
    vi.mocked(findOrganizationById).mockResolvedValue(mockOrg);
    vi.mocked(getPortfolioCompanies).mockResolvedValue([mockCompany]);
    vi.mocked(findRelationshipsForEntity).mockResolvedValue([mockRelationship]);

    await portfolioHandler(
      createReq({ query: { fundId: fundObjectId.toString() } }),
      mockRes as any,
    );

    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.body.fund.name).toBe('Blackstone');
    expect(mockRes.body.portfolioCompanies).toHaveLength(1);
    expect(mockRes.body.portfolioCompanies[0].name).toBe('Hilton');
    expect(mockRes.body.count).toBe(1);
  });
});

// =========================================================================
// GET /api/pe/team
// =========================================================================
describe('GET /api/pe/team', () => {
  let mockRes: ReturnType<typeof createMockRes>;

  beforeEach(() => {
    mockRes = createMockRes();
    vi.clearAllMocks();
  });

  it('returns 400 when fundId missing', async () => {
    await teamHandler(createReq({ query: {} }), mockRes as any);
    expect(mockRes.statusCode).toBe(400);
    expect(mockRes.body.error).toContain('fundId');
  });

  it('returns team sorted by role importance', async () => {
    const partner = {
      ...mockPerson,
      _id: new ObjectId('111111111111111111111111'),
      fullName: 'Partner Person',
    };
    const advisor = {
      ...mockPerson,
      _id: new ObjectId('222222222222222222222222'),
      fullName: 'Advisor Person',
    };

    vi.mocked(findOrganizationById).mockResolvedValue(mockOrg);
    vi.mocked(getFundTeam).mockResolvedValue([advisor, partner]);
    vi.mocked(findRelationshipsForEntity).mockResolvedValue([
      {
        ...mockPersonRelationship,
        sourceId: new ObjectId('111111111111111111111111'),
        sourceType: 'person',
        relationshipType: 'partner',
        metadata: { title: 'Senior Partner' },
      },
      {
        ...mockPersonRelationship,
        sourceId: new ObjectId('222222222222222222222222'),
        sourceType: 'person',
        relationshipType: 'advisor',
        metadata: { title: 'Senior Advisor' },
      },
    ]);

    await teamHandler(
      createReq({ query: { fundId: fundObjectId.toString() } }),
      mockRes as any,
    );

    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.body.team).toHaveLength(2);
    // Partners should come before advisors
    expect(mockRes.body.team[0].name).toBe('Partner Person');
    expect(mockRes.body.team[1].name).toBe('Advisor Person');
    expect(mockRes.body.fund.name).toBe('Blackstone');
  });
});
