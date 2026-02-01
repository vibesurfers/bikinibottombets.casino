import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getActorStats, getTopHubs } from '../../mindmap/lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const [stats, hubs] = await Promise.all([
      getActorStats(),
      getTopHubs(10),
    ]);

    res.json({
      totalActors: stats.totalActors,
      totalConnections: stats.totalConnections,
      byCategory: stats.byCategory,
      topHubs: hubs.map(h => ({
        id: h._id!.toString(),
        name: h.canonicalName,
        category: h.category,
        subtype: h.subtype,
        connectionCount: h.connectionCount,
      })),
    });
  } catch (error: any) {
    console.error('[Mindmap Stats] Error:', error);
    res.status(500).json({ error: error.message });
  }
}
