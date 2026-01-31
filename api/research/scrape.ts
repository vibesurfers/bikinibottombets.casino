import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAgent } from '../lib/auth';
import { scrapeUrl } from '../lib/services';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAgent(req, res);
  if (!auth) return;

  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });
    const result = await scrapeUrl(url);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
