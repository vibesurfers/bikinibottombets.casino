import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import {
  findPersonById,
  findRelationshipsForEntity,
  searchPersons,
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
    const { id, query, organizationId, limit } = req.query;

    // Get by ID
    if (id && typeof id === 'string') {
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid person ID' });
      }

      const person = await findPersonById(id);
      if (!person) {
        return res.status(404).json({ error: 'Person not found' });
      }

      // Get relationships (role history)
      const relationships = await findRelationshipsForEntity('person', person._id!);

      return res.status(200).json({
        person: {
          id: person._id!.toString(),
          fullName: person.fullName,
          aliases: person.aliases,
          linkedInUrl: person.linkedInUrl,
          currentRole: person.currentRole ? {
            organizationId: person.currentRole.organizationId.toString(),
            title: person.currentRole.title,
            startDate: person.currentRole.startDate,
          } : null,
          biography: person.biography,
          education: person.education,
          createdAt: person.createdAt,
          updatedAt: person.updatedAt,
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

    // Search persons
    if (query && typeof query === 'string') {
      const persons = await searchPersons(
        query,
        organizationId as string | undefined,
        parseInt(limit as string) || 20
      );

      return res.status(200).json({
        persons: persons.map(person => ({
          id: person._id!.toString(),
          fullName: person.fullName,
          currentRole: person.currentRole ? {
            organizationId: person.currentRole.organizationId.toString(),
            title: person.currentRole.title,
          } : null,
          linkedInUrl: person.linkedInUrl,
        })),
        count: persons.length,
      });
    }

    return res.status(400).json({ error: 'Either id or query parameter is required' });
  } catch (error: any) {
    console.error('[Persons API] Error:', error);
    res.status(500).json({ error: error.message });
  }
}
