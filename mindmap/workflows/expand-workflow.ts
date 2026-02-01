import { ObjectId } from 'mongodb';
import {
  findActorById,
  findConnectionsForActor,
  getActors,
  enqueueCrawlItem,
} from '../lib/db';
import { calculateExpansionPriority } from '../lib/expansion-priority';
import { Actor } from '../lib/types';

/**
 * Expand a single actor: queue searches for its uncrawled neighbors
 * and for the actor itself if not yet crawled.
 */
export async function runExpandWorkflow(
  actorId: string,
  jobId: string
): Promise<{ queued: number }> {
  const actor = await findActorById(actorId);
  if (!actor) throw new Error('Actor not found');

  let queued = 0;

  // Queue searches for this actor if not crawled
  if (!actor.lastCrawledAt) {
    const queries = generateExpansionQueries(actor);
    for (const query of queries) {
      await enqueueCrawlItem({
        jobId: new ObjectId(jobId),
        actorId: actor._id!,
        actorName: actor.canonicalName,
        itemType: 'web_search',
        searchQuery: query,
        priority: calculateExpansionPriority(actor),
      });
      queued++;
    }
  }

  // Find uncrawled neighbors
  const connections = await findConnectionsForActor(actorId);
  const neighborIds = new Set<string>();

  for (const conn of connections) {
    const nId = conn.sourceActorId.toString() === actorId
      ? conn.targetActorId.toString()
      : conn.sourceActorId.toString();
    neighborIds.add(nId);
  }

  // Queue expansion for uncrawled neighbors
  const actorsCol = await getActors();
  const uncrawledNeighbors = await actorsCol.find({
    _id: { $in: [...neighborIds].map(id => new ObjectId(id)) },
    lastCrawledAt: { $exists: false },
  }).toArray();

  for (const neighbor of uncrawledNeighbors) {
    const queries = generateExpansionQueries(neighbor);
    const priority = calculateExpansionPriority(neighbor);

    for (const query of queries) {
      await enqueueCrawlItem({
        jobId: new ObjectId(jobId),
        actorId: neighbor._id!,
        actorName: neighbor.canonicalName,
        itemType: 'web_search',
        searchQuery: query,
        priority,
      });
      queued++;
    }
  }

  return { queued };
}

function generateExpansionQueries(actor: Actor): string[] {
  const name = actor.canonicalName;
  const quoted = `"${name}"`;

  if (actor.category === 'fund' || ['vc_fund', 'pe_fund', 'hedge_fund', 'asset_manager'].includes(actor.subtype)) {
    return [
      `${quoted} portfolio companies investments`,
      `${quoted} team partners managing directors limited partners`,
    ];
  }

  if (actor.subtype === 'accelerator') {
    return [
      `${quoted} alumni companies top startups batch`,
      `${quoted} partners mentors leadership team`,
    ];
  }

  if (actor.category === 'person') {
    return [
      `${quoted} companies founded investments boards angel`,
      `${quoted} career biography venture capital fund`,
    ];
  }

  // Default: organization
  return [
    `${quoted} investors board members executives leadership`,
    `${quoted} funding rounds acquisitions partnerships`,
  ];
}
