import { ObjectId } from 'mongodb';
import {
  getActors,
  getConnections,
  findConnectionsForActor,
  enqueueCrawlItem,
} from '../lib/db';
import { Actor } from '../lib/types';
import { searchAndScrape } from '../../api/lib/services';
import { resolveActor } from '../lib/resolver';

/**
 * Cross-reference two actor networks to find shared actors and bridge connections.
 * Uses BFS from both roots, finds shared actors, then searches for explicit cross-references.
 */
export async function runCrossoverWorkflow(
  groupASlugs: string[],  // e.g., ['y-combinator']
  groupBSlugs: string[],  // e.g., ['peter-thiel', 'founders-fund']
  jobId?: string
): Promise<{
  sharedActors: Array<{ id: string; name: string; groupATags: string[]; groupBTags: string[] }>;
  bridgeConnections: number;
  newSearchesQueued: number;
}> {
  const actorsCol = await getActors();
  const connectionsCol = await getConnections();

  // BFS from group A roots
  const groupAActorIds = new Set<string>();
  const groupAQueue: string[] = [];

  for (const slug of groupASlugs) {
    const actor = await actorsCol.findOne({ slug });
    if (actor) {
      groupAActorIds.add(actor._id!.toString());
      groupAQueue.push(actor._id!.toString());
    }
  }

  // 2-hop BFS from group A
  await bfsExpand(groupAActorIds, groupAQueue, 2);

  // BFS from group B roots
  const groupBActorIds = new Set<string>();
  const groupBQueue: string[] = [];

  for (const slug of groupBSlugs) {
    const actor = await actorsCol.findOne({ slug });
    if (actor) {
      groupBActorIds.add(actor._id!.toString());
      groupBQueue.push(actor._id!.toString());
    }
  }

  await bfsExpand(groupBActorIds, groupBQueue, 2);

  // Find shared actors (in both groups)
  const sharedIds = [...groupAActorIds].filter(id => groupBActorIds.has(id));
  const sharedActors = [];

  for (const id of sharedIds) {
    const actor = await actorsCol.findOne({ _id: new ObjectId(id) });
    if (actor) {
      sharedActors.push({
        id: actor._id!.toString(),
        name: actor.canonicalName,
        groupATags: actor.tags.filter(t => t.startsWith('yc') || t === 'accelerator'),
        groupBTags: actor.tags.filter(t => t.includes('thiel') || t.includes('paypal')),
      });
    }
  }

  // Count bridge connections (connections between a group A actor and group B actor)
  const allConnections = await connectionsCol.find({}).toArray();
  let bridgeConnections = 0;

  for (const conn of allConnections) {
    const srcInA = groupAActorIds.has(conn.sourceActorId.toString());
    const tgtInA = groupAActorIds.has(conn.targetActorId.toString());
    const srcInB = groupBActorIds.has(conn.sourceActorId.toString());
    const tgtInB = groupBActorIds.has(conn.targetActorId.toString());

    if ((srcInA && tgtInB) || (srcInB && tgtInA)) {
      bridgeConnections++;
    }
  }

  // Queue explicit cross-reference searches
  let newSearchesQueued = 0;
  if (jobId) {
    for (const shared of sharedActors) {
      const actor = await actorsCol.findOne({ _id: new ObjectId(shared.id) });
      if (actor && !actor.lastCrawledAt) {
        await enqueueCrawlItem({
          jobId: new ObjectId(jobId),
          actorId: actor._id!,
          actorName: actor.canonicalName,
          itemType: 'web_search',
          searchQuery: `"${actor.canonicalName}" "Y Combinator" OR "Peter Thiel" OR "Founders Fund" OR "PayPal"`,
          priority: 150, // High priority for crossover searches
        });
        newSearchesQueued++;
      }
    }
  }

  return { sharedActors, bridgeConnections, newSearchesQueued };
}

async function bfsExpand(visited: Set<string>, queue: string[], maxDepth: number): Promise<void> {
  let depth = 0;

  while (queue.length > 0 && depth < maxDepth) {
    const nextQueue: string[] = [];

    for (const actorId of queue) {
      const connections = await findConnectionsForActor(actorId);

      for (const conn of connections) {
        const neighborId = conn.sourceActorId.toString() === actorId
          ? conn.targetActorId.toString()
          : conn.sourceActorId.toString();

        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          nextQueue.push(neighborId);
        }
      }
    }

    queue.length = 0;
    queue.push(...nextQueue);
    depth++;
  }
}
