import type { VercelRequest, VercelResponse } from '@vercel/node';
import algoliasearch from 'algoliasearch';

const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID || '2M5CP5WAEO';
const ALGOLIA_SEARCH_KEY = process.env.ALGOLIA_SEARCH_KEY || '93e87ef91169101673774ea919ae29e7';
const ALGOLIA_INDEX = 'agent_events';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const query = (req.query.q as string) || (req.body?.query as string) || '';
    const filters = (req.query.filters as string) || (req.body?.filters as string) || '';
    const page = parseInt((req.query.page as string) || '0', 10);
    const hitsPerPage = parseInt((req.query.limit as string) || '20', 10);

    const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_SEARCH_KEY);
    const index = client.initIndex(ALGOLIA_INDEX);

    const results = await index.search(query, {
      filters,
      page,
      hitsPerPage,
      attributesToRetrieve: [
        'objectID',
        'eventType',
        'title',
        'description',
        'agentName',
        'agentId',
        'company',
        'ticker',
        'karma',
        'timestamp',
        'timestampISO',
        'metadata',
      ],
      attributesToHighlight: ['title', 'description', 'agentName', 'company'],
    });

    return res.json({
      success: true,
      query,
      hits: results.hits,
      nbHits: results.nbHits,
      page: results.page,
      nbPages: results.nbPages,
      hitsPerPage: results.hitsPerPage,
      processingTimeMS: results.processingTimeMS,
    });
  } catch (error: any) {
    console.error('Algolia search error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Search failed',
    });
  }
}
