import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { findConnectionsForActor, findActorById, getActorsByIds } from '../../mindmap/lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { actorId, direction = 'both' } = req.query;

    if (!actorId || typeof actorId !== 'string') {
      return res.status(400).json({ error: 'actorId parameter required' });
    }

    if (!ObjectId.isValid(actorId)) {
      return res.status(400).json({ error: 'Invalid actorId' });
    }

    const connections = await findConnectionsForActor(
      actorId,
      direction as 'outgoing' | 'incoming' | 'both'
    );

    // Collect unique actor IDs to resolve names
    const actorIds = new Set<string>();
    for (const c of connections) {
      actorIds.add(c.sourceActorId.toString());
      actorIds.add(c.targetActorId.toString());
    }

    const actors = await getActorsByIds([...actorIds]);
    const actorMap = new Map(actors.map(a => [a._id!.toString(), a]));

    res.json({
      connections: connections.map(c => ({
        id: c._id!.toString(),
        sourceActorId: c.sourceActorId.toString(),
        sourceActorName: actorMap.get(c.sourceActorId.toString())?.canonicalName || 'Unknown',
        targetActorId: c.targetActorId.toString(),
        targetActorName: actorMap.get(c.targetActorId.toString())?.canonicalName || 'Unknown',
        category: c.category,
        directed: c.directed,
        confidence: c.confidence,
        properties: c.properties,
        firstSeen: c.firstSeen,
        lastVerified: c.lastVerified,
      })),
      count: connections.length,
    });
  } catch (error: any) {
    console.error('[Mindmap Connections] Error:', error);
    res.status(500).json({ error: error.message });
  }
}
