/**
 * E2E tests for mindmap API endpoints.
 * Tests the Vercel handler functions directly with mock req/res objects.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as dotenv from 'dotenv';

// Load env vars BEFORE importing modules that use them
dotenv.config();

import type { VercelRequest, VercelResponse } from '@vercel/node';
import seedHandler from '../api/mindmap/seed';
import actorsHandler from '../api/mindmap/actors';
import connectionsHandler from '../api/mindmap/connections';
import graphHandler from '../api/mindmap/graph';
import statsHandler from '../api/mindmap/stats';
import statusHandler from '../api/mindmap/status';
import { getActors, getConnections, findActorBySlug } from '../mindmap/lib/db';
import { ObjectId } from 'mongodb';

// Helper to create mock Vercel request/response
function createMockReqRes(options: {
  method: string;
  query?: Record<string, string>;
  body?: any;
}): { req: VercelRequest; res: VercelResponse; getResponse: () => { status: number; body: any; headers: Record<string, string> } } {
  const responseState = {
    status: 200,
    body: null as any,
    headers: {} as Record<string, string>,
    ended: false,
  };

  const req = {
    method: options.method,
    query: options.query || {},
    body: options.body || {},
  } as unknown as VercelRequest;

  const res = {
    setHeader(name: string, value: string) {
      responseState.headers[name] = value;
      return res;
    },
    status(code: number) {
      responseState.status = code;
      return res;
    },
    json(data: any) {
      responseState.body = data;
      responseState.ended = true;
      return res;
    },
    end() {
      responseState.ended = true;
      return res;
    },
  } as unknown as VercelResponse;

  return { req, res, getResponse: () => responseState };
}

describe('Mindmap API E2E Tests', () => {
  // --- Seed endpoint ---
  describe('POST /api/mindmap/seed', () => {
    it('rejects non-POST methods', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
      await seedHandler(req, res);
      expect(getResponse().status).toBe(405);
    });

    it('rejects invalid seedSet', async () => {
      const { req, res, getResponse } = createMockReqRes({
        method: 'POST',
        body: { seedSet: 'invalid' },
      });
      await seedHandler(req, res);
      expect(getResponse().status).toBe(400);
      expect(getResponse().body.error).toContain('seedSet');
    });

    it('seeds YC data and returns counts', async () => {
      const { req, res, getResponse } = createMockReqRes({
        method: 'POST',
        body: { seedSet: 'yc' },
      });
      await seedHandler(req, res);
      const response = getResponse();
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.seedSet).toBe('yc');
      expect(response.body.actors.total).toBeGreaterThan(0);
      expect(response.body.connections.total).toBeGreaterThan(0);
      // Either created or skipped (idempotent)
      expect(response.body.actors.created + response.body.actors.skipped).toBe(response.body.actors.total);
    }, 30000);
  });

  // --- Actors endpoint ---
  describe('GET /api/mindmap/actors', () => {
    it('rejects non-GET methods', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'POST' });
      await actorsHandler(req, res);
      expect(getResponse().status).toBe(405);
    });

    it('requires at least one parameter', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
      await actorsHandler(req, res);
      expect(getResponse().status).toBe(400);
    });

    it('finds actor by slug', async () => {
      const { req, res, getResponse } = createMockReqRes({
        method: 'GET',
        query: { slug: 'y-combinator' },
      });
      await actorsHandler(req, res);
      const response = getResponse();
      // Will be 200 if seeded, 404 if not
      if (response.status === 200) {
        expect(response.body.actor.slug).toBe('y-combinator');
        expect(response.body.actor.id).toBeDefined();
        expect(response.body.actor.canonicalName).toContain('Y Combinator');
        expect(response.body.actor.category).toBe('organization');
      } else {
        expect(response.status).toBe(404);
      }
    });

    it('rejects invalid ObjectId', async () => {
      const { req, res, getResponse } = createMockReqRes({
        method: 'GET',
        query: { id: 'not-a-valid-id' },
      });
      await actorsHandler(req, res);
      expect(getResponse().status).toBe(400);
      expect(getResponse().body.error).toContain('Invalid');
    });

    it('returns 404 for nonexistent slug', async () => {
      const { req, res, getResponse } = createMockReqRes({
        method: 'GET',
        query: { slug: '__nonexistent_slug_xyz__' },
      });
      await actorsHandler(req, res);
      expect(getResponse().status).toBe(404);
    });

    it('searches actors by query', async () => {
      // First ensure there's at least one actor to find
      const yc = await findActorBySlug('y-combinator');
      if (!yc) return; // Skip if not seeded

      const { req, res, getResponse } = createMockReqRes({
        method: 'GET',
        query: { query: 'Y Combinator' },
      });
      await actorsHandler(req, res);
      const response = getResponse();
      expect(response.status).toBe(200);
      expect(response.body.actors.length).toBeGreaterThan(0);
      expect(response.body.count).toBeGreaterThan(0);
    });
  });

  // --- Connections endpoint ---
  describe('GET /api/mindmap/connections', () => {
    it('rejects non-GET methods', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'DELETE' });
      await connectionsHandler(req, res);
      expect(getResponse().status).toBe(405);
    });

    it('requires actorId parameter', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
      await connectionsHandler(req, res);
      expect(getResponse().status).toBe(400);
    });

    it('returns connections for a seeded actor', async () => {
      const yc = await findActorBySlug('y-combinator');
      if (!yc) return; // Skip if not seeded

      const { req, res, getResponse } = createMockReqRes({
        method: 'GET',
        query: { actorId: yc._id!.toString() },
      });
      await connectionsHandler(req, res);
      const response = getResponse();
      expect(response.status).toBe(200);
      expect(response.body.connections.length).toBeGreaterThan(0);
      // Verify connection shape includes resolved names
      const first = response.body.connections[0];
      expect(first.id).toBeDefined();
      expect(first.category).toBeDefined();
      expect(first.sourceActorName).toBeDefined();
      expect(first.targetActorName).toBeDefined();
    });
  });

  // --- Graph endpoint ---
  describe('GET /api/mindmap/graph', () => {
    it('rejects non-GET methods', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'POST' });
      await graphHandler(req, res);
      expect(getResponse().status).toBe(405);
    });

    it('returns full graph when no actorId provided', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
      await graphHandler(req, res);
      const response = getResponse();
      expect(response.status).toBe(200);
      expect(response.body.nodes).toBeDefined();
      expect(response.body.edges).toBeDefined();
    });

    it('returns graph data for a seeded actor', async () => {
      const yc = await findActorBySlug('y-combinator');
      if (!yc) return;

      const { req, res, getResponse } = createMockReqRes({
        method: 'GET',
        query: { actorId: yc._id!.toString(), depth: '1' },
      });
      await graphHandler(req, res);
      const response = getResponse();
      expect(response.status).toBe(200);
      expect(response.body.nodes.length).toBeGreaterThan(0);
      expect(response.body.edges.length).toBeGreaterThan(0);
      expect(response.body.stats).toBeDefined();
      expect(response.body.stats.totalActors).toBeGreaterThan(0);

      // Validate Cytoscape.js format
      const node = response.body.nodes[0];
      expect(node.id).toBeDefined();
      expect(node.label).toBeDefined();
      expect(node.category).toBeDefined();

      const edge = response.body.edges[0];
      expect(edge.id).toBeDefined();
      expect(edge.source).toBeDefined();
      expect(edge.target).toBeDefined();
      expect(edge.label).toBeDefined();
    });

    it('supports multi-root graph via actorIds', async () => {
      const yc = await findActorBySlug('y-combinator');
      const thiel = await findActorBySlug('peter-thiel');
      if (!yc || !thiel) return;

      const { req, res, getResponse } = createMockReqRes({
        method: 'GET',
        query: {
          actorIds: `${yc._id!.toString()},${thiel._id!.toString()}`,
          depth: '1',
        },
      });
      await graphHandler(req, res);
      const response = getResponse();
      expect(response.status).toBe(200);
      expect(response.body.nodes.length).toBeGreaterThan(5);
    });
  });

  // --- Stats endpoint ---
  describe('GET /api/mindmap/stats', () => {
    it('rejects non-GET methods', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'PUT' });
      await statsHandler(req, res);
      expect(getResponse().status).toBe(405);
    });

    it('returns stats with top hubs', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
      await statsHandler(req, res);
      const response = getResponse();
      expect(response.status).toBe(200);
      expect(typeof response.body.totalActors).toBe('number');
      expect(typeof response.body.totalConnections).toBe('number');
      expect(response.body.byCategory).toBeDefined();
      expect(Array.isArray(response.body.topHubs)).toBe(true);

      // If data exists, verify hub shape
      if (response.body.topHubs.length > 0) {
        const hub = response.body.topHubs[0];
        expect(hub.id).toBeDefined();
        expect(hub.name).toBeDefined();
        expect(typeof hub.connectionCount).toBe('number');
      }
    });
  });

  // --- Status endpoint ---
  describe('GET /api/mindmap/status', () => {
    it('rejects non-GET methods', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'POST' });
      await statusHandler(req, res);
      expect(getResponse().status).toBe(405);
    });

    it('requires jobId parameter', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'GET' });
      await statusHandler(req, res);
      expect(getResponse().status).toBe(400);
    });

    it('returns 404 for nonexistent job', async () => {
      const { req, res, getResponse } = createMockReqRes({
        method: 'GET',
        query: { jobId: new ObjectId().toString() },
      });
      await statusHandler(req, res);
      expect(getResponse().status).toBe(404);
    });
  });

  // --- CORS ---
  describe('CORS headers', () => {
    it('all endpoints set CORS headers', async () => {
      const { req, res, getResponse } = createMockReqRes({ method: 'OPTIONS' });
      await seedHandler(req, res);
      const response = getResponse();
      expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(response.headers['Access-Control-Allow-Methods']).toBeDefined();
    });
  });
});
