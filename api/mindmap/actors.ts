import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { findActorById, findActorBySlug, searchActors } from '../../mindmap/lib/db';
import { ActorCategory } from '../../mindmap/lib/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { id, slug, query, category, limit } = req.query;

    // Get by ID
    if (id && typeof id === 'string') {
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid actor ID' });
      }
      const actor = await findActorById(id);
      if (!actor) return res.status(404).json({ error: 'Actor not found' });
      return res.json({ actor: serializeActor(actor) });
    }

    // Get by slug
    if (slug && typeof slug === 'string') {
      const actor = await findActorBySlug(slug);
      if (!actor) return res.status(404).json({ error: 'Actor not found' });
      return res.json({ actor: serializeActor(actor) });
    }

    // Search
    if (query && typeof query === 'string') {
      const actors = await searchActors(
        query,
        category as ActorCategory | undefined,
        parseInt(limit as string) || 20
      );
      return res.json({
        actors: actors.map(serializeActor),
        count: actors.length,
      });
    }

    return res.status(400).json({ error: 'Provide id, slug, or query parameter' });
  } catch (error: any) {
    console.error('[Mindmap Actors] Error:', error);
    res.status(500).json({ error: error.message });
  }
}

function serializeActor(actor: any) {
  return {
    id: actor._id!.toString(),
    canonicalName: actor.canonicalName,
    aliases: actor.aliases,
    slug: actor.slug,
    category: actor.category,
    subtype: actor.subtype,
    properties: actor.properties,
    tags: actor.tags,
    connectionCount: actor.connectionCount,
    crawlDepth: actor.crawlDepth,
    createdAt: actor.createdAt,
    updatedAt: actor.updatedAt,
  };
}
