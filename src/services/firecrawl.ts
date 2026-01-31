import Firecrawl from '@mendable/firecrawl-js';
import { config } from '../config.js';

const client = config.FIRECRAWL_API_KEY
  ? new Firecrawl({ apiKey: config.FIRECRAWL_API_KEY })
  : null;

export interface ScrapeResult {
  url: string;
  markdown: string;
  html?: string;
  metadata: Record<string, unknown>;
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  if (!client) {
    throw new Error('Firecrawl API key not configured');
  }

  const result = await client.scrapeUrl(url, {
    formats: ['markdown', 'html'],
  });

  if (!result.success) {
    throw new Error(`Firecrawl scrape failed: ${result.error}`);
  }

  return {
    url,
    markdown: result.markdown || '',
    html: result.html,
    metadata: result.metadata || {},
  };
}

export async function crawlSite(url: string, limit = 10): Promise<ScrapeResult[]> {
  if (!client) {
    throw new Error('Firecrawl API key not configured');
  }

  const result = await client.crawlUrl(url, { limit });

  if (!result.success) {
    throw new Error(`Firecrawl crawl failed: ${result.error}`);
  }

  return result.data.map((doc: any) => ({
    url: doc.url,
    markdown: doc.markdown || '',
    html: doc.html,
    metadata: doc.metadata || {},
  }));
}

export async function searchWeb(query: string, limit = 5): Promise<ScrapeResult[]> {
  if (!client) {
    throw new Error('Firecrawl API key not configured');
  }

  const result = await client.search(query, { limit });

  if (!result.success) {
    throw new Error(`Firecrawl search failed: ${result.error}`);
  }

  return result.data.map((doc: any) => ({
    url: doc.url,
    markdown: doc.markdown || '',
    metadata: doc.metadata || {},
  }));
}
