import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { scrapeUrl } from '../../api/lib/services';

export const webScrapeTool = createTool({
  id: 'web-scrape',
  description: 'Scrape a URL for its full content as markdown. Use for company websites, news articles, investor pages.',
  inputSchema: z.object({
    url: z.string().url().describe('URL to scrape'),
  }),
  outputSchema: z.object({
    url: z.string(),
    content: z.string(),
    title: z.string(),
  }),
  execute: async ({ context }) => {
    const result = await scrapeUrl(context.url);
    return {
      url: result.url,
      content: result.markdown.slice(0, 10000),
      title: (result.metadata?.title as string) || result.url,
    };
  },
});
