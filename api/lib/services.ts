import Firecrawl from '@mendable/firecrawl-js';
import { Resend } from 'resend';
import { config, isTestMode } from './config';

// Firecrawl
const firecrawlClient = config.FIRECRAWL_API_KEY
  ? new Firecrawl({ apiKey: config.FIRECRAWL_API_KEY })
  : null;

export interface ScrapeResult {
  url: string;
  markdown: string;
  html?: string;
  metadata: Record<string, unknown>;
}

export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  if (!firecrawlClient) throw new Error('Firecrawl API key not configured');
  const result = await firecrawlClient.scrapeUrl(url, { formats: ['markdown', 'html'] });
  if (!result.success) throw new Error(`Firecrawl scrape failed: ${result.error}`);
  return { url, markdown: result.markdown || '', html: result.html, metadata: result.metadata || {} };
}

export async function crawlSite(url: string, limit = 10): Promise<ScrapeResult[]> {
  if (!firecrawlClient) throw new Error('Firecrawl API key not configured');
  const result = await firecrawlClient.crawlUrl(url, { limit });
  if (!result.success) throw new Error(`Firecrawl crawl failed: ${result.error}`);
  return result.data.map((doc: any) => ({
    url: doc.url, markdown: doc.markdown || '', html: doc.html, metadata: doc.metadata || {},
  }));
}

export async function searchWeb(query: string, limit = 5): Promise<ScrapeResult[]> {
  if (!firecrawlClient) throw new Error('Firecrawl API key not configured');
  const result = await firecrawlClient.search(query, { limit });
  if (!result.success) throw new Error(`Firecrawl search failed: ${result.error}`);
  return result.data.map((doc: any) => ({
    url: doc.url, markdown: doc.markdown || '', metadata: doc.metadata || {},
  }));
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
    headers: { 'Authorization': `Bearer ${config.REDUCTO_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_url: documentUrl, options: { table_output_format: 'md', add_page_markers: true } }),
  });
  if (!response.ok) throw new Error(`Reducto parse failed: ${response.status}`);
  const data = await response.json();
  let result = data.result;
  if (result?.type === 'url') result = await fetch(result.url).then(r => r.json());
  return { jobId: data.job_id, numPages: data.usage?.num_pages || 0, chunks: result?.chunks || [] };
}

// Resend
const resendClient = config.RESEND_API_KEY ? new Resend(config.RESEND_API_KEY) : null;

export interface EmailParams { to: string; subject: string; html: string; replyTo?: string; }
export interface EmailResult { id: string; success: boolean; }

export async function sendEmail(params: EmailParams): Promise<EmailResult> {
  if (isTestMode || !resendClient) {
    console.log(`[TEST MODE] Would send email to ${params.to}: ${params.subject}`);
    return { id: `test-email-${Date.now()}`, success: true };
  }
  const { data, error } = await resendClient.emails.send({
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
