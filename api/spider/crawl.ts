import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAgent } from '../lib/auth';
import {
  createSpiderJob,
  setSpiderJobError,
} from '../lib/org-spider-db';
import { resolveOrganization } from '../lib/org-resolver';
import { runSpiderJob } from '../lib/spider-runner';
import { SpiderDepth } from '../lib/org-spider-types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAgent(req, res);
  if (!auth) return;

  try {
    const { targetName, targetType = 'organization', depth = 'shallow', maxHops = 1 } = req.body;

    if (!targetName) {
      return res.status(400).json({ error: 'targetName required' });
    }

    // Resolve or create the target organization
    const resolved = await resolveOrganization({
      name: targetName,
      createIfNotFound: true,
      orgType: 'pe_fund',
    });

    if (!resolved.entity) {
      return res.status(500).json({ error: 'Failed to resolve target organization' });
    }

    // Create spider job
    const job = await createSpiderJob({
      targetType,
      targetId: resolved.entity._id!,
      targetName: resolved.entity.canonicalName,
      depth: depth as SpiderDepth,
      maxHops,
      status: 'pending',
    });

    // Run spider synchronously (Vercel kills background tasks)
    try {
      await runSpiderJob(job._id!.toString());
      const completedJob = await import('../lib/org-spider-db').then(m => m.findSpiderJobById(job._id!));

      res.json({
        success: true,
        jobId: job._id!.toString(),
        targetName: resolved.entity.canonicalName,
        targetId: resolved.entity._id!.toString(),
        status: completedJob?.status || 'completed',
        progress: completedJob?.progress,
      });
    } catch (err: any) {
      await setSpiderJobError(job._id!, err.message);
      res.json({
        success: false,
        jobId: job._id!.toString(),
        targetName: resolved.entity.canonicalName,
        status: 'failed',
        error: err.message,
      });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
