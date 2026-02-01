import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { findCrawlJobById, getQueueStats } from '../../mindmap/lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { jobId } = req.query;

    if (!jobId || typeof jobId !== 'string' || !ObjectId.isValid(jobId)) {
      return res.status(400).json({ error: 'Valid jobId parameter required' });
    }

    const job = await findCrawlJobById(jobId);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const queueStats = await getQueueStats(jobId);

    res.json({
      jobId: job._id!.toString(),
      status: job.status,
      progress: job.progress,
      queue: queueStats,
      seedNames: job.seedNames,
      error: job.error,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    });
  } catch (error: any) {
    console.error('[Mindmap Status] Error:', error);
    res.status(500).json({ error: error.message });
  }
}
