import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAgent } from '../lib/auth';
import { findSpiderJobById } from '../lib/org-spider-db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAgent(req, res);
  if (!auth) return;

  try {
    const { jobId } = req.query;

    if (!jobId || typeof jobId !== 'string') {
      return res.status(400).json({ error: 'jobId required' });
    }

    const job = await findSpiderJobById(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Spider job not found' });
    }

    res.json({
      jobId: job._id!.toString(),
      targetName: job.targetName,
      targetId: job.targetId.toString(),
      status: job.status,
      progress: job.progress,
      error: job.error,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
