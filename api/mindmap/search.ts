import type { VercelRequest, VercelResponse } from '@vercel/node';
import { searchMindmapActors } from '../../mindmap/lib/algolia-sync';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { q, category, limit } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'q (search query) parameter required' });
    }

    const results = await searchMindmapActors(q, {
      category: category as string | undefined,
      limit: parseInt(limit as string) || 20,
    });

    res.json(results);
  } catch (error: any) {
    console.error('[Mindmap Search] Error:', error);
    res.status(500).json({ error: error.message });
  }
}
