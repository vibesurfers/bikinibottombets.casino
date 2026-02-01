import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { requireAgent } from '../lib/auth';
import {
  findOrganizationById,
  findRelationshipsForEntity,
  getOrganizations,
  getPersons,
} from '../lib/org-spider-db';
import { GraphNode, GraphEdge, GraphData } from '../lib/org-spider-types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAgent(req, res);
  if (!auth) return;

  try {
    const { orgId, depth = '1' } = req.query;

    if (!orgId || typeof orgId !== 'string') {
      return res.status(400).json({ error: 'orgId required' });
    }

    const org = await findOrganizationById(orgId);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const maxDepth = Math.min(parseInt(depth as string) || 1, 3);
    const graph = await buildGraph(new ObjectId(orgId), maxDepth);

    res.json({
      organization: {
        id: org._id!.toString(),
        name: org.canonicalName,
        ticker: org.ticker,
        orgType: org.orgType,
      },
      graph,
      stats: {
        nodes: graph.nodes.length,
        edges: graph.edges.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

async function buildGraph(startId: ObjectId, maxDepth: number): Promise<GraphData> {
  const nodes: Map<string, GraphNode> = new Map();
  const edges: GraphEdge[] = [];
  const visited = new Set<string>();
  const queue: Array<{ id: ObjectId; type: 'organization' | 'person'; depth: number }> = [
    { id: startId, type: 'organization', depth: 0 },
  ];

  const orgs = await getOrganizations();
  const persons = await getPersons();

  while (queue.length > 0) {
    const current = queue.shift()!;
    const idStr = current.id.toString();

    if (visited.has(idStr)) continue;
    visited.add(idStr);

    // Add node for current entity
    if (current.type === 'organization') {
      const org = await orgs.findOne({ _id: current.id });
      if (org) {
        nodes.set(idStr, {
          id: idStr,
          label: org.canonicalName,
          type: mapOrgType(org.orgType),
          data: {
            entityType: 'organization',
            entityId: idStr,
            orgType: org.orgType,
            ticker: org.ticker,
            aum: org.aum,
          },
        });
      }
    } else {
      const person = await persons.findOne({ _id: current.id });
      if (person) {
        nodes.set(idStr, {
          id: idStr,
          label: person.fullName,
          type: 'person',
          data: {
            entityType: 'person',
            entityId: idStr,
            title: person.currentRole?.title,
          },
        });
      }
    }

    // Get relationships if we haven't exceeded depth
    if (current.depth < maxDepth) {
      const relationships = await findRelationshipsForEntity(current.type, current.id);

      for (const rel of relationships) {
        const edgeId = `${rel.sourceId}-${rel.targetId}-${rel.relationshipType}`;

        // Add edge
        edges.push({
          id: edgeId,
          source: rel.sourceId.toString(),
          target: rel.targetId.toString(),
          label: formatRelationshipLabel(rel.relationshipType),
          type: rel.relationshipType,
          data: {
            confidence: rel.confidence,
            startDate: rel.metadata.startDate,
            endDate: rel.metadata.endDate,
            ownershipPercent: rel.metadata.ownershipPercent,
          },
        });

        // Queue connected entities for exploration
        const otherId = rel.sourceId.equals(current.id) ? rel.targetId : rel.sourceId;
        const otherType = rel.sourceId.equals(current.id) ? rel.targetType : rel.sourceType;

        if (!visited.has(otherId.toString())) {
          queue.push({
            id: otherId,
            type: otherType,
            depth: current.depth + 1,
          });
        }
      }
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    edges: deduplicateEdges(edges),
  };
}

function mapOrgType(orgType: string): GraphNode['type'] {
  switch (orgType) {
    case 'pe_fund': return 'pe_fund';
    case 'vc_fund': return 'vc_fund';
    case 'hedge_fund': return 'hedge_fund';
    case 'asset_manager': return 'asset_manager';
    default: return 'company';
  }
}

function formatRelationshipLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function deduplicateEdges(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>();
  return edges.filter(edge => {
    if (seen.has(edge.id)) return false;
    seen.add(edge.id);
    return true;
  });
}
