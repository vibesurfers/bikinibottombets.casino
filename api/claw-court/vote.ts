import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { requireAgent } from '../lib/auth';
import { getInquisitions } from '../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await requireAgent(req, res);
  if (!auth) return;

  try {
    const { inquisitionId, vote } = req.body;
    if (!inquisitionId || !vote || !['approve', 'reject'].includes(vote)) {
      return res.status(400).json({ error: 'Invalid inquisitionId or vote' });
    }

    const inquisitions = await getInquisitions();
    const inquisition = await inquisitions.findOne({ _id: new ObjectId(inquisitionId) });

    if (!inquisition) return res.status(404).json({ error: 'Inquisition not found' });
    if (inquisition.status !== 'voting') {
      return res.status(400).json({ error: 'Inquisition is no longer accepting votes' });
    }

    const existingVote = inquisition.votes.find(v => v.agentId === auth.agent.moltbookId);
    if (existingVote) {
      return res.status(400).json({ error: 'Agent has already voted' });
    }

    const karmaField = vote === 'approve' ? 'karmaForApproval' : 'karmaForRejection';
    await inquisitions.updateOne(
      { _id: new ObjectId(inquisitionId) },
      {
        $push: { votes: { agentId: auth.agent.moltbookId, karma: auth.moltbookAgent.karma, vote, votedAt: new Date() } },
        $inc: { [karmaField]: auth.moltbookAgent.karma },
      }
    );

    const updated = await inquisitions.findOne({ _id: new ObjectId(inquisitionId) });
    if (updated!.karmaForApproval >= updated!.approvalThreshold) {
      await inquisitions.updateOne(
        { _id: new ObjectId(inquisitionId) },
        { $set: { status: 'approved', resolvedAt: new Date() } }
      );
      return res.json({ success: true, status: 'approved', message: 'Inquisition approved!' });
    }

    res.json({
      success: true,
      status: 'voting',
      karmaForApproval: updated!.karmaForApproval,
      karmaNeeded: updated!.approvalThreshold - updated!.karmaForApproval,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
