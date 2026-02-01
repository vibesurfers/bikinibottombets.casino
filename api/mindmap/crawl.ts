import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { createCrawlJob, findActorBySlug, findActorById } from '../../mindmap/lib/db';
import { resolveActor } from '../../mindmap/lib/resolver';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { actorIds, actorSlugs, actorNames, maxDepth = 2, maxActors = 100 } = req.body || {};

    // Resolve actor IDs from various inputs
    const seedActorIds: ObjectId[] = [];
    const seedNames: string[] = [];

    if (actorIds && Array.isArray(actorIds)) {
      for (const id of actorIds) {
        if (ObjectId.isValid(id)) {
          const actor = await findActorById(id);
          if (actor) {
            seedActorIds.push(actor._id!);
            seedNames.push(actor.canonicalName);
          }
        }
      }
    }

    if (actorSlugs && Array.isArray(actorSlugs)) {
      for (const slug of actorSlugs) {
        const actor = await findActorBySlug(slug);
        if (actor) {
          seedActorIds.push(actor._id!);
          seedNames.push(actor.canonicalName);
        }
      }
    }

    if (actorNames && Array.isArray(actorNames)) {
      for (const name of actorNames) {
        const result = await resolveActor({ name, createIfNotFound: true });
        if (result.actor) {
          seedActorIds.push(result.actor._id!);
          seedNames.push(result.actor.canonicalName);
        }
      }
    }

    if (seedActorIds.length === 0) {
      return res.status(400).json({ error: 'No valid actors found. Provide actorIds, actorSlugs, or actorNames.' });
    }

    const job = await createCrawlJob({
      seedActorIds,
      seedNames,
      status: 'pending',
      maxDepth: Math.min(maxDepth, 4),
      maxActors: Math.min(maxActors, 500),
    });

    res.json({
      success: true,
      jobId: job._id!.toString(),
      seedActors: seedNames,
      status: 'pending',
    });
  } catch (error: any) {
    console.error('[Mindmap Crawl] Error:', error);
    res.status(500).json({ error: error.message });
  }
}
