import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { parseDocument } from '../../api/lib/services';

export const pdfParseTool = createTool({
  id: 'pdf-parse',
  description: 'Parse a PDF document (SEC filing, report, etc.) and extract its text content using Reducto.',
  inputSchema: z.object({
    documentUrl: z.string().url().describe('URL of the PDF document'),
  }),
  outputSchema: z.object({
    numPages: z.number(),
    content: z.string(),
  }),
  execute: async ({ context }) => {
    const result = await parseDocument(context.documentUrl);
    const content = result.chunks.map(c => c.content).join('\n\n');
    return {
      numPages: result.numPages,
      content: content.slice(0, 15000),
    };
  },
});
