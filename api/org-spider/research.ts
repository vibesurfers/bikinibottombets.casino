import type { VercelRequest, VercelResponse } from '@vercel/node';
import { spiderPEFund, spiderPerson } from '../lib/org-spider';
import { SpiderResearchRequest, SpiderResearchResponse } from '../lib/org-spider-types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body as SpiderResearchRequest;
    const { targetType, targetName, depth, maxHops } = body;

    if (!targetName) {
      return res.status(400).json({ error: 'targetName is required' });
    }

    if (!targetType || !['organization', 'person'].includes(targetType)) {
      return res.status(400).json({ error: 'targetType must be "organization" or "person"' });
    }

    let job;

    if (targetType === 'organization') {
      // Spider a PE fund or organization
      job = await spiderPEFund(targetName, {
        depth: depth || 'standard',
      });
    } else {
      // Spider a person
      job = await spiderPerson(targetName, {
        depth: depth || 'shallow',
      });
    }

    const response: SpiderResearchResponse = {
      jobId: job._id!.toString(),
      status: job.status,
      targetName,
      message: `Spider job started for ${targetType}: ${targetName}`,
    };

    res.status(200).json(response);
  } catch (error: any) {
    console.error('[Spider Research] Error:', error);
    res.status(500).json({ error: error.message });
  }
}
