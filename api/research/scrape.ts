import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAgent } from '../lib/auth';
import { scrapeUrl } from '../lib/services';
import { getFindings } from '../lib/db';
import { triggerFindingAlgoliaSync } from '../lib/algolia';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAgent(req, res);
  if (!auth) return;

  try {
    const { url, company, ticker, save = true } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });

    const result = await scrapeUrl(url);

    // Save to MongoDB if requested
    if (save && result) {
      const findings = await getFindings();
      const finding = {
        agentId: auth.agent.moltbookId,
        createdBy: auth.agent.moltbookId,
        targetCompany: company || extractCompanyFromUrl(url),
        company: company || extractCompanyFromUrl(url),
        targetTicker: ticker,
        ticker,
        findingType: 'ir_page' as const,
        title: result.metadata?.title || `Scraped: ${url}`,
        summary: result.markdown?.slice(0, 500) || '',
        sourceUrl: url,
        rawData: result,
        structuredData: {
          keyPoints: result.markdown ? [result.markdown.slice(0, 1000)] : [],
        },
        createdAt: new Date(),
        publishedToMoltbook: false,
        source: 'scrape',
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
    const hostname = new URL(url).hostname;
    return hostname.replace('www.', '').split('.')[0];
  } catch {
    return 'Unknown';
  }
}
