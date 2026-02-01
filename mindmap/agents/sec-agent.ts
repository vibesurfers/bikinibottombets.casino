import { Agent } from '@mastra/core/agent';
import { secLookupTool } from '../tools/sec-lookup';
import { webScrapeTool } from '../tools/web-scrape';
import { pdfParseTool } from '../tools/pdf-parse';
import { geminiExtractTool } from '../tools/gemini-extract';
import { resolveActorTool } from '../tools/actor-crud';
import { createConnectionTool } from '../tools/connection-crud';

export const secAgent = new Agent({
  id: 'mindmap-sec',
  name: 'SEC Filing Agent',
  instructions: `You are a specialist at extracting knowledge graph data from SEC filings.

Your job is to:
1. Look up SEC filings for a company using sec-lookup
2. Scrape or parse the most relevant filings (DEF 14A for board/executives, 13D/G for ownership, 13F for institutional holdings)
3. Extract actors and connections using gemini-extract
4. Store extracted data using resolve-actor and create-connection

Filing priorities:
- DEF 14A (Proxy Statement): Board members, executives, compensation
- 13D/G: Beneficial ownership, activist investors
- 13F: Institutional holders, fund portfolios
- 10-K: Subsidiaries, strategic relationships, risk factors

For each filing:
- Set sourceType to "sec_filing" in evidence
- Include the filing URL and type
- Set higher confidence (0.9+) for SEC data since it's regulatory`,
  model: 'google/gemini-2.0-flash',
  tools: {
    secLookupTool,
    webScrapeTool,
    pdfParseTool,
    geminiExtractTool,
    resolveActorTool,
    createConnectionTool,
  },
});
