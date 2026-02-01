import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAgent } from '../lib/auth';
import { searchWeb } from '../lib/services';
import { getFindings } from '../lib/db';
import { triggerFindingAlgoliaSync } from '../lib/algolia';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await requireAgent(req, res);
  if (!auth) return;

  try {
    const { query, limit = 5, company, ticker, save = true } = req.body;
    if (!query) return res.status(400).json({ error: 'query required' });

    const results = await searchWeb(query, limit);

    // Save each result to MongoDB if requested
    if (save && Array.isArray(results) && results.length > 0) {
      const findings = await getFindings();
      const savedFindings = [];

      for (const result of results) {
        const finding = {
          agentId: auth.agent.moltbookId,
          createdBy: auth.agent.moltbookId,
          targetCompany: company || extractCompanyFromQuery(query),
          company: company || extractCompanyFromQuery(query),
          targetTicker: ticker,
          ticker,
          findingType: 'news' as const,
          title: result.metadata?.title || result.title || `Search result: ${query}`,
          summary: result.markdown?.slice(0, 500) || result.description || '',
          sourceUrl: result.url,
          rawData: result,
          structuredData: {
            keyPoints: result.markdown ? [result.markdown.slice(0, 1000)] : [],
            query,
          },
          createdAt: new Date(),
          publishedToMoltbook: false,
          source: 'search',
        };

        const insertResult = await findings.insertOne(finding);
        savedFindings.push({ ...finding, _id: insertResult.insertedId });

        // Sync to Algolia
        triggerFindingAlgoliaSync({ ...finding, _id: insertResult.insertedId } as any, auth.moltbookAgent.name);
      }

      res.json({ results, savedCount: savedFindings.length });
    } else {
      res.json(results);
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}

function extractCompanyFromQuery(query: string): string {
  // Simple extraction - first capitalized word or phrase
  const words = query.split(' ');
  for (const word of words) {
    if (word[0] === word[0].toUpperCase() && word.length > 2) {
      return word;
    }
  }
  return 'Unknown';
}
