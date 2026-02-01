import { ObjectId } from 'mongodb';
import {
  Actor,
  ActorCategory,
  ActorSubtype,
} from './types';
import {
  getActors,
  findActorByName,
  createActor,
  updateActor,
  slugify,
} from './db';

// Name normalization
function normalizeCompanyName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/,?\s*(Inc\.?|LLC|LP|L\.P\.|LLP|Corp\.?|Corporation|Company|Co\.?|Ltd\.?|Limited|PLC|plc|N\.V\.|S\.A\.|AG|GmbH)$/i, '')
    .replace(/\s*\([^)]*\)$/g, '')
    .trim();
}

function normalizePersonName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Prof\.?)\s+/i, '')
    .replace(/,?\s*(Jr\.?|Sr\.?|III|II|IV|Esq\.?|PhD|MD|MBA|CFA|CPA)$/i, '')
    .trim();
}

function normalizeName(name: string, category: ActorCategory): string {
  return category === 'person' ? normalizePersonName(name) : normalizeCompanyName(name);
}

export function generateAliases(name: string, category: ActorCategory): string[] {
  const aliases: string[] = [];
  const normalized = normalizeName(name, category);

  if (normalized !== name) aliases.push(normalized);

  if (category !== 'person') {
    // Remove "The" prefix
    if (normalized.toLowerCase().startsWith('the ')) {
      aliases.push(normalized.slice(4));
    }
    // Acronym for multi-word names
    const words = normalized.split(' ');
    if (words.length >= 2) {
      const acronym = words.map(w => w[0]).join('').toUpperCase();
      if (acronym.length >= 2 && acronym.length <= 5) {
        aliases.push(acronym);
      }
    }
  } else {
    // "Last, First" format
    const parts = normalized.split(' ');
    if (parts.length >= 2) {
      const lastName = parts[parts.length - 1];
      const firstName = parts.slice(0, -1).join(' ');
      aliases.push(`${lastName}, ${firstName}`);
    }
  }

  return [...new Set(aliases)];
}

// Fuzzy matching
function fuzzyMatch(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower === bLower) return 1;
  if (aLower.includes(bLower) || bLower.includes(aLower)) return 0.9;

  const distance = levenshteinDistance(aLower, bLower);
  const maxLength = Math.max(aLower.length, bLower.length);
  return 1 - (distance / maxLength);
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// Resolution types
export interface ResolveActorOptions {
  name: string;
  category?: ActorCategory;
  subtype?: ActorSubtype;
  createIfNotFound?: boolean;
  properties?: Record<string, unknown>;
  tags?: string[];
  crawlDepth?: number;
}

export interface ResolveResult {
  actor: Actor | null;
  created: boolean;
  matchScore: number;
  matchedOn?: 'name' | 'alias' | 'slug';
}

/**
 * Resolve an actor by name with fuzzy matching.
 * Optionally creates a new actor if not found.
 */
export async function resolveActor(options: ResolveActorOptions): Promise<ResolveResult> {
  const {
    name,
    category = 'organization',
    subtype = 'private_company',
    createIfNotFound = false,
    properties = {},
    tags = [],
    crawlDepth = 1,
  } = options;

  // Try exact name/alias match
  const byName = await findActorByName(name);
  if (byName) {
    return { actor: byName, created: false, matchScore: 1, matchedOn: 'name' };
  }

  // Try normalized name
  const normalized = normalizeName(name, category);
  if (normalized !== name) {
    const byNormalized = await findActorByName(normalized);
    if (byNormalized) {
      return { actor: byNormalized, created: false, matchScore: 0.95, matchedOn: 'name' };
    }
  }

  // Fuzzy search against all actors (capped for perf)
  const actors = await getActors();
  const candidates = await actors.find({}).limit(500).toArray();

  let bestMatch: Actor | null = null;
  let bestScore = 0;
  const threshold = category === 'person' ? 0.9 : 0.85;

  for (const actor of candidates) {
    const nameScore = fuzzyMatch(normalized, normalizeName(actor.canonicalName, actor.category));
    if (nameScore > bestScore && nameScore >= threshold) {
      bestScore = nameScore;
      bestMatch = actor;
    }

    for (const alias of actor.aliases) {
      const aliasScore = fuzzyMatch(normalized, alias);
      if (aliasScore > bestScore && aliasScore >= threshold) {
        bestScore = aliasScore;
        bestMatch = actor;
      }
    }
  }

  if (bestMatch) {
    // Add new alias
    const aliases = [...bestMatch.aliases];
    if (!aliases.some(a => a.toLowerCase() === name.toLowerCase())) {
      aliases.push(name);
      await updateActor(bestMatch._id!, { aliases });
    }
    return { actor: bestMatch, created: false, matchScore: bestScore, matchedOn: 'alias' };
  }

  // Not found - create if requested
  if (createIfNotFound) {
    const newActor = await createActor({
      canonicalName: name,
      aliases: generateAliases(name, category),
      slug: slugify(name),
      category,
      subtype,
      properties: properties as Actor['properties'],
      tags,
      sources: [],
      crawlDepth,
    });
    return { actor: newActor, created: true, matchScore: 1 };
  }

  return { actor: null, created: false, matchScore: 0 };
}

/**
 * Resolve multiple actors in batch
 */
export async function resolveActors(
  names: string[],
  options: {
    category?: ActorCategory;
    subtype?: ActorSubtype;
    createIfNotFound?: boolean;
    crawlDepth?: number;
  } = {}
): Promise<Map<string, ResolveResult>> {
  const results = new Map<string, ResolveResult>();
  for (const name of names) {
    const result = await resolveActor({ name, ...options });
    results.set(name, result);
  }
  return results;
}
