import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { scrapeUrl } from '../../api/lib/services';

const SEC_EDGAR_BASE = 'https://efts.sec.gov/LATEST/search-index';
const SEC_FULL_TEXT = 'https://efts.sec.gov/LATEST/search-index';

export const secLookupTool = createTool({
  id: 'sec-lookup',
  description: 'Look up SEC EDGAR filings for a company. Returns recent filings like DEF 14A, 13D/G, 13F.',
  inputSchema: z.object({
    companyName: z.string().describe('Company name to search'),
    filingType: z.string().optional().describe('Filing type filter, e.g. "DEF 14A", "13D", "13F"'),
    limit: z.number().optional().default(5),
  }),
  outputSchema: z.object({
    filings: z.array(z.object({
      type: z.string(),
      date: z.string(),
      url: z.string(),
      description: z.string(),
    })),
  }),
  execute: async ({ context }) => {
    const { companyName, filingType, limit } = context;

    // Use SEC EDGAR full-text search
    const searchUrl = `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(companyName)}%22${filingType ? `&forms=${encodeURIComponent(filingType)}` : ''}&dateRange=custom&startdt=2020-01-01&enddt=2026-12-31`;

    try {
      const result = await scrapeUrl(`https://www.sec.gov/cgi-bin/browse-edgar?company=${encodeURIComponent(companyName)}&CIK=&type=${filingType || ''}&dateb=&owner=include&count=${limit}&search_text=&action=getcompany`);

      // Parse filing links from the SEC results page
      const filingPattern = /href="(\/Archives\/edgar\/data\/[^"]+)"[^>]*>([^<]+)/gi;
      const filings: Array<{ type: string; date: string; url: string; description: string }> = [];
      let match;

      while ((match = filingPattern.exec(result.markdown)) !== null && filings.length < limit) {
        filings.push({
          type: filingType || 'unknown',
          date: new Date().toISOString().split('T')[0],
          url: `https://www.sec.gov${match[1]}`,
          description: match[2].trim(),
        });
      }

      return { filings };
    } catch {
      return { filings: [] };
    }
  },
});
