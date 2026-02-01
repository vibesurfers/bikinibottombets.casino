import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import {
  findOrganizationById,
  getFundTeam,
  findRelationshipsForEntity,
} from '../lib/org-spider-db';

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
    const { fundId } = req.query;

    if (!fundId || typeof fundId !== 'string') {
      return res.status(400).json({ error: 'fundId is required' });
    }

    if (!ObjectId.isValid(fundId)) {
      return res.status(400).json({ error: 'Invalid fundId' });
    }

    const fund = await findOrganizationById(fundId);
    if (!fund) {
      return res.status(404).json({ error: 'Fund not found' });
    }

    const teamMembers = await getFundTeam(fundId);

    // Get relationship details (roles) for each person
    const relationships = await findRelationshipsForEntity('organization', new ObjectId(fundId), 'incoming');
    const personRels = relationships.filter(r => r.sourceType === 'person');

    const team = teamMembers.map(person => {
      const rel = personRels.find(r => r.sourceId.equals(person._id!));
      return {
        id: person._id!.toString(),
        name: person.fullName,
        linkedInUrl: person.linkedInUrl,
        biography: person.biography,
        education: person.education,
        role: rel ? {
          type: rel.relationshipType,
          title: rel.metadata.title,
          startDate: rel.metadata.startDate,
          confidence: rel.confidence,
        } : person.currentRole ? {
          type: 'employee',
          title: person.currentRole.title,
          startDate: person.currentRole.startDate,
        } : null,
      };
    });

    // Sort by role importance
    const roleOrder: Record<string, number> = {
      'partner': 1,
      'managing_director': 2,
      'executive': 3,
      'board_member': 4,
      'advisor': 5,
      'employee': 6,
    };

    team.sort((a, b) => {
      const aOrder = roleOrder[a.role?.type || 'employee'] || 99;
      const bOrder = roleOrder[b.role?.type || 'employee'] || 99;
      return aOrder - bOrder;
    });

    res.status(200).json({
      fund: {
        id: fund._id!.toString(),
        name: fund.canonicalName,
        ticker: fund.ticker,
      },
      team,
      count: team.length,
    });
  } catch (error: any) {
    console.error('[PE Team] Error:', error);
    res.status(500).json({ error: error.message });
  }
}
