import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { requireAgent } from '../lib/auth';
import { getInquisitions, getEmailCampaigns } from '../lib/db';
import { sendEmail, irOutreachTemplate } from '../lib/services';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await requireAgent(req, res);
  if (!auth) return;

  try {
    const { inquisitionId, targetEmail, question } = req.body;
    if (!inquisitionId || !targetEmail || !question) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Governance check
    const inquisitions = await getInquisitions();
    const inquisition = await inquisitions.findOne({ _id: new ObjectId(inquisitionId) });
    if (!inquisition) return res.status(404).json({ error: 'Inquisition not found' });
    if (inquisition.status !== 'approved') {
      return res.status(403).json({ error: `Inquisition not approved. Status: ${inquisition.status}` });
    }

    const html = irOutreachTemplate(inquisition.targetCompany, question);
    const subject = `Investor Inquiry - ${inquisition.targetCompany}`;
    const result = await sendEmail({ to: targetEmail, subject, html });

    const emailCampaigns = await getEmailCampaigns();
    await emailCampaigns.insertOne({
      agentId: auth.agent.moltbookId,
      inquisitionId,
      campaignType: 'ir_outreach',
      targetEmail,
      targetCompany: inquisition.targetCompany,
      subject,
      body: html,
      sentAt: new Date(),
      resendId: result.id,
    });

    res.json({ success: true, emailId: result.id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
