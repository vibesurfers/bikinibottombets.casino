import { ObjectId } from 'mongodb';
import {
  Organization,
  Person,
  OrgType,
} from './org-spider-types';
import {
  getOrganizations,
  getPersons,
  findOrganizationByName,
  findOrganizationByTicker,
  findOrganizationByCik,
  createOrganization,
  findPersonByName,
  createPerson,
  updateOrganization,
  updatePerson,
} from './org-spider-db';

// Name normalization utilities
function normalizeCompanyName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    // Remove common suffixes
    .replace(/,?\s*(Inc\.?|LLC|LP|L\.P\.|LLP|Corp\.?|Corporation|Company|Co\.?|Ltd\.?|Limited|PLC|plc|N\.V\.|S\.A\.|AG|GmbH)$/i, '')
    .replace(/\s*\([^)]*\)$/g, '') // Remove parenthetical suffixes
    .trim();
}

function normalizePersonName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    // Remove titles
    .replace(/^(Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Prof\.?)\s+/i, '')
    // Remove suffixes
    .replace(/,?\s*(Jr\.?|Sr\.?|III|II|IV|Esq\.?|PhD|MD|MBA|CFA|CPA)$/i, '')
    .trim();
}

function generateAliases(name: string, type: 'organization' | 'person'): string[] {
  const aliases: string[] = [];
  const normalized = type === 'organization' ? normalizeCompanyName(name) : normalizePersonName(name);

  if (normalized !== name) {
    aliases.push(normalized);
  }

  if (type === 'organization') {
    // Add version without "The"
    if (normalized.toLowerCase().startsWith('the ')) {
      aliases.push(normalized.slice(4));
    }
    // Add abbreviated versions for multi-word names
    const words = normalized.split(' ');
    if (words.length >= 2) {
      // Acronym
      const acronym = words.map(w => w[0]).join('').toUpperCase();
      if (acronym.length >= 2 && acronym.length <= 5) {
        aliases.push(acronym);
      }
    }
  } else {
    // For persons, add "Last, First" format
    const parts = normalized.split(' ');
    if (parts.length >= 2) {
      const lastName = parts[parts.length - 1];
      const firstName = parts.slice(0, -1).join(' ');
      aliases.push(`${lastName}, ${firstName}`);
    }
  }

  return [...new Set(aliases)];
}

// Fuzzy matching score (0-1)
function fuzzyMatch(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower === bLower) return 1;

  // Check if one contains the other
  if (aLower.includes(bLower) || bLower.includes(aLower)) {
    return 0.9;
  }

  // Levenshtein distance based score
  const distance = levenshteinDistance(aLower, bLower);
  const maxLength = Math.max(aLower.length, bLower.length);
  const similarity = 1 - (distance / maxLength);

  return similarity;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

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

export interface ResolveOrganizationOptions {
  name: string;
  ticker?: string;
  cik?: string;
  orgType?: OrgType;
  createIfNotFound?: boolean;
  additionalData?: Partial<Organization>;
}

export interface ResolvePersonOptions {
  name: string;
  organizationId?: ObjectId;
  title?: string;
  createIfNotFound?: boolean;
  additionalData?: Partial<Person>;
}

export interface ResolveResult<T> {
  entity: T | null;
  created: boolean;
  matchScore: number;
  matchedOn?: 'ticker' | 'cik' | 'name' | 'alias';
}

/**
 * Resolve an organization by ticker, CIK, or name with fuzzy matching.
 * Optionally creates a new organization if not found.
 */
export async function resolveOrganization(
  options: ResolveOrganizationOptions
): Promise<ResolveResult<Organization>> {
  const { name, ticker, cik, orgType, createIfNotFound = false, additionalData = {} } = options;

  // Try exact matches first (most reliable)
  if (ticker) {
    const byTicker = await findOrganizationByTicker(ticker);
    if (byTicker) {
      return { entity: byTicker, created: false, matchScore: 1, matchedOn: 'ticker' };
    }
  }

  if (cik) {
    const byCik = await findOrganizationByCik(cik);
    if (byCik) {
      return { entity: byCik, created: false, matchScore: 1, matchedOn: 'cik' };
    }
  }

  // Try exact name match
  const byName = await findOrganizationByName(name);
  if (byName) {
    return { entity: byName, created: false, matchScore: 1, matchedOn: 'name' };
  }

  // Try fuzzy matching
  const normalized = normalizeCompanyName(name);
  const byNormalizedName = await findOrganizationByName(normalized);
  if (byNormalizedName) {
    return { entity: byNormalizedName, created: false, matchScore: 0.95, matchedOn: 'name' };
  }

  // Search for similar organizations
  const orgs = await getOrganizations();
  const candidates = await orgs.find({}).limit(500).toArray();

  let bestMatch: Organization | null = null;
  let bestScore = 0;

  for (const org of candidates) {
    // Check canonical name
    const nameScore = fuzzyMatch(normalized, normalizeCompanyName(org.canonicalName));
    if (nameScore > bestScore && nameScore >= 0.85) {
      bestScore = nameScore;
      bestMatch = org;
    }

    // Check aliases
    for (const alias of org.aliases) {
      const aliasScore = fuzzyMatch(normalized, normalizeCompanyName(alias));
      if (aliasScore > bestScore && aliasScore >= 0.85) {
        bestScore = aliasScore;
        bestMatch = org;
      }
    }
  }

  if (bestMatch) {
    // Add new alias if we found a close match
    const aliases = [...bestMatch.aliases];
    if (!aliases.some(a => a.toLowerCase() === name.toLowerCase())) {
      aliases.push(name);
      await updateOrganization(bestMatch._id!, { aliases });
    }
    return { entity: bestMatch, created: false, matchScore: bestScore, matchedOn: 'alias' };
  }

  // Not found - create if requested
  if (createIfNotFound) {
    const newOrg = await createOrganization({
      canonicalName: name,
      aliases: generateAliases(name, 'organization'),
      ticker: ticker?.toUpperCase(),
      cik,
      orgType: orgType || 'private_company',
      ...additionalData,
    });
    return { entity: newOrg, created: true, matchScore: 1 };
  }

  return { entity: null, created: false, matchScore: 0 };
}

/**
 * Resolve a person by name with fuzzy matching.
 * Optionally creates a new person if not found.
 */
export async function resolveOrCreatePerson(
  options: ResolvePersonOptions
): Promise<ResolveResult<Person>> {
  const { name, organizationId, title, createIfNotFound = false, additionalData = {} } = options;

  // Try exact name match
  const byName = await findPersonByName(name);
  if (byName) {
    // If we have new role info, update it
    if (organizationId && title && !byName.currentRole) {
      await updatePerson(byName._id!, {
        currentRole: { organizationId, title, startDate: new Date() },
      });
    }
    return { entity: byName, created: false, matchScore: 1, matchedOn: 'name' };
  }

  // Try normalized name match
  const normalized = normalizePersonName(name);
  const byNormalizedName = await findPersonByName(normalized);
  if (byNormalizedName) {
    return { entity: byNormalizedName, created: false, matchScore: 0.95, matchedOn: 'name' };
  }

  // Fuzzy search
  const persons = await getPersons();
  const candidates = await persons.find({}).limit(1000).toArray();

  let bestMatch: Person | null = null;
  let bestScore = 0;

  for (const person of candidates) {
    const nameScore = fuzzyMatch(normalized, normalizePersonName(person.fullName));
    if (nameScore > bestScore && nameScore >= 0.9) {
      bestScore = nameScore;
      bestMatch = person;
    }

    for (const alias of person.aliases) {
      const aliasScore = fuzzyMatch(normalized, normalizePersonName(alias));
      if (aliasScore > bestScore && aliasScore >= 0.9) {
        bestScore = aliasScore;
        bestMatch = person;
      }
    }
  }

  if (bestMatch) {
    // Add alias if new variation found
    const aliases = [...bestMatch.aliases];
    if (!aliases.some(a => a.toLowerCase() === name.toLowerCase())) {
      aliases.push(name);
      await updatePerson(bestMatch._id!, { aliases });
    }
    return { entity: bestMatch, created: false, matchScore: bestScore, matchedOn: 'alias' };
  }

  // Not found - create if requested
  if (createIfNotFound) {
    const newPerson = await createPerson({
      fullName: name,
      aliases: generateAliases(name, 'person'),
      currentRole: organizationId && title
        ? { organizationId, title, startDate: new Date() }
        : undefined,
      ...additionalData,
    });
    return { entity: newPerson, created: true, matchScore: 1 };
  }

  return { entity: null, created: false, matchScore: 0 };
}

/**
 * Resolve multiple organizations in batch (more efficient for bulk operations)
 */
export async function resolveOrganizations(
  names: string[],
  options: { createIfNotFound?: boolean; orgType?: OrgType } = {}
): Promise<Map<string, ResolveResult<Organization>>> {
  const results = new Map<string, ResolveResult<Organization>>();

  for (const name of names) {
    const result = await resolveOrganization({
      name,
      createIfNotFound: options.createIfNotFound,
      orgType: options.orgType,
    });
    results.set(name, result);
  }

  return results;
}

/**
 * Resolve multiple persons in batch
 */
export async function resolvePersons(
  names: string[],
  options: { createIfNotFound?: boolean; organizationId?: ObjectId } = {}
): Promise<Map<string, ResolveResult<Person>>> {
  const results = new Map<string, ResolveResult<Person>>();

  for (const name of names) {
    const result = await resolveOrCreatePerson({
      name,
      createIfNotFound: options.createIfNotFound,
      organizationId: options.organizationId,
    });
    results.set(name, result);
  }

  return results;
}
