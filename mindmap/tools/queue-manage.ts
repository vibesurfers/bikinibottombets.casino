import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import {
  enqueueCrawlItem,
  dequeueNextItem,
  markQueueItemCompleted,
  markQueueItemFailed,
  getQueueStats,
} from '../lib/db';

export const enqueueItemTool = createTool({
  id: 'enqueue-crawl-item',
  description: 'Add an item to the crawl queue for processing.',
  inputSchema: z.object({
    jobId: z.string().describe('Crawl job ObjectId'),
    actorId: z.string().describe('Actor ObjectId'),
    actorName: z.string().describe('Actor name for logging'),
    itemType: z.enum(['web_search', 'web_scrape', 'sec_filing', 'pdf_parse']),
    url: z.string().optional().describe('URL to scrape or parse'),
    searchQuery: z.string().optional().describe('Search query for web_search items'),
    priority: z.number().optional().default(50).describe('Priority 0-200, higher = processed first'),
  }),
  outputSchema: z.object({
    itemId: z.string(),
  }),
  execute: async ({ context }) => {
    const item = await enqueueCrawlItem({
      jobId: new ObjectId(context.jobId),
      actorId: new ObjectId(context.actorId),
      actorName: context.actorName,
      itemType: context.itemType,
      url: context.url,
      searchQuery: context.searchQuery,
      priority: context.priority,
    });
    return { itemId: item._id!.toString() };
  },
});

export const dequeueItemTool = createTool({
  id: 'dequeue-crawl-item',
  description: 'Dequeue the next highest-priority item from the crawl queue.',
  inputSchema: z.object({
    jobId: z.string().describe('Crawl job ObjectId'),
  }),
  outputSchema: z.object({
    item: z.any().nullable(),
  }),
  execute: async ({ context }) => {
    const item = await dequeueNextItem(context.jobId);
    if (!item) return { item: null };
    return {
      item: {
        id: item._id!.toString(),
        actorId: item.actorId.toString(),
        actorName: item.actorName,
        itemType: item.itemType,
        url: item.url,
        searchQuery: item.searchQuery,
        priority: item.priority,
      },
    };
  },
});

export const completeQueueItemTool = createTool({
  id: 'complete-queue-item',
  description: 'Mark a crawl queue item as completed.',
  inputSchema: z.object({
    itemId: z.string(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ context }) => {
    await markQueueItemCompleted(context.itemId);
    return { success: true };
  },
});

export const failQueueItemTool = createTool({
  id: 'fail-queue-item',
  description: 'Mark a crawl queue item as failed.',
  inputSchema: z.object({
    itemId: z.string(),
    error: z.string(),
  }),
  outputSchema: z.object({ success: z.boolean() }),
  execute: async ({ context }) => {
    await markQueueItemFailed(context.itemId, context.error);
    return { success: true };
  },
});

export const queueStatsTool = createTool({
  id: 'queue-stats',
  description: 'Get statistics on the crawl queue for a job.',
  inputSchema: z.object({
    jobId: z.string(),
  }),
  outputSchema: z.object({
    stats: z.record(z.number()),
  }),
  execute: async ({ context }) => {
    const stats = await getQueueStats(context.jobId);
    return { stats };
  },
});
