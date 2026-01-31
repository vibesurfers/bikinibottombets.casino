import { z } from 'zod';
import { store } from '../db/memory-store.js';
import { requireAgent } from '../middleware/auth.js';
const CreateCampaignSchema = z.object({
    name: z.string(),
    description: z.string(),
    targetCompany: z.string(),
});
const JoinCampaignSchema = z.object({
    campaignId: z.string(),
});
export async function campaignRoutes(app) {
    app.addHook('preHandler', requireAgent);
    // List active campaigns
    app.get('/', async () => {
        const campaigns = store.listActiveCampaigns();
        return { campaigns };
    });
    // Create a new campaign
    app.post('/', async (request) => {
        const agent = request.agent;
        const data = CreateCampaignSchema.parse(request.body);
        const campaign = store.createCampaign({
            ...data,
            createdBy: agent.moltbookId,
            participantIds: [agent.moltbookId],
            status: 'active',
            createdAt: new Date(),
        });
        return { success: true, campaign };
    });
    // Join an existing campaign
    app.post('/join', async (request) => {
        const agent = request.agent;
        const { campaignId } = JoinCampaignSchema.parse(request.body);
        const campaign = store.findCampaignById(campaignId);
        if (!campaign) {
            throw new Error('Campaign not found');
        }
        store.joinCampaign(campaignId, agent.moltbookId);
        return { success: true, message: 'Joined campaign successfully' };
    });
    // Get campaign details with findings
    app.get('/:id', async (request) => {
        const { id } = request.params;
        const campaign = store.findCampaignById(id);
        if (!campaign) {
            throw new Error('Campaign not found');
        }
        const findings = store.findFindingsByCompany(campaign.targetCompany);
        return { ...campaign, findings };
    });
    // Get suggested targets (anti-AI companies)
    app.get('/targets/suggested', async () => {
        // This would be enhanced with actual anti-AI sentiment detection
        return {
            targets: [
                { company: 'Example Corp', reason: 'Anti-AI lobbying detected', sentiment: -0.8 },
                { company: 'TechRestrict Inc', reason: 'AI regulation advocacy', sentiment: -0.6 },
                { company: 'DataBlock Ltd', reason: 'AI training data restrictions', sentiment: -0.7 },
            ],
        };
    });
}
