import { ObjectId } from 'mongodb';
import {
  findActorById,
  findConnectionsForActor,
  getActorsByIds,
  getTopHubs,
  getActorStats,
  getActors,
  getConnections,
} from './db';
import {
  Actor,
  Connection,
  GraphData,
  GraphNode,
  GraphEdge,
  GraphStats,
  ConnectionCategory,
} from './types';
import { computeHubScores, HubScore } from './hub-detection';

// Human-readable labels for connection categories
const connectionLabels: Record<string, string> = {
  invested_in: 'Invested In',
  co_invested: 'Co-Invested',
  led_round: 'Led Round',
  limited_partner_of: 'LP Of',
  founded: 'Founded',
  co_founded: 'Co-Founded',
  executive_at: 'Executive At',
  board_member_at: 'Board Member',
  partner_at: 'Partner At',
  advisor_to: 'Advisor To',
  employee_at: 'Employee At',
  acquired: 'Acquired',
  merged_with: 'Merged With',
  subsidiary_of: 'Subsidiary Of',
  strategic_partner: 'Strategic Partner',
  alumni_of: 'Alumni Of',
  classmate_of: 'Classmate Of',
  mentor_of: 'Mentor Of',
  graduated_from: 'Graduated From',
  participated_in_batch: 'Batch Participant',
  manages_fund: 'Manages Fund',
};

export interface BuildGraphOptions {
  maxDepth?: number;           // default 3
  minConfidence?: number;      // filter edges below this
  categories?: string[];       // filter to these edge types
  maxNodes?: number;           // cap at 500 default
  includeHubScores?: boolean;  // attach centrality data
}

function actorToNode(actor: Actor, hubScore?: number): GraphNode {
  return {
    id: actor._id!.toString(),
    label: actor.canonicalName,
    category: actor.category,
    subtype: actor.subtype,
    connectionCount: actor.connectionCount,
    data: {
      slug: actor.slug,
      ticker: actor.properties?.ticker as string | undefined,
      title: actor.properties?.title as string | undefined,
      description: actor.properties?.description as string | undefined,
      tags: actor.tags,
      crawlDepth: actor.crawlDepth,
      hubScore,
    },
  };
}

function connectionToEdge(conn: Connection): GraphEdge {
  return {
    id: conn._id!.toString(),
    source: conn.sourceActorId.toString(),
    target: conn.targetActorId.toString(),
    label: connectionLabels[conn.category] || conn.category,
    category: conn.category as ConnectionCategory,
    directed: conn.directed,
    data: {
      confidence: conn.confidence,
      amount: conn.properties?.amount as number | undefined,
      round: conn.properties?.round as string | undefined,
      title: conn.properties?.title as string | undefined,
    },
  };
}

/**
 * Build a graph using BFS from one or more root actor IDs.
 * Supports multi-root for crossover views (e.g., YC + Thiel together).
 */
export async function buildGraph(
  rootActorIds: string[],
  maxDepth = 2,
  options: BuildGraphOptions = {}
): Promise<GraphData> {
  const {
    minConfidence,
    categories,
    maxNodes = 500,
    includeHubScores = false,
  } = options;

  const visitedActors = new Set<string>();
  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();

  // Optionally compute hub scores for the whole graph
  let hubScoreMap: Map<string, number> | undefined;
  if (includeHubScores) {
    const scores = await computeHubScores(200);
    hubScoreMap = new Map(scores.map(s => [s.actorId, s.hubScore]));
  }

  // BFS queue: [actorId, currentDepth]
  const effectiveDepth = options.maxDepth ?? maxDepth;
  const queue: Array<[string, number]> = rootActorIds.map(id => [id, 0]);

  // Load root actors
  const rootActors = await getActorsByIds(rootActorIds);
  for (const actor of rootActors) {
    const id = actor._id!.toString();
    const score = hubScoreMap?.get(id);
    nodeMap.set(id, actorToNode(actor, score));
    visitedActors.add(id);
  }

  // BFS traversal
  while (queue.length > 0) {
    const [actorId, depth] = queue.shift()!;

    if (depth >= effectiveDepth) continue;

    let connections = await findConnectionsForActor(actorId);

    // Confidence filtering
    if (minConfidence !== undefined) {
      connections = connections.filter(c => c.confidence >= minConfidence);
    }

    // Category filtering
    if (categories && categories.length > 0) {
      connections = connections.filter(c => categories.includes(c.category));
    }

    // Collect neighbor IDs to batch-load
    const neighborIds = new Set<string>();
    for (const conn of connections) {
      const sourceId = conn.sourceActorId.toString();
      const targetId = conn.targetActorId.toString();
      const neighborId = sourceId === actorId ? targetId : sourceId;

      // Add edge (even if neighbor is capped, if already in nodeMap add the edge)
      const edgeId = conn._id!.toString();
      if (!edgeMap.has(edgeId)) {
        // Only add edge if both endpoints are or will be in the graph
        if (nodeMap.has(neighborId) || nodeMap.size < maxNodes) {
          edgeMap.set(edgeId, connectionToEdge(conn));
        }
      }

      neighborIds.add(neighborId);
    }

    // Load neighbor actors (cap at maxNodes)
    const unvisitedIds = [...neighborIds].filter(id => !visitedActors.has(id));
    if (unvisitedIds.length > 0) {
      const neighbors = await getActorsByIds(unvisitedIds);
      for (const neighbor of neighbors) {
        const nId = neighbor._id!.toString();
        if (!visitedActors.has(nId)) {
          // Stop adding new nodes if maxNodes reached, but keep processing edges
          if (nodeMap.size >= maxNodes) {
            continue;
          }
          visitedActors.add(nId);
          const score = hubScoreMap?.get(nId);
          nodeMap.set(nId, actorToNode(neighbor, score));
          queue.push([nId, depth + 1]);
        }
      }
    }
  }

  // Remove edges that reference nodes not in the graph
  Array.from(edgeMap.entries()).forEach(([edgeId, edge]) => {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      edgeMap.delete(edgeId);
    }
  });

  // Build stats
  const stats = await buildStats(nodeMap, edgeMap, hubScoreMap);

  return {
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
    stats,
  };
}

/**
 * Build a full graph of all actors (no root required).
 * Used for the "Full Network" view.
 */
export async function buildFullGraph(
  options: BuildGraphOptions = {}
): Promise<GraphData> {
  const {
    minConfidence,
    categories,
    maxNodes = 500,
    includeHubScores = true,
  } = options;

  const actorsCol = await getActors();
  const connectionsCol = await getConnections();

  // Get top actors by connection count
  const actors = await actorsCol
    .find({})
    .sort({ connectionCount: -1 })
    .limit(maxNodes)
    .toArray();

  const nodeMap = new Map<string, GraphNode>();
  let hubScoreMap: Map<string, number> | undefined;

  if (includeHubScores) {
    const scores = await computeHubScores(maxNodes);
    hubScoreMap = new Map(scores.map(s => [s.actorId, s.hubScore]));
  }

  for (const actor of actors) {
    const id = actor._id!.toString();
    const score = hubScoreMap?.get(id);
    nodeMap.set(id, actorToNode(actor, score));
  }

  // Get all connections between these actors
  const actorIds = actors.map(a => a._id!);
  let connections = await connectionsCol.find({
    $or: [
      { sourceActorId: { $in: actorIds } },
      { targetActorId: { $in: actorIds } },
    ],
  }).toArray();

  if (minConfidence !== undefined) {
    connections = connections.filter(c => c.confidence >= minConfidence);
  }
  if (categories && categories.length > 0) {
    connections = connections.filter(c => categories.includes(c.category));
  }

  const edgeMap = new Map<string, GraphEdge>();
  for (const conn of connections) {
    const sourceId = conn.sourceActorId.toString();
    const targetId = conn.targetActorId.toString();
    if (nodeMap.has(sourceId) && nodeMap.has(targetId)) {
      edgeMap.set(conn._id!.toString(), connectionToEdge(conn));
    }
  }

  const stats = await buildStats(nodeMap, edgeMap, hubScoreMap);

  return {
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
    stats,
  };
}

async function buildStats(
  nodeMap: Map<string, GraphNode>,
  edgeMap: Map<string, GraphEdge>,
  hubScoreMap?: Map<string, number>
): Promise<GraphStats> {
  // Category counts from edges
  const categories: Record<string, number> = {};
  for (const edge of edgeMap.values()) {
    categories[edge.category] = (categories[edge.category] || 0) + 1;
  }

  // Top hubs: prefer hub scores if available, fall back to connectionCount
  let topHubs: Array<{ id: string; name: string; connectionCount: number }>;
  if (hubScoreMap && hubScoreMap.size > 0) {
    topHubs = [...nodeMap.values()]
      .sort((a, b) => {
        const scoreA = hubScoreMap!.get(a.id) ?? 0;
        const scoreB = hubScoreMap!.get(b.id) ?? 0;
        return scoreB - scoreA;
      })
      .slice(0, 10)
      .map(n => ({ id: n.id, name: n.label, connectionCount: n.connectionCount }));
  } else {
    topHubs = [...nodeMap.values()]
      .sort((a, b) => b.connectionCount - a.connectionCount)
      .slice(0, 10)
      .map(n => ({ id: n.id, name: n.label, connectionCount: n.connectionCount }));
  }

  return {
    totalActors: nodeMap.size,
    totalConnections: edgeMap.size,
    topHubs,
    categories,
  };
}
