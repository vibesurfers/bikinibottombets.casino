import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSpiderJobStatus } from '../lib/org-spider';

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
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const job = await getSpiderJobStatus(id);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.status(200).json({
      id: job._id!.toString(),
      targetType: job.targetType,
      targetName: job.targetName,
      status: job.status,
      depth: job.depth,
      progress: job.progress,
      error: job.error,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    });
  } catch (error: any) {
    console.error('[Spider Job] Error:', error);
    res.status(500).json({ error: error.message });
  }
}
