import { ObjectId } from 'mongodb';
import {
  createActor,
  createConnection,
  findActorBySlug,
  ensureMindmapIndexes,
  enqueueCrawlItem,
} from '../lib/db';
import { getSeedActors, getSeedConnections, SeedSet } from '../lib/seed-data';
import { ConnectionCategory } from '../lib/types';

export interface SeedResult {
  actorsCreated: number;
  actorsSkipped: number;
  connectionsCreated: number;
  connectionsSkipped: number;
  queuedSearches: number;
}

/**
 * Seed the mindmap with initial actors and connections,
 * then queue web searches for each seed actor.
 */
export async function runSeedWorkflow(
  seedSet: SeedSet,
  jobId?: string
): Promise<SeedResult> {
  await ensureMindmapIndexes();

  const actors = getSeedActors(seedSet);
  const connections = getSeedConnections(seedSet);

  // Insert actors
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
      if (err.code === 11000) {
        connectionsSkipped++;
      } else {
        throw err;
      }
    }
  }

  // Queue web searches for each seed actor (if jobId provided)
  let queuedSearches = 0;
  if (jobId) {
    for (const [slug, actorId] of slugToId) {
      const actorInput = actors.find(a => a.slug === slug);
      if (!actorInput) continue;

      const searchQueries = generateSearchQueries(actorInput.canonicalName, actorInput.category, actorInput.subtype);
      for (const query of searchQueries) {
        await enqueueCrawlItem({
          jobId: new ObjectId(jobId),
          actorId,
          actorName: actorInput.canonicalName,
          itemType: 'web_search',
          searchQuery: query,
          priority: 100, // Seed actors get highest priority
        });
        queuedSearches++;
      }
    }
  }

  return { actorsCreated, actorsSkipped, connectionsCreated, connectionsSkipped, queuedSearches };
}

function generateSearchQueries(name: string, category: string, subtype: string): string[] {
  const queries: string[] = [];
  const quoted = `"${name}"`;

  if (category === 'fund' || subtype === 'vc_fund' || subtype === 'pe_fund') {
    queries.push(`${quoted} portfolio companies investments`);
    queries.push(`${quoted} team partners managing directors`);
  } else if (category === 'organization' && subtype === 'accelerator') {
    queries.push(`${quoted} alumni companies startups`);
    queries.push(`${quoted} partners mentors leadership`);
  } else if (category === 'organization') {
    queries.push(`${quoted} investors board members executives`);
    queries.push(`${quoted} funding rounds acquisitions partnerships`);
  } else if (category === 'person') {
    queries.push(`${quoted} companies founded investments board`);
    queries.push(`${quoted} career biography venture capital`);
  }

  return queries;
}
