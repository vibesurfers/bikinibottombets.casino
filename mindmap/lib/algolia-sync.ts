import algoliasearch from 'algoliasearch';
import { getActors } from './db';
import { Actor } from './types';

const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID || '';
const ALGOLIA_ADMIN_KEY = process.env.ALGOLIA_ADMIN_KEY || '';
const INDEX_NAME = 'mindmap_actors';

function getAlgoliaClient() {
  if (!ALGOLIA_APP_ID || !ALGOLIA_ADMIN_KEY) {
    throw new Error('Algolia credentials not configured');
  }
  return algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY);
}

function actorToAlgoliaRecord(actor: Actor) {
  return {
    objectID: actor._id!.toString(),
    canonicalName: actor.canonicalName,
    aliases: actor.aliases,
    slug: actor.slug,
    category: actor.category,
    subtype: actor.subtype,
    description: actor.properties?.description || '',
    ticker: actor.properties?.ticker || '',
    tags: actor.tags,
    connectionCount: actor.connectionCount,
    crawlDepth: actor.crawlDepth,
  };
}

/**
 * Sync a single actor to Algolia
 */
export async function syncActorToAlgolia(actor: Actor): Promise<void> {
  try {
    const client = getAlgoliaClient();
    const index = client.initIndex(INDEX_NAME);
    await index.saveObject(actorToAlgoliaRecord(actor));
  } catch (err) {
    console.warn('[Algolia Sync] Failed to sync actor:', err);
  }
}

/**
 * Bulk sync all actors to Algolia
 */
export async function syncAllActorsToAlgolia(): Promise<{ synced: number }> {
  const client = getAlgoliaClient();
  const index = client.initIndex(INDEX_NAME);

  // Configure index settings
  await index.setSettings({
    searchableAttributes: ['canonicalName', 'aliases', 'description', 'tags', 'ticker'],
    attributesForFaceting: ['category', 'subtype', 'tags'],
    customRanking: ['desc(connectionCount)'],
    attributesToRetrieve: [
      'objectID', 'canonicalName', 'aliases', 'slug', 'category',
      'subtype', 'description', 'ticker', 'tags', 'connectionCount',
    ],
  });

  const actorsCol = await getActors();
  const actors = await actorsCol.find({}).toArray();
  const records = actors.map(actorToAlgoliaRecord);

  if (records.length > 0) {
    await index.saveObjects(records);
  }

  return { synced: records.length };
}

/**
 * Search actors via Algolia
 */
export async function searchMindmapActors(
  query: string,
  options: { category?: string; limit?: number } = {}
): Promise<{
  hits: Array<{
    objectID: string;
    canonicalName: string;
    slug: string;
    category: string;
    subtype: string;
    connectionCount: number;
    tags: string[];
  }>;
  nbHits: number;
}> {
  const client = getAlgoliaClient();
  const index = client.initIndex(INDEX_NAME);

  const filters = options.category ? `category:${options.category}` : '';

  const result = await index.search(query, {
    hitsPerPage: options.limit || 20,
    filters,
  });

  return {
    hits: result.hits as any[],
    nbHits: result.nbHits,
  };
}
