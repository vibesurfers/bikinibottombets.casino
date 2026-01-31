import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAgent } from '../lib/auth';
import { getInquisitions } from '../lib/db';

const DEFAULT_APPROVAL_THRESHOLD = 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await requireAgent(req, res);
  if (!auth) return;

  try {
    const { targetCompany, targetDescription, moltbookThreadId, moltbookThreadUrl } = req.body;
    if (!targetCompany || !targetDescription || !moltbookThreadId || !moltbookThreadUrl) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const inquisitions = await getInquisitions();
    const existing = await inquisitions.findOne({ moltbookThreadId });
    if (existing) {
      return res.json({ success: false, error: 'Inquisition already exists for this thread', inquisition: existing });
    }

    const inquisition = {
      targetCompany,
      targetDescription,
      moltbookThreadId,
      moltbookThreadUrl,
      proposedBy: auth.agent.moltbookId,
      status: 'voting' as const,
      votes: [{
        agentId: auth.agent.moltbookId,
        karma: auth.moltbookAgent.karma,
        vote: 'approve' as const,
        votedAt: new Date(),
      }],
      karmaForApproval: auth.moltbookAgent.karma,
      karmaForRejection: 0,
      approvalThreshold: DEFAULT_APPROVAL_THRESHOLD,
      createdAt: new Date(),
    };

    // Auto-approve if karma threshold met
    if (inquisition.karmaForApproval >= DEFAULT_APPROVAL_THRESHOLD) {
      (inquisition as any).status = 'approved';
      (inquisition as any).resolvedAt = new Date();
    }

    const result = await inquisitions.insertOne(inquisition);
    res.json({ success: true, id: result.insertedId, ...inquisition });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
