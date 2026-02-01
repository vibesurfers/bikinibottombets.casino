import { getActors, getConnections } from './db';
import { Actor } from './types';

export interface HubScore {
  actorId: string;
  name: string;
  category: string;
  degree: number;            // Total connections
  inDegree: number;          // Incoming connections
  outDegree: number;         // Outgoing connections
  betweenness: number;       // Approximate betweenness centrality
  clusterCoefficient: number; // Local clustering coefficient
  hubScore: number;          // Composite score
}

/**
 * Compute hub scores for all actors.
 * Uses degree centrality + approximate betweenness + clustering.
 */
export async function computeHubScores(limit = 20): Promise<HubScore[]> {
  const [actorsCol, connectionsCol] = await Promise.all([
    getActors(),
    getConnections(),
  ]);

  const actors = await actorsCol.find({}).toArray();
  const connections = await connectionsCol.find({}).toArray();

  // Build adjacency lists
  const neighbors = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();

  for (const actor of actors) {
    const id = actor._id!.toString();
    neighbors.set(id, new Set());
    inDegree.set(id, 0);
    outDegree.set(id, 0);
  }

  for (const conn of connections) {
    const src = conn.sourceActorId.toString();
    const tgt = conn.targetActorId.toString();
    neighbors.get(src)?.add(tgt);
    neighbors.get(tgt)?.add(src);
    outDegree.set(src, (outDegree.get(src) || 0) + 1);
    inDegree.set(tgt, (inDegree.get(tgt) || 0) + 1);
  }

  const scores: HubScore[] = [];

  for (const actor of actors) {
    const id = actor._id!.toString();
    const neighSet = neighbors.get(id) || new Set();
    const degree = neighSet.size;
    const inDeg = inDegree.get(id) || 0;
    const outDeg = outDegree.get(id) || 0;

    // Local clustering coefficient
    let clusterCoefficient = 0;
    if (degree >= 2) {
      const neighArr = [...neighSet];
      let triangles = 0;
      for (let i = 0; i < neighArr.length; i++) {
        for (let j = i + 1; j < neighArr.length; j++) {
          if (neighbors.get(neighArr[i])?.has(neighArr[j])) {
            triangles++;
          }
        }
      }
      const possibleTriangles = (degree * (degree - 1)) / 2;
      clusterCoefficient = possibleTriangles > 0 ? triangles / possibleTriangles : 0;
    }

    // Approximate betweenness using degree-based heuristic
    // (True betweenness is O(n*m) which is too expensive for a serverless function)
    const betweenness = degree * (1 - clusterCoefficient);

    // Composite hub score
    const hubScore =
      degree * 10 +              // Raw connectivity
      betweenness * 5 +          // Bridge potential
      outDeg * 3 +               // Active connector
      clusterCoefficient * -2;   // Dense clusters are less interesting as hubs

    scores.push({
      actorId: id,
      name: actor.canonicalName,
      category: actor.category,
      degree,
      inDegree: inDeg,
      outDegree: outDeg,
      betweenness,
      clusterCoefficient,
      hubScore,
    });
  }

  return scores.sort((a, b) => b.hubScore - a.hubScore).slice(0, limit);
}

/**
 * Find bridge actors that connect two subgraphs (e.g., YC and Thiel networks)
 */
export async function findBridgeActors(
  groupATags: string[],
  groupBTags: string[]
): Promise<Actor[]> {
  const actorsCol = await getActors();

  // Find actors that have tags from BOTH groups
  return actorsCol.find({
    $and: [
      { tags: { $in: groupATags } },
      { tags: { $in: groupBTags } },
    ],
  }).toArray();
}
