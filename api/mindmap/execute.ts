import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { runCrawlWorkflow } from '../../mindmap/workflows/crawl-workflow';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { jobId } = req.body || {};

    if (!jobId || !ObjectId.isValid(jobId)) {
      return res.status(400).json({ error: 'Valid jobId required' });
    }

    // Run the crawl workflow (long-running)
    await runCrawlWorkflow(jobId);

    res.json({ success: true, jobId, status: 'completed' });
  } catch (error: any) {
    console.error('[Mindmap Execute] Error:', error);
    res.status(500).json({ error: error.message });
  }
}
