import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAgent } from '../lib/auth';
import { getCampaigns } from '../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await requireAgent(req, res);
  if (!auth) return;

  try {
    const campaigns = await getCampaigns();

    if (req.method === 'GET') {
      const active = await campaigns.find({ status: 'active' }).sort({ createdAt: -1 }).toArray();
      return res.json({ campaigns: active });
    }

    if (req.method === 'POST') {
      const { name, description, targetCompany } = req.body;
      if (!name || !description || !targetCompany) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const campaign = {
        name,
        description,
        targetCompany,
        createdBy: auth.agent.moltbookId,
        participantIds: [auth.agent.moltbookId],
        status: 'active' as const,
        createdAt: new Date(),
      };

      const result = await campaigns.insertOne(campaign);
      return res.json({ success: true, id: result.insertedId, ...campaign });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
