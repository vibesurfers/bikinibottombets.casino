import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAgent } from '../lib/auth';
import { parseDocument } from '../lib/services';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await requireAgent(req, res);
  if (!auth) return;

  try {
    const { documentUrl } = req.body;
    if (!documentUrl) return res.status(400).json({ error: 'documentUrl required' });
    const result = await parseDocument(documentUrl);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
