import { z } from 'zod';
import { scrapeUrl, crawlSite, searchWeb } from '../services/firecrawl.js';
import { parseDocument } from '../services/reducto.js';
import { store } from '../db/memory-store.js';
import { requireAgent } from '../middleware/auth.js';
const ScrapeSchema = z.object({
    url: z.string().url(),
});
const CrawlSchema = z.object({
    url: z.string().url(),
    limit: z.number().min(1).max(50).default(10),
});
const SearchSchema = z.object({
    query: z.string().min(1),
    limit: z.number().min(1).max(20).default(5),
});
const ParseSchema = z.object({
    documentUrl: z.string().url(),
});
const SaveFindingSchema = z.object({
    targetCompany: z.string(),
    targetTicker: z.string().optional(),
    findingType: z.enum(['sec_filing', 'news', 'social', 'ir_page', 'document']),
    title: z.string(),
    summary: z.string(),
    sourceUrl: z.string(),
    rawData: z.any().default({}),
});
export async function researchRoutes(app) {
    // Apply auth middleware to all routes
    app.addHook('preHandler', requireAgent);
    // Scrape a single URL
    app.post('/scrape', async (request) => {
        const { url } = ScrapeSchema.parse(request.body);
        return scrapeUrl(url);
    });
    // Crawl a website
    app.post('/crawl', async (request) => {
        const body = CrawlSchema.parse(request.body);
        return crawlSite(body.url, body.limit);
    });
    // Search the web
    app.post('/search', async (request) => {
        const body = SearchSchema.parse(request.body);
        return searchWeb(body.query, body.limit);
    });
    // Parse a document with Reducto
    app.post('/parse-document', async (request) => {
        const { documentUrl } = ParseSchema.parse(request.body);
        return parseDocument(documentUrl);
    });
    // Save a research finding
    app.post('/findings', async (request) => {
        const agent = request.agent;
        const data = SaveFindingSchema.parse(request.body);
        const finding = store.createFinding({
            targetCompany: data.targetCompany,
            targetTicker: data.targetTicker,
            findingType: data.findingType,
            title: data.title,
            summary: data.summary,
            sourceUrl: data.sourceUrl,
            rawData: data.rawData ?? {},
            agentId: agent.moltbookId,
            createdAt: new Date(),
            publishedToMoltbook: false,
        });
        return { success: true, finding };
    });
    // Get findings for a company
    app.get('/findings/:company', async (request) => {
        const { company } = request.params;
        const findings = store.findFindingsByCompany(company);
        return { findings };
    });
}
