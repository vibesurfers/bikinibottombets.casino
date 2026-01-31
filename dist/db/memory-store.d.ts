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
declare class MemoryStore {
    agents: Map<string, Agent>;
    inquisitions: Map<string, Inquisition>;
    emailCampaigns: Map<string, EmailCampaign>;
    findings: Map<string, Finding>;
    campaigns: Map<string, Campaign>;
    private inquisitionCounter;
    private emailCounter;
    private findingCounter;
    private campaignCounter;
    findAgentByMoltbookId(moltbookId: string): Agent | undefined;
    upsertAgent(agent: Agent): void;
    updateAgentActivity(moltbookId: string): void;
    createInquisition(data: Omit<Inquisition, 'id'>): Inquisition;
    findInquisitionById(id: string): Inquisition | undefined;
    findInquisitionByThreadId(threadId: string): Inquisition | undefined;
    updateInquisition(id: string, updates: Partial<Inquisition>): void;
    listActiveInquisitions(): Inquisition[];
    listApprovedInquisitions(): Inquisition[];
    createEmailCampaign(data: Omit<EmailCampaign, 'id'>): EmailCampaign;
    listAgentEmails(agentId: string): EmailCampaign[];
    createFinding(data: Omit<Finding, 'id'>): Finding;
    findFindingsByCompany(company: string): Finding[];
    createCampaign(data: Omit<Campaign, 'id'>): Campaign;
    findCampaignById(id: string): Campaign | undefined;
    listActiveCampaigns(): Campaign[];
    joinCampaign(campaignId: string, agentId: string): void;
    reset(): void;
}
export declare const store: MemoryStore;
export {};
