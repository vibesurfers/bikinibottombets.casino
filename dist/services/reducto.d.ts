export interface ParseResult {
    jobId: string;
    numPages: number;
    chunks: Array<{
        content: string;
        pageNumber?: number;
        metadata?: Record<string, unknown>;
    }>;
}
export declare function parseDocument(documentUrl: string): Promise<ParseResult>;
export declare function extractStructured(documentUrl: string, schema: Record<string, unknown>): Promise<Record<string, unknown>>;
