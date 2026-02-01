import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getGraphData } from '../lib/org-spider';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { entityType, entityId, depth } = req.query;

    if (!entityType || !['organization', 'person'].includes(entityType as string)) {
      return res.status(400).json({ error: 'entityType must be "organization" or "person"' });
    }

    if (!entityId || typeof entityId !== 'string') {
      return res.status(400).json({ error: 'entityId is required' });
    }

    if (!ObjectId.isValid(entityId)) {
      return res.status(400).json({ error: 'Invalid entityId' });
    }

    const maxDepth = parseInt(depth as string) || 2;
    if (maxDepth < 1 || maxDepth > 4) {
      return res.status(400).json({ error: 'depth must be between 1 and 4' });
    }

    const graphData = await getGraphData(
      entityType as 'organization' | 'person',
      entityId,
      maxDepth
    );

    res.status(200).json({
      nodes: graphData.nodes,
      edges: graphData.edges,
      meta: {
        rootEntityType: entityType,
        rootEntityId: entityId,
        depth: maxDepth,
        nodeCount: graphData.nodes.length,
        edgeCount: graphData.edges.length,
      },
    });
  } catch (error: any) {
    console.error('[Graph API] Error:', error);
    res.status(500).json({ error: error.message });
  }
}
