import { describe, it, expect } from 'vitest';
import { slugify } from '../mindmap/lib/db';
import { generateAliases } from '../mindmap/lib/resolver';
import { calculateExpansionPriority, rankByExpansionPriority } from '../mindmap/lib/expansion-priority';
import {
  getSeedActors,
  getSeedConnections,
  allSeedActors,
  allSeedConnections,
} from '../mindmap/lib/seed-data';
import { validateExtractionResult, connectionCategoryLabels, categorySubtypes } from '../mindmap/lib/extraction-schemas';
import { Actor } from '../mindmap/lib/types';
import { ObjectId } from 'mongodb';

// --- slugify ---
describe('slugify', () => {
  it('converts name to lowercase slug', () => {
    expect(slugify('Y Combinator')).toBe('y-combinator');
  });

  it('handles special characters', () => {
    expect(slugify('Founders Fund, LLC')).toBe('founders-fund-llc');
  });

  it('handles multiple spaces', () => {
    expect(slugify('Peter  Thiel')).toBe('peter-thiel');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  Hello World  ')).toBe('hello-world');
  });

  it('handles single word', () => {
    expect(slugify('PayPal')).toBe('paypal');
  });
});

// --- generateAliases ---
describe('generateAliases', () => {
  it('generates acronym for multi-word org names', () => {
    const aliases = generateAliases('Y Combinator', 'organization');
    expect(aliases).toContain('YC');
  });

  it('generates "Last, First" for person names', () => {
    const aliases = generateAliases('Peter Thiel', 'person');
    expect(aliases).toContain('Thiel, Peter');
  });

  it('removes company suffixes', () => {
    const aliases = generateAliases('Stripe, Inc.', 'organization');
    expect(aliases.some(a => a === 'Stripe')).toBe(true);
  });

  it('removes "The" prefix for organizations', () => {
    const aliases = generateAliases('The Carlyle Group', 'organization');
    expect(aliases).toContain('Carlyle Group');
  });

  it('deduplicates aliases', () => {
    const aliases = generateAliases('OpenAI', 'organization');
    const uniqueAliases = [...new Set(aliases)];
    expect(aliases.length).toBe(uniqueAliases.length);
  });
});

// --- Seed Data ---
describe('Seed Data', () => {
  it('has at least 130 seed actors', () => {
    expect(allSeedActors.length).toBeGreaterThanOrEqual(130);
  });

  it('has at least 500 seed connections', () => {
    expect(allSeedConnections.length).toBeGreaterThanOrEqual(500);
  });

  it('all actors have unique slugs', () => {
    const slugs = allSeedActors.map(a => a.slug);
    const uniqueSlugs = [...new Set(slugs)];
    expect(slugs.length).toBe(uniqueSlugs.length);
  });

  it('all actors have valid categories', () => {
    const validCategories = ['organization', 'person', 'fund', 'event'];
    for (const actor of allSeedActors) {
      expect(validCategories).toContain(actor.category);
    }
  });

  it('all connections reference existing actor slugs', () => {
    const slugs = new Set(allSeedActors.map(a => a.slug));
    for (const conn of allSeedConnections) {
      expect(slugs.has(conn.sourceSlug)).toBe(true);
      expect(slugs.has(conn.targetSlug)).toBe(true);
    }
  });

  it('getSeedActors("yc") returns only YC actors', () => {
    const ycActors = getSeedActors('yc');
    expect(ycActors.length).toBeGreaterThan(0);
    expect(ycActors.length).toBeLessThan(allSeedActors.length);
  });

  it('getSeedActors("thiel") returns only Thiel actors', () => {
    const thielActors = getSeedActors('thiel');
    expect(thielActors.length).toBeGreaterThan(0);
    expect(thielActors.length).toBeLessThan(allSeedActors.length);
  });

  it('getSeedActors("both") returns YC + Thiel actors', () => {
    const bothActors = getSeedActors('both');
    const ycActors = getSeedActors('yc');
    const thielActors = getSeedActors('thiel');
    expect(bothActors.length).toBe(ycActors.length + thielActors.length);
    expect(bothActors.length).toBeLessThan(allSeedActors.length);
  });

  it('getSeedActors("all") returns all actors', () => {
    expect(getSeedActors('all').length).toBe(allSeedActors.length);
  });

  it('getSeedConnections("yc") returns only intra-YC connections', () => {
    const ycSlugs = new Set(getSeedActors('yc').map(a => a.slug));
    const ycConns = getSeedConnections('yc');
    for (const conn of ycConns) {
      expect(ycSlugs.has(conn.sourceSlug)).toBe(true);
      expect(ycSlugs.has(conn.targetSlug)).toBe(true);
    }
  });

  it('getSeedConnections("both") includes crossover connections', () => {
    const bothConns = getSeedConnections('both');
    const ycOnlyConns = getSeedConnections('yc');
    const thielOnlyConns = getSeedConnections('thiel');
    // "both" should have more connections than either individual set
    expect(bothConns.length).toBeGreaterThan(ycOnlyConns.length);
    expect(bothConns.length).toBeGreaterThan(thielOnlyConns.length);
  });

  it('contains crossover connections between YC and Thiel ecosystems', () => {
    const ycSlugs = new Set(getSeedActors('yc').map(a => a.slug));
    const thielSlugs = new Set(getSeedActors('thiel').map(a => a.slug));
    const bothConns = getSeedConnections('both');

    const crossoverConns = bothConns.filter(c =>
      (ycSlugs.has(c.sourceSlug) && thielSlugs.has(c.targetSlug)) ||
      (thielSlugs.has(c.sourceSlug) && ycSlugs.has(c.targetSlug))
    );

    expect(crossoverConns.length).toBeGreaterThan(0);
  });
});

// --- Expansion Priority ---
describe('calculateExpansionPriority', () => {
  function makeActor(overrides: Partial<Actor> = {}): Actor {
    return {
      _id: new ObjectId(),
      canonicalName: 'Test Actor',
      aliases: [],
      slug: 'test-actor',
      category: 'organization',
      subtype: 'private_company',
      properties: {},
      tags: [],
      sources: [],
      connectionCount: 0,
      crawlDepth: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  it('gives higher priority to actors with more connections', () => {
    const low = calculateExpansionPriority(makeActor({ connectionCount: 1 }));
    const high = calculateExpansionPriority(makeActor({ connectionCount: 10 }));
    expect(high).toBeGreaterThan(low);
  });

  it('gives +50 bonus to uncrawled actors', () => {
    const crawled = calculateExpansionPriority(makeActor({ lastCrawledAt: new Date() }));
    const uncrawled = calculateExpansionPriority(makeActor({ lastCrawledAt: undefined }));
    expect(uncrawled - crawled).toBe(50);
  });

  it('gives +30 bonus to vc_fund subtype', () => {
    const regular = calculateExpansionPriority(makeActor({ subtype: 'private_company' }));
    const fund = calculateExpansionPriority(makeActor({ subtype: 'vc_fund' }));
    expect(fund).toBeGreaterThan(regular);
  });

  it('gives +25 crossover tag bonus', () => {
    const noTag = calculateExpansionPriority(makeActor({ tags: [] }));
    const withTag = calculateExpansionPriority(makeActor({ tags: ['paypal-mafia'] }));
    expect(withTag - noTag).toBe(25);
  });

  it('caps connectionCount contribution at 100', () => {
    const score50 = calculateExpansionPriority(makeActor({ connectionCount: 50 }));
    const score100 = calculateExpansionPriority(makeActor({ connectionCount: 100 }));
    // Both should get max 100 from connections since 50*10=500 is capped at 100
    expect(score50).toBe(score100);
  });

  it('rankByExpansionPriority sorts descending', () => {
    const actors = [
      makeActor({ canonicalName: 'Low', connectionCount: 0, lastCrawledAt: new Date() }),
      makeActor({ canonicalName: 'High', connectionCount: 5, subtype: 'vc_fund', tags: ['paypal-mafia'] }),
    ];
    const ranked = rankByExpansionPriority(actors);
    expect(ranked[0].canonicalName).toBe('High');
    expect(ranked[1].canonicalName).toBe('Low');
  });
});

// --- Extraction Schemas ---
describe('validateExtractionResult', () => {
  it('validates correct actors', () => {
    const result = validateExtractionResult({
      actors: [
        { name: 'Peter Thiel', category: 'person', subtype: 'investor', confidence: 0.95 },
      ],
      connections: [],
    });
    expect(result.actors.length).toBe(1);
    expect(result.actors[0].name).toBe('Peter Thiel');
  });

  it('validates correct connections', () => {
    const result = validateExtractionResult({
      actors: [],
      connections: [
        {
          sourceName: 'Peter Thiel',
          targetName: 'PayPal',
          category: 'co_founded',
          directed: true,
          confidence: 1.0,
        },
      ],
    });
    expect(result.connections.length).toBe(1);
    expect(result.connections[0].category).toBe('co_founded');
  });

  it('drops invalid actors silently', () => {
    const result = validateExtractionResult({
      actors: [
        { name: '', category: 'person', subtype: 'investor', confidence: 0.5 }, // empty name
        { name: 'Valid', category: 'person', subtype: 'investor', confidence: 0.5 },
      ],
      connections: [],
    });
    expect(result.actors.length).toBe(1);
    expect(result.actors[0].name).toBe('Valid');
  });

  it('drops connections with invalid category', () => {
    const result = validateExtractionResult({
      actors: [],
      connections: [
        {
          sourceName: 'A',
          targetName: 'B',
          category: 'not_a_real_category',
          directed: true,
          confidence: 0.5,
        },
      ],
    });
    expect(result.connections.length).toBe(0);
  });

  it('handles null/undefined input gracefully', () => {
    expect(validateExtractionResult(null).actors.length).toBe(0);
    expect(validateExtractionResult(undefined).connections.length).toBe(0);
    expect(validateExtractionResult({}).actors.length).toBe(0);
  });

  it('drops actors with confidence out of range', () => {
    const result = validateExtractionResult({
      actors: [
        { name: 'Bad', category: 'person', subtype: 'investor', confidence: 1.5 },
      ],
      connections: [],
    });
    expect(result.actors.length).toBe(0);
  });
});

describe('connectionCategoryLabels', () => {
  it('has labels for all connection categories', () => {
    const expectedCategories = [
      'invested_in', 'co_invested', 'led_round', 'limited_partner_of',
      'founded', 'co_founded', 'executive_at', 'board_member_at',
      'partner_at', 'advisor_to', 'employee_at',
      'acquired', 'merged_with', 'subsidiary_of', 'strategic_partner',
      'alumni_of', 'classmate_of', 'mentor_of', 'graduated_from',
      'participated_in_batch', 'manages_fund',
    ];
    for (const cat of expectedCategories) {
      expect(connectionCategoryLabels[cat]).toBeDefined();
    }
  });
});

describe('categorySubtypes', () => {
  it('has subtypes for all actor categories', () => {
    expect(categorySubtypes.organization.length).toBeGreaterThan(0);
    expect(categorySubtypes.person.length).toBeGreaterThan(0);
    expect(categorySubtypes.fund.length).toBeGreaterThan(0);
    expect(categorySubtypes.event.length).toBeGreaterThan(0);
  });
});
