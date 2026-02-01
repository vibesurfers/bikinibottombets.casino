import { Collection, ObjectId, IndexDescription } from 'mongodb';
import { connectToDatabase } from '../../api/lib/db';
import {
  Actor,
  Connection,
  CrawlJob,
  CrawlQueueItem,
  ActorCategory,
  ConnectionCategory,
} from './types';

// Collection getters
export async function getActors(): Promise<Collection<Actor>> {
  const { db } = await connectToDatabase();
  return db.collection<Actor>('mindmap_actors');
}

export async function getConnections(): Promise<Collection<Connection>> {
  const { db } = await connectToDatabase();
  return db.collection<Connection>('mindmap_connections');
}

export async function getCrawlJobs(): Promise<Collection<CrawlJob>> {
  const { db } = await connectToDatabase();
  return db.collection<CrawlJob>('mindmap_crawl_jobs');
}

export async function getCrawlQueue(): Promise<Collection<CrawlQueueItem>> {
  const { db } = await connectToDatabase();
  return db.collection<CrawlQueueItem>('mindmap_crawl_queue');
}

// Index definitions
const actorIndexes: IndexDescription[] = [
  { key: { canonicalName: 1 }, unique: true },
  { key: { slug: 1 }, unique: true },
  { key: { aliases: 1 } },
  { key: { category: 1 } },
  { key: { subtype: 1 } },
  { key: { tags: 1 } },
  { key: { connectionCount: -1 } },
  { key: { crawlDepth: 1 } },
  { key: { canonicalName: 'text', aliases: 'text', 'properties.description': 'text' } },
  { key: { updatedAt: -1 } },
];

const connectionIndexes: IndexDescription[] = [
  { key: { sourceActorId: 1 } },
  { key: { targetActorId: 1 } },
  { key: { sourceActorId: 1, targetActorId: 1, category: 1 }, unique: true },
  { key: { category: 1 } },
  { key: { confidence: -1 } },
  { key: { lastVerified: -1 } },
];

const crawlJobIndexes: IndexDescription[] = [
  { key: { status: 1 } },
  { key: { createdAt: -1 } },
];

const crawlQueueIndexes: IndexDescription[] = [
  { key: { jobId: 1 } },
  { key: { status: 1, priority: -1 } },
  { key: { actorId: 1 } },
  { key: { createdAt: -1 } },
];

export async function ensureMindmapIndexes(): Promise<void> {
  const [actors, connections, jobs, queue] = await Promise.all([
    getActors(),
    getConnections(),
    getCrawlJobs(),
    getCrawlQueue(),
  ]);

  await Promise.all([
    actors.createIndexes(actorIndexes),
    connections.createIndexes(connectionIndexes),
    jobs.createIndexes(crawlJobIndexes),
    queue.createIndexes(crawlQueueIndexes),
  ]);
}

// --- Actor CRUD ---

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function createActor(
  actor: Omit<Actor, '_id' | 'createdAt' | 'updatedAt' | 'connectionCount' | 'sources'> & { sources?: Actor['sources'] }
): Promise<Actor> {
  const actors = await getActors();
  const now = new Date();
  const doc: Actor = {
    ...actor,
    slug: actor.slug || slugify(actor.canonicalName),
    sources: actor.sources || [],
    connectionCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  const result = await actors.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function findActorById(id: ObjectId | string): Promise<Actor | null> {
  const actors = await getActors();
  const objectId = typeof id === 'string' ? new ObjectId(id) : id;
  return actors.findOne({ _id: objectId });
}

export async function findActorBySlug(slug: string): Promise<Actor | null> {
  const actors = await getActors();
  return actors.findOne({ slug });
}

export async function findActorByName(name: string): Promise<Actor | null> {
  const actors = await getActors();
  const escaped = escapeRegex(name);
  return actors.findOne({
    $or: [
      { canonicalName: { $regex: new RegExp(`^${escaped}$`, 'i') } },
      { aliases: { $regex: new RegExp(`^${escaped}$`, 'i') } },
    ],
  });
}

export async function searchActors(
  query: string,
  category?: ActorCategory,
  limit = 20
): Promise<Actor[]> {
  const actors = await getActors();
  const filter: any = {
    $or: [
      { canonicalName: { $regex: escapeRegex(query), $options: 'i' } },
      { aliases: { $regex: escapeRegex(query), $options: 'i' } },
      { 'properties.ticker': { $regex: escapeRegex(query), $options: 'i' } },
    ],
  };
  if (category) filter.category = category;
  return actors.find(filter).sort({ connectionCount: -1 }).limit(limit).toArray();
}

export async function updateActor(
  id: ObjectId | string,
  update: Partial<Actor>
): Promise<boolean> {
  const actors = await getActors();
  const objectId = typeof id === 'string' ? new ObjectId(id) : id;
  const result = await actors.updateOne(
    { _id: objectId },
    { $set: { ...update, updatedAt: new Date() } }
  );
  return result.modifiedCount > 0;
}

export async function incrementConnectionCount(
  actorId: ObjectId | string,
  amount = 1
): Promise<void> {
  const actors = await getActors();
  const objectId = typeof actorId === 'string' ? new ObjectId(actorId) : actorId;
  await actors.updateOne(
    { _id: objectId },
    { $inc: { connectionCount: amount }, $set: { updatedAt: new Date() } }
  );
}

// --- Connection CRUD ---

export async function createConnection(
  conn: Omit<Connection, '_id' | 'firstSeen' | 'lastVerified'>
): Promise<Connection> {
  const connections = await getConnections();
  const now = new Date();
  const doc: Connection = {
    ...conn,
    firstSeen: now,
    lastVerified: now,
  };
  const result = await connections.insertOne(doc);

  // Increment connection counts on both actors
  await Promise.all([
    incrementConnectionCount(conn.sourceActorId),
    incrementConnectionCount(conn.targetActorId),
  ]);

  return { ...doc, _id: result.insertedId };
}

export async function findConnection(
  sourceId: ObjectId,
  targetId: ObjectId,
  category: ConnectionCategory
): Promise<Connection | null> {
  const connections = await getConnections();
  return connections.findOne({ sourceActorId: sourceId, targetActorId: targetId, category });
}

export async function upsertConnection(
  conn: Omit<Connection, '_id' | 'firstSeen' | 'lastVerified'>
): Promise<Connection> {
  const existing = await findConnection(conn.sourceActorId, conn.targetActorId, conn.category);
  const now = new Date();

  if (existing) {
    const connections = await getConnections();
    const mergedEvidence = [...existing.evidence, ...conn.evidence];
    await connections.updateOne(
      { _id: existing._id },
      {
        $set: {
          confidence: Math.max(existing.confidence, conn.confidence),
          properties: { ...existing.properties, ...conn.properties },
          evidence: mergedEvidence,
          lastVerified: now,
        },
      }
    );
    return { ...existing, ...conn, evidence: mergedEvidence, lastVerified: now };
  }

  return createConnection(conn);
}

export async function findConnectionsForActor(
  actorId: ObjectId | string,
  direction: 'outgoing' | 'incoming' | 'both' = 'both'
): Promise<Connection[]> {
  const connections = await getConnections();
  const objId = typeof actorId === 'string' ? new ObjectId(actorId) : actorId;

  const queries: any[] = [];
  if (direction === 'outgoing' || direction === 'both') {
    queries.push({ sourceActorId: objId });
  }
  if (direction === 'incoming' || direction === 'both') {
    queries.push({ targetActorId: objId });
  }

  return connections.find({ $or: queries }).sort({ confidence: -1 }).toArray();
}

// --- Crawl Job CRUD ---

export async function createCrawlJob(
  job: Omit<CrawlJob, '_id' | 'createdAt' | 'progress'>
): Promise<CrawlJob> {
  const jobs = await getCrawlJobs();
  const doc: CrawlJob = {
    ...job,
    progress: {
      currentStep: 'Initializing',
      stepsCompleted: 0,
      totalSteps: 0,
      actorsFound: 0,
      connectionsFound: 0,
    },
    createdAt: new Date(),
  };
  const result = await jobs.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function findCrawlJobById(id: ObjectId | string): Promise<CrawlJob | null> {
  const jobs = await getCrawlJobs();
  const objectId = typeof id === 'string' ? new ObjectId(id) : id;
  return jobs.findOne({ _id: objectId });
}

export async function updateCrawlJobProgress(
  id: ObjectId | string,
  progress: Partial<CrawlJob['progress']>,
  status?: CrawlJob['status']
): Promise<boolean> {
  const jobs = await getCrawlJobs();
  const objectId = typeof id === 'string' ? new ObjectId(id) : id;

  const update: any = {};
  for (const [key, value] of Object.entries(progress)) {
    update[`progress.${key}`] = value;
  }
  if (status) {
    update.status = status;
    if (status === 'running') update.startedAt = new Date();
    else if (status === 'completed' || status === 'failed') update.completedAt = new Date();
  }

  const result = await jobs.updateOne({ _id: objectId }, { $set: update });
  return result.modifiedCount > 0;
}

export async function setCrawlJobError(
  id: ObjectId | string,
  error: string
): Promise<boolean> {
  const jobs = await getCrawlJobs();
  const objectId = typeof id === 'string' ? new ObjectId(id) : id;
  const result = await jobs.updateOne(
    { _id: objectId },
    { $set: { status: 'failed' as const, error, completedAt: new Date() } }
  );
  return result.modifiedCount > 0;
}

// --- Crawl Queue ---

export async function enqueueCrawlItem(
  item: Omit<CrawlQueueItem, '_id' | 'createdAt' | 'status'>
): Promise<CrawlQueueItem> {
  const queue = await getCrawlQueue();
  const doc: CrawlQueueItem = {
    ...item,
    status: 'pending',
    createdAt: new Date(),
  };
  const result = await queue.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function dequeueNextItem(jobId: ObjectId | string): Promise<CrawlQueueItem | null> {
  const queue = await getCrawlQueue();
  const objId = typeof jobId === 'string' ? new ObjectId(jobId) : jobId;

  const result = await queue.findOneAndUpdate(
    { jobId: objId, status: 'pending' },
    { $set: { status: 'processing', processedAt: new Date() } },
    { sort: { priority: -1, createdAt: 1 }, returnDocument: 'after' }
  );

  return result || null;
}

export async function markQueueItemCompleted(id: ObjectId | string): Promise<void> {
  const queue = await getCrawlQueue();
  const objectId = typeof id === 'string' ? new ObjectId(id) : id;
  await queue.updateOne({ _id: objectId }, { $set: { status: 'completed' } });
}

export async function markQueueItemFailed(id: ObjectId | string, error: string): Promise<void> {
  const queue = await getCrawlQueue();
  const objectId = typeof id === 'string' ? new ObjectId(id) : id;
  await queue.updateOne({ _id: objectId }, { $set: { status: 'failed', error } });
}

export async function getQueueStats(jobId: ObjectId | string): Promise<Record<string, number>> {
  const queue = await getCrawlQueue();
  const objId = typeof jobId === 'string' ? new ObjectId(jobId) : jobId;
  const results = await queue.aggregate([
    { $match: { jobId: objId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]).toArray();

  const stats: Record<string, number> = { pending: 0, processing: 0, completed: 0, failed: 0 };
  for (const r of results) {
    stats[r._id] = r.count;
  }
  return stats;
}

// --- Graph queries ---

export async function getActorsByIds(ids: (ObjectId | string)[]): Promise<Actor[]> {
  const actors = await getActors();
  const objectIds = ids.map(id => typeof id === 'string' ? new ObjectId(id) : id);
  return actors.find({ _id: { $in: objectIds } }).toArray();
}

export async function getTopHubs(limit = 10): Promise<Actor[]> {
  const actors = await getActors();
  return actors.find({}).sort({ connectionCount: -1 }).limit(limit).toArray();
}

export async function getActorStats(): Promise<{
  totalActors: number;
  totalConnections: number;
  byCategory: Record<string, number>;
}> {
  const [actors, connections] = await Promise.all([getActors(), getConnections()]);
  const [totalActors, totalConnections] = await Promise.all([
    actors.countDocuments(),
    connections.countDocuments(),
  ]);

  const categoryAgg = await actors.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]).toArray();

  const byCategory: Record<string, number> = {};
  for (const r of categoryAgg) {
    byCategory[r._id] = r.count;
  }

  return { totalActors, totalConnections, byCategory };
}

// Utility
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export { slugify };
