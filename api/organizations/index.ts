import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import {
  findOrganizationById,
  findRelationshipsForEntity,
  searchOrganizations,
} from '../lib/org-spider-db';
import { OrgType } from '../lib/org-spider-types';

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
    const { id, query, orgType, limit } = req.query;

    // Get by ID
    if (id && typeof id === 'string') {
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid organization ID' });
      }

      const org = await findOrganizationById(id);
      if (!org) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      // Get relationships
      const relationships = await findRelationshipsForEntity('organization', org._id!);

      return res.status(200).json({
        organization: {
          id: org._id!.toString(),
          canonicalName: org.canonicalName,
          aliases: org.aliases,
          ticker: org.ticker,
          cik: org.cik,
          orgType: org.orgType,
          aum: org.aum,
          investmentFocus: org.investmentFocus,
          headquarters: org.headquarters,
          website: org.website,
          description: org.description,
          foundedYear: org.foundedYear,
          createdAt: org.createdAt,
          updatedAt: org.updatedAt,
        },
        relationships: relationships.map(r => ({
          id: r._id!.toString(),
          sourceType: r.sourceType,
          sourceId: r.sourceId.toString(),
          targetType: r.targetType,
          targetId: r.targetId.toString(),
          relationshipType: r.relationshipType,
          confidence: r.confidence,
          metadata: r.metadata,
          firstSeen: r.firstSeen,
          lastVerified: r.lastVerified,
        })),
      });
    }

    // Search organizations
    if (query && typeof query === 'string') {
      const orgs = await searchOrganizations(
        query,
        orgType as OrgType | undefined,
        parseInt(limit as string) || 20
      );

      return res.status(200).json({
        organizations: orgs.map(org => ({
          id: org._id!.toString(),
          canonicalName: org.canonicalName,
          ticker: org.ticker,
          orgType: org.orgType,
          aum: org.aum,
          website: org.website,
        })),
        count: orgs.length,
      });
    }

    return res.status(400).json({ error: 'Either id or query parameter is required' });
  } catch (error: any) {
    console.error('[Organizations API] Error:', error);
    res.status(500).json({ error: error.message });
  }
}
