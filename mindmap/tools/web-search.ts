import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { searchWeb, searchAndScrape } from '../../api/lib/services';

export const webSearchTool = createTool({
  id: 'web-search',
  description: 'Search the web for information about an actor, company, fund, or person. Returns URLs and snippets.',
  inputSchema: z.object({
    query: z.string().describe('Search query'),
    limit: z.number().optional().default(5).describe('Max results'),
    scrapeResults: z.boolean().optional().default(false).describe('Whether to scrape full page content for top results'),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      url: z.string(),
      title: z.string(),
      content: z.string(),
    })),
  }),
  execute: async ({ context }) => {
    const { query, limit, scrapeResults } = context;
    if (scrapeResults) {
      const results = await searchAndScrape(query, limit);
      return {
        results: results.map(r => ({
          url: r.url,
          title: (r.metadata?.title as string) || r.url,
          content: r.markdown.slice(0, 5000),
        })),
      };
    }
    const results = await searchWeb(query, limit);
    return {
      results: results.map(r => ({
        url: r.url,
        title: (r.metadata?.title as string) || r.url,
        content: r.markdown.slice(0, 2000),
      })),
    };
  },
});
