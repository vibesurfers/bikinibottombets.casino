import { config } from '../config.js';
const REDUCTO_API = 'https://platform.reducto.ai';
export async function parseDocument(documentUrl) {
    if (!config.REDUCTO_API_KEY) {
        throw new Error('Reducto API key not configured');
    }
    const response = await fetch(`${REDUCTO_API}/parse`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.REDUCTO_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            document_url: documentUrl,
            options: {
                table_output_format: 'md',
                add_page_markers: true,
            },
        }),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Reducto parse failed: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    // Handle large results returned as URL
    let result = data.result;
    if (result && result.type === 'url') {
        const fullResult = await fetch(result.url).then(r => r.json());
        result = fullResult;
    }
    return {
        jobId: data.job_id,
        numPages: data.usage?.num_pages || 0,
        chunks: result?.chunks || [],
    };
}
export async function extractStructured(documentUrl, schema) {
    if (!config.REDUCTO_API_KEY) {
        throw new Error('Reducto API key not configured');
    }
    const response = await fetch(`${REDUCTO_API}/extract`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${config.REDUCTO_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            document_url: documentUrl,
            schema,
        }),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Reducto extract failed: ${response.status} - ${errorText}`);
    }
    return response.json();
}
