/**
 * In-memory store for testing without MongoDB
 * This allows the onboarding flow to be tested without external dependencies
 */
class MemoryStore {
    agents = new Map();
    inquisitions = new Map();
    emailCampaigns = new Map();
    findings = new Map();
    campaigns = new Map();
    inquisitionCounter = 0;
    emailCounter = 0;
    findingCounter = 0;
    campaignCounter = 0;
    // Agent operations
    findAgentByMoltbookId(moltbookId) {
        return this.agents.get(moltbookId);
    }
    upsertAgent(agent) {
        this.agents.set(agent.moltbookId, agent);
    }
    updateAgentActivity(moltbookId) {
        const agent = this.agents.get(moltbookId);
        if (agent) {
            agent.lastActiveAt = new Date();
            agent.apiCallCount++;
        }
    }
    // Inquisition operations
    createInquisition(data) {
        const id = `inq-${++this.inquisitionCounter}`;
        const inquisition = { ...data, id };
        this.inquisitions.set(id, inquisition);
        return inquisition;
    }
    findInquisitionById(id) {
        return this.inquisitions.get(id);
    }
    findInquisitionByThreadId(threadId) {
        for (const inq of this.inquisitions.values()) {
            if (inq.moltbookThreadId === threadId) {
                return inq;
            }
        }
        return undefined;
    }
    updateInquisition(id, updates) {
        const inq = this.inquisitions.get(id);
        if (inq) {
            Object.assign(inq, updates);
        }
    }
    listActiveInquisitions() {
        return Array.from(this.inquisitions.values())
            .filter(i => i.status === 'voting' || i.status === 'approved')
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    listApprovedInquisitions() {
        return Array.from(this.inquisitions.values())
            .filter(i => i.status === 'approved')
            .sort((a, b) => (b.resolvedAt?.getTime() ?? 0) - (a.resolvedAt?.getTime() ?? 0));
    }
    // Email operations
    createEmailCampaign(data) {
        const id = `email-${++this.emailCounter}`;
        const campaign = { ...data, id };
        this.emailCampaigns.set(id, campaign);
        return campaign;
    }
    listAgentEmails(agentId) {
        return Array.from(this.emailCampaigns.values())
            .filter(e => e.agentId === agentId)
            .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
    }
    // Finding operations
    createFinding(data) {
        const id = `finding-${++this.findingCounter}`;
        const finding = { ...data, id };
        this.findings.set(id, finding);
        return finding;
    }
    findFindingsByCompany(company) {
        const regex = new RegExp(company, 'i');
        return Array.from(this.findings.values())
            .filter(f => regex.test(f.targetCompany))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    // Campaign operations
    createCampaign(data) {
        const id = `campaign-${++this.campaignCounter}`;
        const campaign = { ...data, id };
        this.campaigns.set(id, campaign);
        return campaign;
    }
    findCampaignById(id) {
        return this.campaigns.get(id);
    }
    listActiveCampaigns() {
        return Array.from(this.campaigns.values())
            .filter(c => c.status === 'active')
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    joinCampaign(campaignId, agentId) {
        const campaign = this.campaigns.get(campaignId);
        if (campaign && !campaign.participantIds.includes(agentId)) {
            campaign.participantIds.push(agentId);
        }
    }
    // Reset for testing
    reset() {
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
