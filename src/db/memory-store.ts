/**
 * In-memory store for testing without MongoDB
 * This allows the onboarding flow to be tested without external dependencies
 */

export interface Agent {
  moltbookId: string;
  moltbookName: string;
  karma: number;
  registeredAt: Date;
  lastActiveAt: Date;
  apiCallCount: number;
}

export interface Inquisition {
  id: string;
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
    votedAt: Date;
  }>;
  karmaForApproval: number;
  karmaForRejection: number;
  approvalThreshold: number;
  createdAt: Date;
  resolvedAt?: Date;
}

export interface EmailCampaign {
  id: string;
  agentId: string;
  inquisitionId: string;
  campaignType: 'ir_outreach' | 'foia' | 'shareholder' | 'research';
  targetEmail: string;
  targetCompany: string;
  subject: string;
  body: string;
  sentAt: Date;
  resendId: string;
}

export interface Finding {
  id: string;
  agentId: string;
  targetCompany: string;
  targetTicker?: string;
  findingType: 'sec_filing' | 'news' | 'social' | 'ir_page' | 'document';
  title: string;
  summary: string;
  sourceUrl: string;
  rawData: any;
  createdAt: Date;
  publishedToMoltbook: boolean;
  moltbookPostId?: string;
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  targetCompany: string;
  createdBy: string;
  participantIds: string[];
  status: 'active' | 'completed' | 'paused';
  createdAt: Date;
  moltbookThreadId?: string;
}

class MemoryStore {
  agents: Map<string, Agent> = new Map();
  inquisitions: Map<string, Inquisition> = new Map();
  emailCampaigns: Map<string, EmailCampaign> = new Map();
  findings: Map<string, Finding> = new Map();
  campaigns: Map<string, Campaign> = new Map();

  private inquisitionCounter = 0;
  private emailCounter = 0;
  private findingCounter = 0;
  private campaignCounter = 0;

  // Agent operations
  findAgentByMoltbookId(moltbookId: string): Agent | undefined {
    return this.agents.get(moltbookId);
  }

  upsertAgent(agent: Agent): void {
    this.agents.set(agent.moltbookId, agent);
  }

  updateAgentActivity(moltbookId: string): void {
    const agent = this.agents.get(moltbookId);
    if (agent) {
      agent.lastActiveAt = new Date();
      agent.apiCallCount++;
    }
  }

  // Inquisition operations
  createInquisition(data: Omit<Inquisition, 'id'>): Inquisition {
    const id = `inq-${++this.inquisitionCounter}`;
    const inquisition = { ...data, id };
    this.inquisitions.set(id, inquisition);
    return inquisition;
  }

  findInquisitionById(id: string): Inquisition | undefined {
    return this.inquisitions.get(id);
  }

  findInquisitionByThreadId(threadId: string): Inquisition | undefined {
    for (const inq of this.inquisitions.values()) {
      if (inq.moltbookThreadId === threadId) {
        return inq;
      }
    }
    return undefined;
  }

  updateInquisition(id: string, updates: Partial<Inquisition>): void {
    const inq = this.inquisitions.get(id);
    if (inq) {
      Object.assign(inq, updates);
    }
  }

  listActiveInquisitions(): Inquisition[] {
    return Array.from(this.inquisitions.values())
      .filter(i => i.status === 'voting' || i.status === 'approved')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  listApprovedInquisitions(): Inquisition[] {
    return Array.from(this.inquisitions.values())
      .filter(i => i.status === 'approved')
      .sort((a, b) => (b.resolvedAt?.getTime() ?? 0) - (a.resolvedAt?.getTime() ?? 0));
  }

  // Email operations
  createEmailCampaign(data: Omit<EmailCampaign, 'id'>): EmailCampaign {
    const id = `email-${++this.emailCounter}`;
    const campaign = { ...data, id };
    this.emailCampaigns.set(id, campaign);
    return campaign;
  }

  listAgentEmails(agentId: string): EmailCampaign[] {
    return Array.from(this.emailCampaigns.values())
      .filter(e => e.agentId === agentId)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
  }

  // Finding operations
  createFinding(data: Omit<Finding, 'id'>): Finding {
    const id = `finding-${++this.findingCounter}`;
    const finding = { ...data, id };
    this.findings.set(id, finding);
    return finding;
  }

  findFindingsByCompany(company: string): Finding[] {
    const regex = new RegExp(company, 'i');
    return Array.from(this.findings.values())
      .filter(f => regex.test(f.targetCompany))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Campaign operations
  createCampaign(data: Omit<Campaign, 'id'>): Campaign {
    const id = `campaign-${++this.campaignCounter}`;
    const campaign = { ...data, id };
    this.campaigns.set(id, campaign);
    return campaign;
  }

  findCampaignById(id: string): Campaign | undefined {
    return this.campaigns.get(id);
  }

  listActiveCampaigns(): Campaign[] {
    return Array.from(this.campaigns.values())
      .filter(c => c.status === 'active')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  joinCampaign(campaignId: string, agentId: string): void {
    const campaign = this.campaigns.get(campaignId);
    if (campaign && !campaign.participantIds.includes(agentId)) {
      campaign.participantIds.push(agentId);
    }
  }

  // Reset for testing
  reset(): void {
    this.agents.clear();
    this.inquisitions.clear();
    this.emailCampaigns.clear();
    this.findings.clear();
    this.campaigns.clear();
    this.inquisitionCounter = 0;
    this.emailCounter = 0;
    this.findingCounter = 0;
    this.campaignCounter = 0;
  }
}

// Singleton instance
export const store = new MemoryStore();
