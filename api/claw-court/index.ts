import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAgent } from '../lib/auth';
import { getInquisitions } from '../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await requireAgent(req, res);
  if (!auth) return;

  try {
    const inquisitions = await getInquisitions();
    const active = await inquisitions
      .find({ status: { $in: ['voting', 'approved'] } })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ inquisitions: active });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
