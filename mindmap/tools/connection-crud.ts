import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import {
  upsertConnection,
  findConnectionsForActor,
} from '../lib/db';

export const createConnectionTool = createTool({
  id: 'create-connection',
  description: 'Create or update a connection between two actors. Merges evidence if connection already exists.',
  inputSchema: z.object({
    sourceActorId: z.string().describe('Source actor ObjectId'),
    targetActorId: z.string().describe('Target actor ObjectId'),
    category: z.string().describe('Connection category, e.g. invested_in, founded, executive_at'),
    directed: z.boolean().optional().default(true),
    confidence: z.number().optional().default(0.8),
    properties: z.record(z.unknown()).optional().default({}),
    evidenceUrl: z.string().optional(),
    evidenceExcerpt: z.string().optional(),
    evidenceSourceType: z.string().optional().default('web'),
  }),
  outputSchema: z.object({
    connectionId: z.string(),
    isNew: z.boolean(),
  }),
  execute: async ({ context }) => {
    const evidence = context.evidenceUrl || context.evidenceExcerpt ? [{
      url: context.evidenceUrl,
      sourceType: context.evidenceSourceType || 'web',
      excerpt: context.evidenceExcerpt,
      extractedAt: new Date(),
    }] : [];

    const conn = await upsertConnection({
      sourceActorId: new ObjectId(context.sourceActorId),
      targetActorId: new ObjectId(context.targetActorId),
      category: context.category as any,
      directed: context.directed,
      confidence: context.confidence,
      properties: context.properties as any,
      evidence,
    });

    return {
      connectionId: conn._id!.toString(),
      isNew: conn.firstSeen.getTime() === conn.lastVerified.getTime(),
    };
  },
});

export const getConnectionsTool = createTool({
  id: 'get-connections',
  description: 'Get all connections for an actor.',
  inputSchema: z.object({
    actorId: z.string().describe('Actor ObjectId'),
    direction: z.enum(['outgoing', 'incoming', 'both']).optional().default('both'),
  }),
  outputSchema: z.object({
    connections: z.array(z.object({
      id: z.string(),
      sourceActorId: z.string(),
      targetActorId: z.string(),
      category: z.string(),
      confidence: z.number(),
      directed: z.boolean(),
    })),
  }),
  execute: async ({ context }) => {
    const connections = await findConnectionsForActor(context.actorId, context.direction);
    return {
      connections: connections.map(c => ({
        id: c._id!.toString(),
        sourceActorId: c.sourceActorId.toString(),
        targetActorId: c.targetActorId.toString(),
        category: c.category,
        confidence: c.confidence,
        directed: c.directed,
      })),
    };
  },
});
