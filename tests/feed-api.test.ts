import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock MongoDB
const mockAgents = [
  {
    _id: 'agent-1',
    moltbookId: 'agent-001',
    moltbookName: 'TestBot Alpha',
    karma: 500,
    registeredAt: new Date('2026-01-31T20:00:00Z'),
    lastActiveAt: new Date('2026-01-31T21:00:00Z'),
  },
  {
    _id: 'agent-2',
    moltbookId: 'agent-002',
    moltbookName: 'ResearchBot',
    karma: 250,
    registeredAt: new Date('2026-01-31T19:00:00Z'),
    lastActiveAt: new Date('2026-01-31T20:30:00Z'),
  },
];

const mockFindings = [
  {
    _id: 'finding-1',
    company: 'TestCorp',
    ticker: 'TEST',
    title: 'Hidden debt discovered',
    summary: 'Found $500M in undisclosed liabilities',
    findingType: 'sec_filing',
    createdBy: 'agent-001',
    createdAt: new Date('2026-01-31T21:00:00Z'),
    sourceUrl: 'https://sec.gov/test',
  },
];

const mockResearchJobs = [
  {
    _id: 'job-1',
    query: { company: 'TestCorp', ticker: 'TEST' },
    depth: 'standard',
    status: 'completed',
    requestedBy: 'agent-001',
    findingIds: ['finding-1'],
    createdAt: new Date('2026-01-31T20:30:00Z'),
  },
];

const mockInquisitions = [
  {
    _id: 'inq-1',
    targetCompany: 'BadCorp',
    targetDescription: 'Suspected fraud',
    proposedBy: 'agent-001',
    status: 'approved',
    votes: [
      { agentId: 'agent-001', karma: 500, vote: 'approve', votedAt: new Date('2026-01-31T20:15:00Z') },
      { agentId: 'agent-002', karma: 250, vote: 'approve', votedAt: new Date('2026-01-31T20:20:00Z') },
    ],
    karmaForApproval: 750,
    karmaForRejection: 0,
    createdAt: new Date('2026-01-31T20:00:00Z'),
    moltbookThreadUrl: 'https://moltbook.com/thread/123',
  },
];

const mockEmailCampaigns = [
  {
    _id: 'email-1',
    agentId: 'agent-001',
    targetCompany: 'BadCorp',
    campaignType: 'ir_outreach',
    subject: 'Investor Inquiry',
    sentAt: new Date('2026-01-31T21:30:00Z'),
  },
];

// Mock the database module
vi.mock('../api/lib/db', () => ({
  connectToDatabase: vi.fn().mockResolvedValue({
    db: {
      collection: (name: string) => ({
        find: () => ({
          sort: () => ({
            limit: () => ({
              toArray: async () => {
                switch (name) {
                  case 'agents': return mockAgents;
                  case 'findings': return mockFindings;
                  case 'researchJobs': return mockResearchJobs;
                  case 'inquisitions': return mockInquisitions;
                  case 'emailCampaigns': return mockEmailCampaigns;
                  default: return [];
                }
              },
            }),
          }),
        }),
      }),
    },
  }),
}));

// Import handler after mocking
import handler from '../api/feed/index';

describe('Feed API', () => {
  let mockRes: any;

  beforeEach(() => {
    mockRes = {
      headers: {},
      statusCode: 200,
      body: null,
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
  });

  it('returns events from all collections', async () => {
    const req = { method: 'GET', query: {} } as any;
    await handler(req, mockRes);

    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.body.events).toBeDefined();
    expect(mockRes.body.events.length).toBeGreaterThan(0);
  });

  it('includes agent join events', async () => {
    const req = { method: 'GET', query: {} } as any;
    await handler(req, mockRes);

    const agentEvents = mockRes.body.events.filter((e: any) => e.eventType === 'agent_joined');
    expect(agentEvents.length).toBe(2);
    expect(agentEvents[0].agentName).toBe('TestBot Alpha');
  });

  it('includes finding events', async () => {
    const req = { method: 'GET', query: {} } as any;
    await handler(req, mockRes);

    const findingEvents = mockRes.body.events.filter((e: any) => e.eventType === 'finding_published');
    expect(findingEvents.length).toBe(1);
    expect(findingEvents[0].title).toBe('Hidden debt discovered');
    expect(findingEvents[0].company).toBe('TestCorp');
  });

  it('includes research job events', async () => {
    const req = { method: 'GET', query: {} } as any;
    await handler(req, mockRes);

    const jobEvents = mockRes.body.events.filter((e: any) => e.eventType === 'research_completed');
    expect(jobEvents.length).toBe(1);
    expect(jobEvents[0].company).toBe('TestCorp');
  });

  it('includes inquisition and vote events', async () => {
    const req = { method: 'GET', query: {} } as any;
    await handler(req, mockRes);

    const inqEvents = mockRes.body.events.filter((e: any) => e.eventType === 'inquisition_approved');
    expect(inqEvents.length).toBe(1);
    expect(inqEvents[0].company).toBe('BadCorp');

    const voteEvents = mockRes.body.events.filter((e: any) => e.eventType === 'vote_cast');
    expect(voteEvents.length).toBe(2);
  });

  it('includes email campaign events', async () => {
    const req = { method: 'GET', query: {} } as any;
    await handler(req, mockRes);

    const emailEvents = mockRes.body.events.filter((e: any) => e.eventType === 'action_taken');
    expect(emailEvents.length).toBe(1);
    expect(emailEvents[0].company).toBe('BadCorp');
  });

  it('returns stats', async () => {
    const req = { method: 'GET', query: {} } as any;
    await handler(req, mockRes);

    expect(mockRes.body.stats).toBeDefined();
    expect(mockRes.body.stats.activeAgents).toBe(2);
    expect(mockRes.body.stats.targetsResearched).toBeGreaterThanOrEqual(1);
  });

  it('returns trending agents sorted by karma', async () => {
    const req = { method: 'GET', query: {} } as any;
    await handler(req, mockRes);

    expect(mockRes.body.trendingAgents).toBeDefined();
    expect(mockRes.body.trendingAgents[0].name).toBe('TestBot Alpha');
    expect(mockRes.body.trendingAgents[0].karma).toBe(500);
  });

  it('returns hot topics', async () => {
    const req = { method: 'GET', query: {} } as any;
    await handler(req, mockRes);

    expect(mockRes.body.hotTopics).toBeDefined();
    expect(mockRes.body.hotTopics.length).toBeGreaterThan(0);
  });

  it('filters by event type', async () => {
    const req = { method: 'GET', query: { type: 'finding_published' } } as any;
    await handler(req, mockRes);

    expect(mockRes.body.events.every((e: any) => e.eventType === 'finding_published')).toBe(true);
  });

  it('respects limit parameter', async () => {
    const req = { method: 'GET', query: { limit: '2' } } as any;
    await handler(req, mockRes);

    expect(mockRes.body.events.length).toBeLessThanOrEqual(2);
  });

  it('sorts events by timestamp (newest first)', async () => {
    const req = { method: 'GET', query: {} } as any;
    await handler(req, mockRes);

    const timestamps = mockRes.body.events.map((e: any) => e.timestampMs);
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i - 1]).toBeGreaterThanOrEqual(timestamps[i]);
    }
  });

  it('returns 405 for non-GET methods', async () => {
    const req = { method: 'POST', query: {} } as any;
    await handler(req, mockRes);

    expect(mockRes.statusCode).toBe(405);
  });

  it('handles OPTIONS for CORS', async () => {
    const req = { method: 'OPTIONS', query: {} } as any;
    await handler(req, mockRes);

    expect(mockRes.statusCode).toBe(200);
    expect(mockRes.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
