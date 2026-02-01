import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  findActorById,
  findActorBySlug,
  searchActors,
  updateActor,
  getTopHubs,
} from '../lib/db';
import { resolveActor } from '../lib/resolver';

export const resolveActorTool = createTool({
  id: 'resolve-actor',
  description: 'Resolve an actor by name with fuzzy matching. Creates a new actor if not found and createIfNotFound is true.',
  inputSchema: z.object({
    name: z.string().describe('Actor name to resolve'),
    category: z.enum(['organization', 'person', 'fund', 'event']).optional().default('organization'),
    subtype: z.string().optional().default('private_company'),
    createIfNotFound: z.boolean().optional().default(true),
    tags: z.array(z.string()).optional().default([]),
    crawlDepth: z.number().optional().default(1),
  }),
  outputSchema: z.object({
    actorId: z.string().nullable(),
    name: z.string().nullable(),
    created: z.boolean(),
    matchScore: z.number(),
  }),
  execute: async ({ context }) => {
    const result = await resolveActor(context);
    return {
      actorId: result.actor?._id?.toString() || null,
      name: result.actor?.canonicalName || null,
      created: result.created,
      matchScore: result.matchScore,
    };
  },
});

export const getActorTool = createTool({
  id: 'get-actor',
  description: 'Get an actor by ID or slug.',
  inputSchema: z.object({
    id: z.string().optional().describe('Actor ObjectId'),
    slug: z.string().optional().describe('Actor slug'),
  }),
  outputSchema: z.object({
    actor: z.any().nullable(),
  }),
  execute: async ({ context }) => {
    let actor = null;
    if (context.id) actor = await findActorById(context.id);
    else if (context.slug) actor = await findActorBySlug(context.slug);
    return { actor };
  },
});

export const searchActorsTool = createTool({
  id: 'search-actors',
  description: 'Search actors by name, alias, or ticker.',
  inputSchema: z.object({
    query: z.string().describe('Search query'),
    category: z.enum(['organization', 'person', 'fund', 'event']).optional(),
    limit: z.number().optional().default(20),
  }),
  outputSchema: z.object({
    actors: z.array(z.object({
      id: z.string(),
      name: z.string(),
      category: z.string(),
      subtype: z.string(),
      connectionCount: z.number(),
    })),
  }),
  execute: async ({ context }) => {
    const actors = await searchActors(context.query, context.category, context.limit);
    return {
      actors: actors.map(a => ({
        id: a._id!.toString(),
        name: a.canonicalName,
        category: a.category,
        subtype: a.subtype,
        connectionCount: a.connectionCount,
      })),
    };
  },
});

export const updateActorTool = createTool({
  id: 'update-actor',
  description: 'Update an actor\'s properties, tags, or sources.',
  inputSchema: z.object({
    id: z.string().describe('Actor ID'),
    properties: z.record(z.unknown()).optional(),
    tags: z.array(z.string()).optional(),
    lastCrawledAt: z.boolean().optional().describe('Set lastCrawledAt to now'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
  }),
  execute: async ({ context }) => {
    const update: any = {};
    if (context.properties) update.properties = context.properties;
    if (context.tags) update.tags = context.tags;
    if (context.lastCrawledAt) update.lastCrawledAt = new Date();
    const success = await updateActor(context.id, update);
    return { success };
  },
});

export const getTopHubsTool = createTool({
  id: 'get-top-hubs',
  description: 'Get actors with the most connections (hub nodes).',
  inputSchema: z.object({
    limit: z.number().optional().default(10),
  }),
  outputSchema: z.object({
    hubs: z.array(z.object({
      id: z.string(),
      name: z.string(),
      category: z.string(),
      connectionCount: z.number(),
    })),
  }),
  execute: async ({ context }) => {
    const actors = await getTopHubs(context.limit);
    return {
      hubs: actors.map(a => ({
        id: a._id!.toString(),
        name: a.canonicalName,
        category: a.category,
        connectionCount: a.connectionCount,
      })),
    };
  },
});
