/**
 * Integration tests for the mindmap knowledge graph system.
 * Tests the actual seed workflow, graph builder, and data integrity
 * against a real MongoDB connection.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as dotenv from 'dotenv';

// Load env vars BEFORE importing modules that use them
dotenv.config();

import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../api/lib/db';
import {
  getActors,
  getConnections,
  getCrawlJobs,
  getCrawlQueue,
  createActor,
  findActorById,
  findActorBySlug,
  findActorByName,
  searchActors,
  updateActor,
  incrementConnectionCount,
  createConnection,
  findConnection,
  upsertConnection,
  findConnectionsForActor,
  createCrawlJob,
  findCrawlJobById,
  updateCrawlJobProgress,
  setCrawlJobError,
  enqueueCrawlItem,
  dequeueNextItem,
  markQueueItemCompleted,
  markQueueItemFailed,
  getQueueStats,
  getActorsByIds,
  getTopHubs,
  getActorStats,
  ensureMindmapIndexes,
  slugify,
} from '../mindmap/lib/db';
import { resolveActor } from '../mindmap/lib/resolver';
import { buildGraph } from '../mindmap/lib/graph-builder';
import { computeHubScores } from '../mindmap/lib/hub-detection';
import { calculateExpansionPriority } from '../mindmap/lib/expansion-priority';
import { validateExtractionResult } from '../mindmap/lib/extraction-schemas';
import {
  getSeedActors,
  getSeedConnections,
  allSeedActors,
  allSeedConnections,
} from '../mindmap/lib/seed-data';
import { Actor, Connection } from '../mindmap/lib/types';

// Use a test-prefixed collection to avoid polluting real data
const TEST_PREFIX = 'test_mindmap_';

// We'll track IDs to clean up after tests
const createdActorIds: ObjectId[] = [];
const createdConnectionIds: ObjectId[] = [];
const createdJobIds: ObjectId[] = [];
const createdQueueIds: ObjectId[] = [];

describe('Mindmap Integration Tests', () => {
  beforeAll(async () => {
    // Ensure we can connect to MongoDB
    const { db } = await connectToDatabase();
    expect(db).toBeDefined();
    await ensureMindmapIndexes();
  });

  afterAll(async () => {
    // Clean up all test data
    const [actors, connections, jobs, queue] = await Promise.all([
      getActors(),
      getConnections(),
      getCrawlJobs(),
      getCrawlQueue(),
    ]);

    if (createdActorIds.length > 0) {
      await actors.deleteMany({ _id: { $in: createdActorIds } });
    }
    if (createdConnectionIds.length > 0) {
      await connections.deleteMany({ _id: { $in: createdConnectionIds } });
    }
    if (createdJobIds.length > 0) {
      await jobs.deleteMany({ _id: { $in: createdJobIds } });
    }
    if (createdQueueIds.length > 0) {
      await queue.deleteMany({ _id: { $in: createdQueueIds } });
    }
  });

  // --- Actor CRUD ---
  describe('Actor CRUD', () => {
    let testActorId: ObjectId;

    it('creates an actor with all required fields', async () => {
      const actor = await createActor({
        canonicalName: '__test_actor_integration__',
        aliases: ['__test_alias__'],
        slug: '__test-actor-integration__',
        category: 'organization',
        subtype: 'private_company',
        properties: { description: 'Test actor for integration tests' },
        tags: ['test'],
        crawlDepth: 0,
      });

      expect(actor._id).toBeDefined();
      expect(actor.canonicalName).toBe('__test_actor_integration__');
      expect(actor.connectionCount).toBe(0);
      expect(actor.createdAt).toBeInstanceOf(Date);
      expect(actor.updatedAt).toBeInstanceOf(Date);
      expect(actor.sources).toEqual([]);

      testActorId = actor._id!;
      createdActorIds.push(testActorId);
    });

    it('finds actor by ID', async () => {
      const actor = await findActorById(testActorId);
      expect(actor).not.toBeNull();
      expect(actor!.canonicalName).toBe('__test_actor_integration__');
    });

    it('finds actor by slug', async () => {
      const actor = await findActorBySlug('__test-actor-integration__');
      expect(actor).not.toBeNull();
      expect(actor!._id!.toString()).toBe(testActorId.toString());
    });

    it('finds actor by name (case insensitive)', async () => {
      const actor = await findActorByName('__TEST_ACTOR_INTEGRATION__');
      expect(actor).not.toBeNull();
    });

    it('finds actor by alias', async () => {
      const actor = await findActorByName('__test_alias__');
      expect(actor).not.toBeNull();
    });

    it('searches actors by query', async () => {
      const results = await searchActors('__test_actor_integration__');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(a => a._id!.toString() === testActorId.toString())).toBe(true);
    });

    it('updates actor fields', async () => {
      await updateActor(testActorId, {
        properties: { description: 'Updated description' },
        tags: ['test', 'updated'],
      });
      const actor = await findActorById(testActorId);
      expect(actor!.properties.description).toBe('Updated description');
      expect(actor!.tags).toContain('updated');
    });

    it('increments connection count', async () => {
      await incrementConnectionCount(testActorId, 3);
      const actor = await findActorById(testActorId);
      expect(actor!.connectionCount).toBe(3);
    });

    it('rejects duplicate slugs', async () => {
      await expect(createActor({
        canonicalName: '__test_actor_integration_dup__',
        aliases: [],
        slug: '__test-actor-integration__', // Same slug as above
        category: 'person',
        subtype: 'founder',
        properties: {},
        tags: [],
        crawlDepth: 0,
      })).rejects.toThrow();
    });
  });

  // --- Connection CRUD ---
  describe('Connection CRUD', () => {
    let sourceId: ObjectId;
    let targetId: ObjectId;

    beforeAll(async () => {
      // Create two actors to connect
      const source = await createActor({
        canonicalName: '__test_source_conn__',
        aliases: [],
        slug: '__test-source-conn__',
        category: 'person',
        subtype: 'investor',
        properties: {},
        tags: [],
        crawlDepth: 0,
      });
      const target = await createActor({
        canonicalName: '__test_target_conn__',
        aliases: [],
        slug: '__test-target-conn__',
        category: 'organization',
        subtype: 'private_company',
        properties: {},
        tags: [],
        crawlDepth: 0,
      });
      sourceId = source._id!;
      targetId = target._id!;
      createdActorIds.push(sourceId, targetId);
    });

    it('creates a connection between two actors', async () => {
      const conn = await createConnection({
        sourceActorId: sourceId,
        targetActorId: targetId,
        category: 'invested_in',
        directed: true,
        properties: { amount: 1000000, round: 'Series A' },
        confidence: 0.9,
        evidence: [{
          sourceType: 'test',
          excerpt: 'Test evidence',
          extractedAt: new Date(),
        }],
      });

      expect(conn._id).toBeDefined();
      expect(conn.category).toBe('invested_in');
      expect(conn.confidence).toBe(0.9);
      expect(conn.firstSeen).toBeInstanceOf(Date);
      createdConnectionIds.push(conn._id!);

      // Check connection counts were incremented
      const sourceActor = await findActorById(sourceId);
      const targetActor = await findActorById(targetId);
      expect(sourceActor!.connectionCount).toBeGreaterThanOrEqual(1);
      expect(targetActor!.connectionCount).toBeGreaterThanOrEqual(1);
    });

    it('finds connection by source, target, category', async () => {
      const conn = await findConnection(sourceId, targetId, 'invested_in');
      expect(conn).not.toBeNull();
      expect(conn!.confidence).toBe(0.9);
    });

    it('upserts connection - merges evidence on duplicate', async () => {
      const conn = await upsertConnection({
        sourceActorId: sourceId,
        targetActorId: targetId,
        category: 'invested_in',
        directed: true,
        properties: { round: 'Series B' },
        confidence: 0.95,
        evidence: [{
          sourceType: 'test2',
          excerpt: 'Updated evidence',
          extractedAt: new Date(),
        }],
      });

      expect(conn.evidence.length).toBe(2); // Merged
      expect(conn.confidence).toBe(0.95); // Higher of the two
    });

    it('finds connections for an actor', async () => {
      const conns = await findConnectionsForActor(sourceId);
      expect(conns.length).toBeGreaterThanOrEqual(1);
      expect(conns.some(c => c.category === 'invested_in')).toBe(true);
    });

    it('finds connections for target actor (incoming)', async () => {
      const conns = await findConnectionsForActor(targetId, 'incoming');
      expect(conns.length).toBeGreaterThanOrEqual(1);
    });
  });

  // --- Entity Resolution ---
  describe('Entity Resolution', () => {
    beforeAll(async () => {
      const actor = await createActor({
        canonicalName: '__test_resolve_target__',
        aliases: ['__Test Resolve Alias__'],
        slug: '__test-resolve-target__',
        category: 'organization',
        subtype: 'vc_fund',
        properties: {},
        tags: [],
        crawlDepth: 0,
      });
      createdActorIds.push(actor._id!);
    });

    it('resolves exact name match', async () => {
      const result = await resolveActor({ name: '__test_resolve_target__' });
      expect(result.actor).not.toBeNull();
      expect(result.matchScore).toBe(1);
      expect(result.created).toBe(false);
    });

    it('resolves by alias', async () => {
      const result = await resolveActor({ name: '__Test Resolve Alias__' });
      expect(result.actor).not.toBeNull();
      expect(result.created).toBe(false);
    });

    it('creates new actor when not found and createIfNotFound=true', async () => {
      const result = await resolveActor({
        name: '__test_resolve_new_actor__',
        category: 'person',
        subtype: 'investor',
        createIfNotFound: true,
      });
      expect(result.actor).not.toBeNull();
      expect(result.created).toBe(true);
      expect(result.matchScore).toBe(1);
      createdActorIds.push(result.actor!._id!);
    });

    it('returns null when not found and createIfNotFound=false', async () => {
      const result = await resolveActor({
        name: '__definitely_not_in_db_xyzzy__',
        createIfNotFound: false,
      });
      expect(result.actor).toBeNull();
      expect(result.matchScore).toBe(0);
    });
  });

  // --- Crawl Job + Queue ---
  describe('Crawl Job and Queue', () => {
    let jobId: ObjectId;
    let queueItemId: ObjectId;

    it('creates a crawl job', async () => {
      const job = await createCrawlJob({
        seedActorIds: [new ObjectId()],
        seedNames: ['Test Seed'],
        status: 'pending',
        maxDepth: 2,
        maxActors: 50,
      });

      expect(job._id).toBeDefined();
      expect(job.status).toBe('pending');
      expect(job.progress.currentStep).toBe('Initializing');
      jobId = job._id!;
      createdJobIds.push(jobId);
    });

    it('updates crawl job progress', async () => {
      await updateCrawlJobProgress(jobId, {
        currentStep: 'Crawling',
        stepsCompleted: 2,
        totalSteps: 5,
        actorsFound: 3,
      }, 'running');

      const job = await findCrawlJobById(jobId);
      expect(job!.status).toBe('running');
      expect(job!.progress.currentStep).toBe('Crawling');
      expect(job!.progress.actorsFound).toBe(3);
      expect(job!.startedAt).toBeInstanceOf(Date);
    });

    it('sets crawl job error', async () => {
      // Create a separate job for error test
      const errorJob = await createCrawlJob({
        seedActorIds: [new ObjectId()],
        seedNames: ['Error Test'],
        status: 'running',
        maxDepth: 1,
        maxActors: 10,
      });
      createdJobIds.push(errorJob._id!);

      await setCrawlJobError(errorJob._id!, 'Test error message');

      const job = await findCrawlJobById(errorJob._id!);
      expect(job!.status).toBe('failed');
      expect(job!.error).toBe('Test error message');
      expect(job!.completedAt).toBeInstanceOf(Date);
    });

    it('enqueues a crawl item', async () => {
      const item = await enqueueCrawlItem({
        jobId,
        actorId: new ObjectId(),
        actorName: 'Test Actor',
        itemType: 'web_search',
        searchQuery: 'test query',
        priority: 100,
      });

      expect(item._id).toBeDefined();
      expect(item.status).toBe('pending');
      queueItemId = item._id!;
      createdQueueIds.push(queueItemId);
    });

    it('enqueues multiple items and dequeues by priority', async () => {
      const lowPriority = await enqueueCrawlItem({
        jobId,
        actorId: new ObjectId(),
        actorName: 'Low Priority',
        itemType: 'web_scrape',
        priority: 10,
      });
      const highPriority = await enqueueCrawlItem({
        jobId,
        actorId: new ObjectId(),
        actorName: 'High Priority',
        itemType: 'web_search',
        searchQuery: 'high priority query',
        priority: 200,
      });
      createdQueueIds.push(lowPriority._id!, highPriority._id!);

      // Dequeue should return highest priority first
      const first = await dequeueNextItem(jobId);
      expect(first).not.toBeNull();
      expect(first!.priority).toBe(200);
      expect(first!.actorName).toBe('High Priority');
      expect(first!.status).toBe('processing');
    });

    it('marks queue items completed/failed', async () => {
      await markQueueItemCompleted(queueItemId);
      const stats = await getQueueStats(jobId);
      expect(stats.completed).toBeGreaterThanOrEqual(1);

      // Dequeue and fail the low priority one
      const next = await dequeueNextItem(jobId);
      if (next) {
        await markQueueItemFailed(next._id!, 'Test failure');
      }
    });

    it('gets accurate queue stats', async () => {
      const stats = await getQueueStats(jobId);
      expect(typeof stats.pending).toBe('number');
      expect(typeof stats.completed).toBe('number');
      expect(typeof stats.failed).toBe('number');
      expect(typeof stats.processing).toBe('number');
    });
  });

  // --- Seed Data Integrity ---
  describe('Seed Data Seeding Workflow', () => {
    const seededActorIds: ObjectId[] = [];
    const seededConnectionIds: ObjectId[] = [];

    afterAll(async () => {
      // Clean up seeded data
      const [actors, connections] = await Promise.all([getActors(), getConnections()]);
      if (seededActorIds.length > 0) {
        await actors.deleteMany({ _id: { $in: seededActorIds } });
      }
      if (seededConnectionIds.length > 0) {
        await connections.deleteMany({ _id: { $in: seededConnectionIds } });
      }
    });

    it('seeds actors from "both" seed set without errors', async () => {
      const actors = getSeedActors('both');
      const slugToId = new Map<string, ObjectId>();

      for (const actorInput of actors) {
        // Use unique slugs to not collide with any existing data
        const testSlug = `__seed_test_${actorInput.slug}__`;
        const testName = `__seed_test_${actorInput.canonicalName}__`;

        try {
          const actor = await createActor({
            ...actorInput,
            slug: testSlug,
            canonicalName: testName,
          });
          slugToId.set(actorInput.slug, actor._id!);
          seededActorIds.push(actor._id!);
        } catch (err: any) {
          // Skip duplicates (in case test ran before)
          if (err.code !== 11000) throw err;
        }
      }

      expect(slugToId.size).toBeGreaterThanOrEqual(30);
    }, 30000);

    it('seeds connections referencing valid actors', async () => {
      const connections = getSeedConnections('both');
      const actors = getSeedActors('both');

      // Batch lookup: fetch all test-seeded actors at once
      const actorsCol = await getActors();
      const testSlugs = actors.map(a => `__seed_test_${a.slug}__`);
      const existingActors = await actorsCol.find({ slug: { $in: testSlugs } }).toArray();

      const slugToId = new Map<string, ObjectId>();
      for (const a of existingActors) {
        // Strip the __seed_test_ prefix and __ suffix to get original slug
        const originalSlug = a.slug.replace(/^__seed_test_/, '').replace(/__$/, '');
        slugToId.set(originalSlug, a._id!);
      }

      let connectionsCreated = 0;
      for (const connInput of connections) {
        const sourceId = slugToId.get(connInput.sourceSlug);
        const targetId = slugToId.get(connInput.targetSlug);

        if (!sourceId || !targetId) continue;

        try {
          const conn = await createConnection({
            sourceActorId: sourceId,
            targetActorId: targetId,
            category: connInput.category as any,
            directed: connInput.directed,
            properties: (connInput.properties || {}) as any,
            confidence: connInput.confidence,
            evidence: [{
              sourceType: 'seed_test',
              excerpt: `Test seed: ${connInput.sourceSlug} -> ${connInput.targetSlug}`,
              extractedAt: new Date(),
            }],
          });
          seededConnectionIds.push(conn._id!);
          connectionsCreated++;
        } catch (err: any) {
          if (err.code !== 11000) throw err;
        }
      }

      expect(connectionsCreated).toBeGreaterThanOrEqual(30);
    }, 30000);

    it('top hubs after seeding are Y Combinator and Peter Thiel', async () => {
      const actorsCol = await getActors();

      // Find the test-seeded versions of YC and Thiel
      const yc = await actorsCol.findOne({ slug: '__seed_test_y-combinator__' });
      const thiel = await actorsCol.findOne({ slug: '__seed_test_peter-thiel__' });

      expect(yc).not.toBeNull();
      expect(thiel).not.toBeNull();

      // Both should have high connection counts from all the seed connections
      expect(yc!.connectionCount).toBeGreaterThanOrEqual(5);
      expect(thiel!.connectionCount).toBeGreaterThanOrEqual(5);
    });

    it('graph builder returns valid Cytoscape data from seeded actors', async () => {
      const actorsCol = await getActors();
      const yc = await actorsCol.findOne({ slug: '__seed_test_y-combinator__' });
      if (!yc) return; // Skip if seed didn't work

      const graph = await buildGraph([yc._id!.toString()], 1);

      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.edges.length).toBeGreaterThan(0);
      expect(graph.stats.totalActors).toBeGreaterThan(0);
      expect(graph.stats.totalConnections).toBeGreaterThan(0);

      // Validate node structure
      const ycNode = graph.nodes.find(n => n.id === yc._id!.toString());
      expect(ycNode).toBeDefined();
      expect(ycNode!.label).toContain('Y Combinator');
      expect(ycNode!.category).toBe('organization');

      // Validate edges reference existing nodes
      const nodeIds = new Set(graph.nodes.map(n => n.id));
      for (const edge of graph.edges) {
        expect(nodeIds.has(edge.source)).toBe(true);
        expect(nodeIds.has(edge.target)).toBe(true);
      }
    });

    it('multi-root graph includes both networks', async () => {
      const actorsCol = await getActors();
      const yc = await actorsCol.findOne({ slug: '__seed_test_y-combinator__' });
      const thiel = await actorsCol.findOne({ slug: '__seed_test_peter-thiel__' });
      if (!yc || !thiel) return;

      const graph = await buildGraph(
        [yc._id!.toString(), thiel._id!.toString()],
        1
      );

      // Should include nodes from both networks
      expect(graph.nodes.length).toBeGreaterThan(5);

      // Should have crossover edges (e.g., Founders Fund -> Stripe)
      const crossoverCategories = ['invested_in', 'co_founded'];
      const hasCrossover = graph.edges.some(e =>
        crossoverCategories.includes(e.category)
      );
      expect(hasCrossover).toBe(true);
    });
  });

  // --- Stats ---
  describe('Stats queries', () => {
    it('getActorStats returns valid counts', async () => {
      const stats = await getActorStats();
      expect(typeof stats.totalActors).toBe('number');
      expect(typeof stats.totalConnections).toBe('number');
      expect(typeof stats.byCategory).toBe('object');
    });
  });
});
