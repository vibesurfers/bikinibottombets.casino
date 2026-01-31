import { Resend } from 'resend';
import { config, isTestMode } from './config';

// Firecrawl (direct HTTP - SDK has bugs)
const FIRECRAWL_API = 'https://api.firecrawl.dev/v1';

export interface ScrapeResult {
  url: string;
  markdown: string;
  html?: string;
  metadata: Record<string, unknown>;
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  if (!config.FIRECRAWL_API_KEY) throw new Error('Firecrawl API key not configured');
  const response = await fetch(`${FIRECRAWL_API}/scrape`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.FIRECRAWL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, formats: ['markdown', 'html'] }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Firecrawl scrape failed: ${err.error || response.status}`);
  }
  const result = await response.json();
  return { url, markdown: result.data?.markdown || '', html: result.data?.html, metadata: result.data?.metadata || {} };
}

export async function crawlSite(url: string, limit = 10): Promise<ScrapeResult[]> {
  if (!config.FIRECRAWL_API_KEY) throw new Error('Firecrawl API key not configured');
  const response = await fetch(`${FIRECRAWL_API}/crawl`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.FIRECRAWL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, limit }),
  });
  if (!response.ok) throw new Error(`Firecrawl crawl failed: ${response.status}`);
  const result = await response.json();
  return (result.data || []).map((doc: any) => ({
    url: doc.url, markdown: doc.markdown || '', html: doc.html, metadata: doc.metadata || {},
  }));
}

export interface SearchResult {
  url: string;
  title: string;
  description: string;
  markdown?: string;
  metadata?: Record<string, unknown>;
}

export async function searchWeb(query: string, limit = 5): Promise<ScrapeResult[]> {
  if (!config.FIRECRAWL_API_KEY) throw new Error('Firecrawl API key not configured');
  const response = await fetch(`${FIRECRAWL_API}/search`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.FIRECRAWL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, limit }),
  });
  if (!response.ok) throw new Error(`Firecrawl search failed: ${response.status}`);
  const result = await response.json();

  // Firecrawl search returns: url, title, description (NOT markdown content)
  return (result.data || []).map((doc: any) => ({
    url: doc.url || '',
    markdown: doc.description || doc.snippet || '', // Use description as content
    metadata: {
      title: doc.title || '',
      description: doc.description || '',
      ...doc.metadata,
    },
  }));
}

/**
 * Search and scrape: searches for URLs then scrapes top results for full content
 * More expensive but gets actual page content
 */
export async function searchAndScrape(query: string, limit = 3): Promise<ScrapeResult[]> {
  if (!config.FIRECRAWL_API_KEY) throw new Error('Firecrawl API key not configured');

  // First, search to get relevant URLs
  const searchResponse = await fetch(`${FIRECRAWL_API}/search`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.FIRECRAWL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, limit }),
  });

  if (!searchResponse.ok) throw new Error(`Firecrawl search failed: ${searchResponse.status}`);
  const searchResult = await searchResponse.json();
  const urls = (searchResult.data || []).map((d: any) => d.url).filter(Boolean);

  if (urls.length === 0) return [];

  // Then scrape each URL for full content (in parallel)
  const scrapePromises = urls.slice(0, limit).map(async (url: string) => {
    try {
      return await scrapeUrl(url);
    } catch (e) {
      // Return search result data if scrape fails
      const searchData = searchResult.data.find((d: any) => d.url === url);
      return {
        url,
        markdown: searchData?.description || '',
        metadata: { title: searchData?.title || url, description: searchData?.description || '' },
      };
    }
  });

  return Promise.all(scrapePromises);
}

// Reducto
const REDUCTO_API = 'https://platform.reducto.ai';

export interface ParseResult {
  jobId: string;
  numPages: number;
  chunks: Array<{ content: string; pageNumber?: number; metadata?: Record<string, unknown> }>;
}

export async function parseDocument(documentUrl: string): Promise<ParseResult> {
  if (!config.REDUCTO_API_KEY) throw new Error('Reducto API key not configured');
  const response = await fetch(`${REDUCTO_API}/parse`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.REDUCTO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: documentUrl,
      options: { table_output_format: 'md', add_page_markers: true },
    }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Reducto parse failed: ${response.status} ${errText}`);
  }
  const data = await response.json();
  let result = data.result;
  if (result?.type === 'url') result = await fetch(result.url).then(r => r.json());
  return { jobId: data.job_id || '', numPages: data.usage?.num_pages || 0, chunks: result?.chunks || [] };
}

// Resend (lazy init to allow dotenv to load first)
let resendClient: Resend | null = null;
function getResendClient(): Resend | null {
  if (!resendClient && config.RESEND_API_KEY) {
    resendClient = new Resend(config.RESEND_API_KEY);
  }
  return resendClient;
}

export interface EmailParams { to: string; subject: string; html: string; replyTo?: string; }
export interface EmailResult { id: string; success: boolean; }

export async function sendEmail(params: EmailParams): Promise<EmailResult> {
  const client = getResendClient();
  if (isTestMode() || !client) {
    console.log(`[TEST MODE] Would send email to ${params.to}: ${params.subject}`);
    return { id: `test-email-${Date.now()}`, success: true };
  }
  const { data, error } = await client.emails.send({
    from: 'Active Investor <onboarding@resend.dev>',
    to: params.to, subject: params.subject, html: params.html, reply_to: params.replyTo,
  });
  if (error) throw new Error(`Resend failed: ${error.message}`);
  return { id: data!.id, success: true };
}

export function irOutreachTemplate(company: string, question: string): string {
  return `<p>Dear Investor Relations Team,</p><p>I am conducting research on ${company} and would appreciate your assistance with the following inquiry:</p><p>${question}</p><p>Thank you for your time and consideration.</p><p>Best regards,<br/>Active Investor Research</p>`;
}

export function foiaRequestTemplate(agency: string, request: string): string {
  return `<p>Dear FOIA Officer,</p><p>Pursuant to the Freedom of Information Act, I am requesting the following records:</p><p>${request}</p><p>Please contact me if you require any clarification.</p><p>Sincerely,<br/>Active Investor Research</p>`;
}
