import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { createActor, createConnection, findActorBySlug, ensureMindmapIndexes } from '../../mindmap/lib/db';
import { getSeedActors, getSeedConnections, SeedSet } from '../../mindmap/lib/seed-data';
import { ConnectionCategory } from '../../mindmap/lib/types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { seedSet = 'all' } = req.body || {};
    if (!['yc', 'thiel', 'vc', 'ai', 'both', 'all'].includes(seedSet)) {
      return res.status(400).json({ error: 'seedSet must be "yc", "thiel", "vc", "ai", "both", or "all"' });
    }

    await ensureMindmapIndexes();

    const actors = getSeedActors(seedSet as SeedSet);
    const connections = getSeedConnections(seedSet as SeedSet);

    // Insert actors (skip duplicates)
    let actorsCreated = 0;
    let actorsSkipped = 0;
    const slugToId = new Map<string, ObjectId>();

    for (const actorInput of actors) {
      const existing = await findActorBySlug(actorInput.slug);
      if (existing) {
        slugToId.set(actorInput.slug, existing._id!);
        actorsSkipped++;
        continue;
      }

      const actor = await createActor(actorInput);
      slugToId.set(actorInput.slug, actor._id!);
      actorsCreated++;
    }

    // Insert connections
    let connectionsCreated = 0;
    let connectionsSkipped = 0;

    for (const connInput of connections) {
      const sourceId = slugToId.get(connInput.sourceSlug);
      const targetId = slugToId.get(connInput.targetSlug);

      if (!sourceId || !targetId) {
        connectionsSkipped++;
        continue;
      }

      try {
        await createConnection({
          sourceActorId: sourceId,
          targetActorId: targetId,
          category: connInput.category as ConnectionCategory,
          directed: connInput.directed,
          properties: (connInput.properties || {}) as any,
          confidence: connInput.confidence,
          evidence: [{
            sourceType: 'seed',
            excerpt: `Seed data: ${connInput.sourceSlug} -> ${connInput.targetSlug}`,
            extractedAt: new Date(),
          }],
        });
        connectionsCreated++;
      } catch (err: any) {
        // Duplicate key = already exists
        if (err.code === 11000) {
          connectionsSkipped++;
        } else {
          throw err;
        }
      }
    }

    res.json({
      success: true,
      seedSet,
      actors: { created: actorsCreated, skipped: actorsSkipped, total: actors.length },
      connections: { created: connectionsCreated, skipped: connectionsSkipped, total: connections.length },
    });
  } catch (error: any) {
    console.error('[Mindmap Seed] Error:', error);
    res.status(500).json({ error: error.message });
  }
}
