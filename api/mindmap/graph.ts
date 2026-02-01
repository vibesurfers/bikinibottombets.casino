import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { buildGraph, buildFullGraph, BuildGraphOptions } from '../../mindmap/lib/graph-builder';
import { findActorBySlug } from '../../mindmap/lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      actorId,
      actorIds,
      slug,
      depth = '3',
      minConfidence,
      categories,
      maxNodes = '500',
      hubScores,
    } = req.query;

    const maxDepth = Math.min(parseInt(depth as string) || 3, 4);
    const nodesCap = Math.min(parseInt(maxNodes as string) || 500, 1000);

    // Build options
    const options: BuildGraphOptions = {
      maxDepth,
      maxNodes: nodesCap,
      includeHubScores: hubScores === 'true' || hubScores === '1',
    };

    if (minConfidence && typeof minConfidence === 'string') {
      const conf = parseFloat(minConfidence);
      if (!isNaN(conf)) options.minConfidence = conf;
    }

    if (categories && typeof categories === 'string') {
      options.categories = categories.split(',').map(c => c.trim()).filter(Boolean);
    }

    // Resolve root actor IDs
    let rootIds: string[] = [];

    // Option 1: slug lookup (cleanest for frontend)
    if (slug && typeof slug === 'string') {
      const actor = await findActorBySlug(slug);
      if (!actor) {
        return res.status(404).json({ error: `Actor with slug "${slug}" not found` });
      }
      rootIds = [actor._id!.toString()];
    }
    // Option 2: comma-separated actorIds
    else if (actorIds && typeof actorIds === 'string') {
      rootIds = actorIds.split(',').filter(id => ObjectId.isValid(id.trim()));
    }
    // Option 3: single actorId
    else if (actorId && typeof actorId === 'string') {
      if (!ObjectId.isValid(actorId)) {
        return res.status(400).json({ error: 'Invalid actorId' });
      }
      rootIds = [actorId];
    }

    // No root specified → full graph mode
    if (rootIds.length === 0) {
      const graph = await buildFullGraph(options);
      return res.json(graph);
    }

    const graph = await buildGraph(rootIds, maxDepth, options);
    res.json(graph);
  } catch (error: any) {
    console.error('[Mindmap Graph] Error:', error);
    res.status(500).json({ error: error.message });
  }
}
