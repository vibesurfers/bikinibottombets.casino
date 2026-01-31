export interface ScrapeResult {
    url: string;
    markdown: string;
    html?: string;
    metadata: Record<string, unknown>;
}
export declare function scrapeUrl(url: string): Promise<ScrapeResult>;
export declare function crawlSite(url: string, limit?: number): Promise<ScrapeResult[]>;
export declare function searchWeb(query: string, limit?: number): Promise<ScrapeResult[]>;
