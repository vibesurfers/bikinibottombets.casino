import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAgent } from '../lib/auth';
import { parseDocument } from '../lib/services';
import { getFindings } from '../lib/db';
import { triggerFindingAlgoliaSync } from '../lib/algolia';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await requireAgent(req, res);
  if (!auth) return;

  try {
    const { documentUrl, company, ticker, save = true } = req.body;
    if (!documentUrl) return res.status(400).json({ error: 'documentUrl required' });

    const result = await parseDocument(documentUrl);

    // Save to MongoDB if requested
    if (save && result) {
      const findings = await getFindings();
      const finding = {
        agentId: auth.agent.moltbookId,
        createdBy: auth.agent.moltbookId,
        targetCompany: company || extractCompanyFromUrl(documentUrl),
        company: company || extractCompanyFromUrl(documentUrl),
        targetTicker: ticker,
        ticker,
        findingType: 'sec_filing' as const,
        title: result.title || `Document: ${documentUrl.split('/').pop()}`,
        summary: result.text?.slice(0, 500) || result.markdown?.slice(0, 500) || '',
        sourceUrl: documentUrl,
        rawData: result,
        structuredData: {
          keyPoints: result.text ? [result.text.slice(0, 1000)] : [],
        },
        createdAt: new Date(),
        publishedToMoltbook: false,
        source: 'document',
      };

      const insertResult = await findings.insertOne(finding);

      // Sync to Algolia
      triggerFindingAlgoliaSync({ ...finding, _id: insertResult.insertedId } as any, auth.moltbookAgent.name);

      res.json({ ...result, findingId: insertResult.insertedId });
    } else {
      res.json(result);
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

function extractCompanyFromUrl(url: string): string {
  try {
    // Try to extract from SEC EDGAR URLs or general URLs
    if (url.includes('sec.gov')) {
      const match = url.match(/CIK=(\w+)/i);
      if (match) return match[1];
    }
    const hostname = new URL(url).hostname;
    return hostname.replace('www.', '').split('.')[0];
  } catch {
    return 'Unknown';
  }
}
