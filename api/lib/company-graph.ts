/**
 * Company Relationship Graph
 *
 * Bloomberg SPLC-like feature for extracting and storing company relationships
 * (customers, suppliers, shareholders, subsidiaries, competitors) from SEC filings.
 */

import { ObjectId, Collection } from 'mongodb';
import { connectToDatabase } from './db';
import { config } from './config';
import {
  lookupCIK,
  getRecentFilings,
  getFilingDocuments,
  SECFiling,
} from './sec-edgar';
import { scrapeUrl } from './services';

// ============= TYPES =============

export type EntityType = 'public_company' | 'private_company' | 'government' | 'institution' | 'individual';

export type RelationshipType = 'customer' | 'supplier' | 'competitor' | 'subsidiary' | 'shareholder' | 'partner';

export interface CompanyEntity {
  _id?: ObjectId;
  canonicalName: string;
  aliases: string[];
  ticker?: string;
  cik?: string;
  entityType: EntityType;
  sector?: string;
  industry?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RelationshipEvidence {
  filingType: string;
  filingDate: string;
  section: string;
  extractedText: string;
  sourceUrl: string;
}

export interface RelationshipMetadata {
  ownershipPercent?: number;
  revenuePercent?: number;
  description?: string;
}

export interface CompanyRelationship {
  _id?: ObjectId;
  sourceEntityId: ObjectId;
  targetEntityId: ObjectId;
  relationshipType: RelationshipType;
  confidence: number;
  evidence: RelationshipEvidence[];
  metadata: RelationshipMetadata;
  firstSeen: Date;
  lastVerified: Date;
}

export interface ExtractedRelationship {
  relatedEntity: string;
  relationshipType: RelationshipType;
  confidence: number;
  evidence: string;
  metadata: RelationshipMetadata;
}

export interface CompanyGraph {
  entity: CompanyEntity;
  customers: Array<{ entity: CompanyEntity; relationship: CompanyRelationship }>;
  suppliers: Array<{ entity: CompanyEntity; relationship: CompanyRelationship }>;
  competitors: Array<{ entity: CompanyEntity; relationship: CompanyRelationship }>;
  subsidiaries: Array<{ entity: CompanyEntity; relationship: CompanyRelationship }>;
  shareholders: Array<{ entity: CompanyEntity; relationship: CompanyRelationship }>;
  partners: Array<{ entity: CompanyEntity; relationship: CompanyRelationship }>;
}

// ============= COLLECTION HELPERS =============

async function getCompanyEntities(): Promise<Collection<CompanyEntity>> {
  const { db } = await connectToDatabase();
  return db.collection<CompanyEntity>('companyEntities');
}

async function getCompanyRelationships(): Promise<Collection<CompanyRelationship>> {
  const { db } = await connectToDatabase();
  return db.collection<CompanyRelationship>('companyRelationships');
}

// ============= NAME NORMALIZATION =============

/**
 * Common suffixes to remove for normalization
 */
const COMPANY_SUFFIXES = [
  ', Inc.',
  ', Inc',
  ' Inc.',
  ' Inc',
  ', LLC',
  ' LLC',
  ', Ltd.',
  ', Ltd',
  ' Ltd.',
  ' Ltd',
  ', L.P.',
  ' L.P.',
  ', LP',
  ' LP',
  ' Corporation',
  ' Corp.',
  ' Corp',
  ' Company',
  ' Co.',
  ' Co',
  ', PLC',
  ' PLC',
  ' AG',
  ' SA',
  ' NV',
  ' SE',
  ' GmbH',
  ' Limited',
];

/**
 * Common name variations mapping
 */
const NAME_ALIASES: Record<string, string[]> = {
  'Apple': ['Apple Inc', 'Apple Computer', 'AAPL'],
  'Microsoft': ['Microsoft Corporation', 'MSFT'],
  'Google': ['Alphabet', 'Alphabet Inc', 'GOOGL', 'GOOG'],
  'Amazon': ['Amazon.com', 'AMZN'],
  'Meta': ['Facebook', 'Meta Platforms', 'FB', 'META'],
  'NVIDIA': ['Nvidia Corporation', 'NVDA'],
  'TSMC': ['Taiwan Semiconductor', 'Taiwan Semiconductor Manufacturing'],
  'Samsung': ['Samsung Electronics'],
  'Intel': ['Intel Corporation', 'INTC'],
  'AMD': ['Advanced Micro Devices', 'Advanced Micro Devices Inc'],
};

/**
 * Normalize a company name for matching
 */
export function normalizeCompanyName(name: string): string {
  let normalized = name.trim();

  // Remove common suffixes
  for (const suffix of COMPANY_SUFFIXES) {
    if (normalized.toLowerCase().endsWith(suffix.toLowerCase())) {
      normalized = normalized.slice(0, -suffix.length).trim();
    }
  }

  // Remove extra whitespace
  normalized = normalized.replace(/\s+/g, ' ');

  // Remove special characters but keep alphanumeric and spaces
  normalized = normalized.replace(/[^\w\s]/g, '');

  return normalized.trim();
}

/**
 * Check if two names likely refer to the same company
 */
export function namesMatch(name1: string, name2: string): boolean {
  const n1 = normalizeCompanyName(name1).toLowerCase();
  const n2 = normalizeCompanyName(name2).toLowerCase();

  if (n1 === n2) return true;

  // Check if one contains the other (for partial matches)
  if (n1.includes(n2) || n2.includes(n1)) return true;

  // Check known aliases
  for (const [canonical, aliases] of Object.entries(NAME_ALIASES)) {
    const allNames = [canonical.toLowerCase(), ...aliases.map(a => a.toLowerCase())];
    if (allNames.includes(n1) && allNames.includes(n2)) return true;
  }

  return false;
}

// ============= ENTITY RESOLUTION =============

/**
 * Find or create a normalized company entity
 */
export async function resolveEntity(
  name: string,
  options: {
    ticker?: string;
    cik?: string;
    entityType?: EntityType;
  } = {}
): Promise<CompanyEntity> {
  const entities = await getCompanyEntities();
  const normalizedName = normalizeCompanyName(name);

  // Try to find existing entity by ticker (most reliable)
  if (options.ticker) {
    const byTicker = await entities.findOne({ ticker: options.ticker.toUpperCase() });
    if (byTicker) {
      // Update aliases if name is new
      if (!byTicker.aliases.some(a => namesMatch(a, name))) {
        await entities.updateOne(
          { _id: byTicker._id },
          {
            $addToSet: { aliases: name },
            $set: { updatedAt: new Date() }
          }
        );
        byTicker.aliases.push(name);
      }
      return byTicker;
    }
  }

  // Try to find by CIK
  if (options.cik) {
    const byCik = await entities.findOne({ cik: options.cik });
    if (byCik) {
      if (!byCik.aliases.some(a => namesMatch(a, name))) {
        await entities.updateOne(
          { _id: byCik._id },
          {
            $addToSet: { aliases: name },
            $set: { updatedAt: new Date() }
          }
        );
        byCik.aliases.push(name);
      }
      return byCik;
    }
  }

  // Try to find by canonical name or alias
  const byName = await entities.findOne({
    $or: [
      { canonicalName: { $regex: `^${escapeRegex(normalizedName)}$`, $options: 'i' } },
      { aliases: { $elemMatch: { $regex: `^${escapeRegex(normalizedName)}$`, $options: 'i' } } }
    ]
  });

  if (byName) {
    if (!byName.aliases.some(a => namesMatch(a, name))) {
      await entities.updateOne(
        { _id: byName._id },
        {
          $addToSet: { aliases: name },
          $set: { updatedAt: new Date() }
        }
      );
      byName.aliases.push(name);
    }
    return byName;
  }

  // Create new entity
  const newEntity: CompanyEntity = {
    canonicalName: normalizedName,
    aliases: [name],
    ticker: options.ticker?.toUpperCase(),
    cik: options.cik,
    entityType: options.entityType || 'private_company',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await entities.insertOne(newEntity as any);
  newEntity._id = result.insertedId;

  return newEntity;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============= RELATIONSHIP STORAGE =============

/**
 * Add or update a relationship between two entities
 */
export async function addRelationship(
  sourceEntity: CompanyEntity,
  targetEntity: CompanyEntity,
  relationshipType: RelationshipType,
  evidence: RelationshipEvidence,
  confidence: number,
  metadata: RelationshipMetadata = {}
): Promise<CompanyRelationship> {
  const relationships = await getCompanyRelationships();

  // Check for existing relationship
  const existing = await relationships.findOne({
    sourceEntityId: sourceEntity._id!,
    targetEntityId: targetEntity._id!,
    relationshipType,
  });

  if (existing) {
    // Update existing relationship with new evidence
    const evidenceExists = existing.evidence.some(
      e => e.sourceUrl === evidence.sourceUrl && e.section === evidence.section
    );

    const updates: any = {
      $set: {
        lastVerified: new Date(),
        confidence: Math.max(existing.confidence, confidence),
      }
    };

    if (!evidenceExists) {
      updates.$push = { evidence };
    }

    // Merge metadata
    if (metadata.ownershipPercent !== undefined) {
      updates.$set['metadata.ownershipPercent'] = metadata.ownershipPercent;
    }
    if (metadata.revenuePercent !== undefined) {
      updates.$set['metadata.revenuePercent'] = metadata.revenuePercent;
    }
    if (metadata.description) {
      updates.$set['metadata.description'] = metadata.description;
    }

    await relationships.updateOne({ _id: existing._id }, updates);

    return {
      ...existing,
      lastVerified: new Date(),
      confidence: Math.max(existing.confidence, confidence),
    };
  }

  // Create new relationship
  const newRelationship: CompanyRelationship = {
    sourceEntityId: sourceEntity._id!,
    targetEntityId: targetEntity._id!,
    relationshipType,
    confidence,
    evidence: [evidence],
    metadata,
    firstSeen: new Date(),
    lastVerified: new Date(),
  };

  const result = await relationships.insertOne(newRelationship as any);
  newRelationship._id = result.insertedId;

  return newRelationship;
}

// ============= LLM EXTRACTION =============

/**
 * Extract company relationships from SEC filing text using Gemini API
 * Uses Gemini for cost-effective large-scale processing of SEC filings
 */
export async function extractRelationshipsFromText(
  text: string,
  sourceCompany: string,
  sectionType: 'business' | 'risk_factors' | 'exhibit_21' | 'general' = 'general'
): Promise<ExtractedRelationship[]> {
  const apiKey = config.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[CompanyGraph] GEMINI_API_KEY not set, skipping LLM extraction');
    return [];
  }

  // Gemini 2.0 Flash has 1M token context - can handle large SEC filings
  // Truncate to ~200k chars to be safe (~50k tokens)
  const maxChars = 200000;
  const truncatedText = text.length > maxChars ? text.substring(0, maxChars) + '...[truncated]' : text;

  const sectionPrompts: Record<string, string> = {
    business: `Focus on extracting:
- Major customers (especially those contributing >10% of revenue)
- Key suppliers and manufacturers
- Strategic partners and joint ventures
- Competitors mentioned in competitive landscape discussions`,
    risk_factors: `Focus on extracting:
- Competitors mentioned as competitive threats
- Customer concentration risks (large customers)
- Supplier dependencies and single-source suppliers
- Partner/vendor risks`,
    exhibit_21: `Focus on extracting:
- ALL subsidiaries listed (these are subsidiary relationships)
- Parent company relationships
- Note the jurisdiction/state for each subsidiary`,
    general: `Focus on extracting:
- Customer relationships
- Supplier relationships
- Competitor mentions
- Subsidiary/parent relationships
- Strategic partnerships`,
  };

  const prompt = `Extract business relationships from this SEC filing text for ${sourceCompany}.

${sectionPrompts[sectionType]}

For each relationship found, provide:
- relatedEntity: The company/organization name (as written in the document)
- relationshipType: One of: customer, supplier, competitor, subsidiary, shareholder, partner
- confidence: 0.0-1.0 based on how explicitly stated the relationship is
- evidence: The exact quote from the text (keep it concise, max 200 chars)
- metadata: Include ownershipPercent for subsidiaries, revenuePercent for customers if mentioned

Return ONLY a valid JSON array. If no relationships found, return [].

Example output:
[
  {
    "relatedEntity": "TSMC",
    "relationshipType": "supplier",
    "confidence": 0.9,
    "evidence": "We rely on Taiwan Semiconductor Manufacturing Company for the production of our chips",
    "metadata": {}
  }
]

Text to analyze:
${truncatedText}`;

  try {
    // Use Gemini 2.0 Flash for cost-effective large-scale processing
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1, // Low temperature for consistent extraction
            maxOutputTokens: 8192,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[CompanyGraph] Gemini API error:', error);
      return [];
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('[CompanyGraph] No JSON array found in response');
      return [];
    }

    const relationships: ExtractedRelationship[] = JSON.parse(jsonMatch[0]);

    // Validate and clean up
    return relationships.filter(r =>
      r.relatedEntity &&
      ['customer', 'supplier', 'competitor', 'subsidiary', 'shareholder', 'partner'].includes(r.relationshipType) &&
      typeof r.confidence === 'number' &&
      r.confidence >= 0 &&
      r.confidence <= 1
    );
  } catch (error: any) {
    console.error('[CompanyGraph] LLM extraction failed:', error.message);
    return [];
  }
}

/**
 * Process extracted relationships and store them in the database
 */
export async function processAndStoreRelationships(
  sourceCompany: string,
  sourceTicker: string | undefined,
  extracted: ExtractedRelationship[],
  filingInfo: { filingType: string; filingDate: string; section: string; sourceUrl: string }
): Promise<CompanyRelationship[]> {
  if (extracted.length === 0) return [];

  // Resolve source entity
  const sourceEntity = await resolveEntity(sourceCompany, {
    ticker: sourceTicker,
    entityType: 'public_company',
  });

  const storedRelationships: CompanyRelationship[] = [];

  for (const rel of extracted) {
    try {
      // Resolve target entity
      const targetEntity = await resolveEntity(rel.relatedEntity, {
        entityType: rel.relationshipType === 'subsidiary' ? 'private_company' : undefined,
      });

      // Skip self-references
      if (sourceEntity._id?.equals(targetEntity._id!)) continue;

      // Create evidence record
      const evidence: RelationshipEvidence = {
        filingType: filingInfo.filingType,
        filingDate: filingInfo.filingDate,
        section: filingInfo.section,
        extractedText: rel.evidence.substring(0, 500),
        sourceUrl: filingInfo.sourceUrl,
      };

      // Store relationship
      const relationship = await addRelationship(
        sourceEntity,
        targetEntity,
        rel.relationshipType,
        evidence,
        rel.confidence,
        rel.metadata
      );

      storedRelationships.push(relationship);
    } catch (error: any) {
      console.warn(`[CompanyGraph] Failed to store relationship for ${rel.relatedEntity}:`, error.message);
    }
  }

  return storedRelationships;
}

// ============= 13F SHAREHOLDER PARSING =============

interface Holding13F {
  nameOfIssuer: string;
  titleOfClass: string;
  cusip: string;
  value: number;
  shares: number;
  shrsOrPrnAmt: string;
  investmentDiscretion: string;
  votingAuthority: {
    sole: number;
    shared: number;
    none: number;
  };
}

/**
 * Parse 13F XML for institutional holdings
 */
export function parse13FHoldings(xml: string): Holding13F[] {
  const holdings: Holding13F[] = [];

  // Simple XML parsing for 13F info table
  const infoTableRegex = /<infoTable>([\s\S]*?)<\/infoTable>/gi;
  let match;

  while ((match = infoTableRegex.exec(xml)) !== null) {
    const entry = match[1];

    const getValue = (tag: string): string => {
      const tagMatch = entry.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'));
      return tagMatch ? tagMatch[1].trim() : '';
    };

    const getNumber = (tag: string): number => {
      const val = getValue(tag);
      return parseInt(val.replace(/,/g, ''), 10) || 0;
    };

    holdings.push({
      nameOfIssuer: getValue('nameOfIssuer'),
      titleOfClass: getValue('titleOfClass'),
      cusip: getValue('cusip'),
      value: getNumber('value') * 1000, // 13F reports in thousands
      shares: getNumber('sshPrnamt'),
      shrsOrPrnAmt: getValue('sshPrnamtType'),
      investmentDiscretion: getValue('investmentDiscretion'),
      votingAuthority: {
        sole: getNumber('Sole'),
        shared: getNumber('Shared'),
        none: getNumber('None'),
      },
    });
  }

  return holdings;
}

/**
 * Get major institutional shareholders for a company from 13F filings.
 * Delegates to sec-extractors for actual 13F XML parsing.
 */
export async function getInstitutionalOwners(
  ticker: string
): Promise<Array<{
  institutionName: string;
  cik: string;
  shares: number;
  value: number;
  filingDate: string;
}>> {
  try {
    const { getInstitutionalHolders } = await import('./sec-extractors');
    const holders = await getInstitutionalHolders(ticker, 10);

    return holders.map(h => ({
      institutionName: h.institutionName,
      cik: h.cik || '',
      shares: h.sharesHeld,
      value: h.value,
      filingDate: h.reportDate.toISOString().split('T')[0],
    }));
  } catch (error: any) {
    console.error('[CompanyGraph] 13F shareholder lookup failed:', error.message);
    return [];
  }
}

function getDateMonthsAgo(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().split('T')[0];
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

// ============= GRAPH QUERIES =============

/**
 * Get the full relationship graph for a company
 */
export async function getCompanyGraph(ticker: string): Promise<CompanyGraph | null> {
  const entities = await getCompanyEntities();
  const relationships = await getCompanyRelationships();

  // Find the source entity
  const entity = await entities.findOne({ ticker: ticker.toUpperCase() });
  if (!entity) {
    return null;
  }

  // Get all relationships where this entity is the source
  const allRelationships = await relationships
    .find({ sourceEntityId: entity._id })
    .toArray();

  // Group by type and resolve target entities
  const graph: CompanyGraph = {
    entity,
    customers: [],
    suppliers: [],
    competitors: [],
    subsidiaries: [],
    shareholders: [],
    partners: [],
  };

  for (const rel of allRelationships) {
    const targetEntity = await entities.findOne({ _id: rel.targetEntityId });
    if (!targetEntity) continue;

    const item = { entity: targetEntity, relationship: rel };

    switch (rel.relationshipType) {
      case 'customer':
        graph.customers.push(item);
        break;
      case 'supplier':
        graph.suppliers.push(item);
        break;
      case 'competitor':
        graph.competitors.push(item);
        break;
      case 'subsidiary':
        graph.subsidiaries.push(item);
        break;
      case 'shareholder':
        graph.shareholders.push(item);
        break;
      case 'partner':
        graph.partners.push(item);
        break;
    }
  }

  // Sort each category by confidence
  const sortByConfidence = (a: any, b: any) => b.relationship.confidence - a.relationship.confidence;
  graph.customers.sort(sortByConfidence);
  graph.suppliers.sort(sortByConfidence);
  graph.competitors.sort(sortByConfidence);
  graph.subsidiaries.sort(sortByConfidence);
  graph.shareholders.sort(sortByConfidence);
  graph.partners.sort(sortByConfidence);

  return graph;
}

/**
 * Get relationships of a specific type for a company
 */
export async function getRelationshipsByType(
  entityId: ObjectId,
  type: RelationshipType
): Promise<Array<{ entity: CompanyEntity; relationship: CompanyRelationship }>> {
  const entities = await getCompanyEntities();
  const relationships = await getCompanyRelationships();

  const rels = await relationships
    .find({ sourceEntityId: entityId, relationshipType: type })
    .sort({ confidence: -1 })
    .toArray();

  const results: Array<{ entity: CompanyEntity; relationship: CompanyRelationship }> = [];

  for (const rel of rels) {
    const targetEntity = await entities.findOne({ _id: rel.targetEntityId });
    if (targetEntity) {
      results.push({ entity: targetEntity, relationship: rel });
    }
  }

  return results;
}

/**
 * Get supply chain (customers + suppliers) for a company
 */
export async function getSupplyChain(ticker: string): Promise<{
  customers: Array<{ name: string; revenuePercent?: number; confidence: number }>;
  suppliers: Array<{ name: string; description?: string; confidence: number }>;
}> {
  const graph = await getCompanyGraph(ticker);
  if (!graph) {
    return { customers: [], suppliers: [] };
  }

  return {
    customers: graph.customers.map(c => ({
      name: c.entity.canonicalName,
      revenuePercent: c.relationship.metadata.revenuePercent,
      confidence: c.relationship.confidence,
    })),
    suppliers: graph.suppliers.map(s => ({
      name: s.entity.canonicalName,
      description: s.relationship.metadata.description,
      confidence: s.relationship.confidence,
    })),
  };
}

/**
 * Get competitors for a company
 */
export async function getCompetitors(ticker: string): Promise<Array<{
  name: string;
  description?: string;
  confidence: number;
}>> {
  const graph = await getCompanyGraph(ticker);
  if (!graph) {
    return [];
  }

  return graph.competitors.map(c => ({
    name: c.entity.canonicalName,
    description: c.relationship.metadata.description,
    confidence: c.relationship.confidence,
  }));
}

// ============= SEC FILING EXTRACTION =============

/**
 * Extract relationships from a company's SEC filings
 */
export async function extractRelationshipsFromSECFilings(
  ticker: string,
  companyName: string
): Promise<{
  relationships: CompanyRelationship[];
  summary: {
    customers: string[];
    suppliers: string[];
    competitors: string[];
    subsidiaries: string[];
  };
}> {
  const cik = await lookupCIK(ticker);
  if (!cik) {
    console.warn(`[CompanyGraph] Could not find CIK for ${ticker}`);
    return {
      relationships: [],
      summary: { customers: [], suppliers: [], competitors: [], subsidiaries: [] },
    };
  }

  const allRelationships: CompanyRelationship[] = [];
  const summary = {
    customers: [] as string[],
    suppliers: [] as string[],
    competitors: [] as string[],
    subsidiaries: [] as string[],
  };

  // Get recent 10-K filing
  const filings = await getRecentFilings(cik, ['10-K'], 1);
  if (filings.length === 0) {
    console.warn(`[CompanyGraph] No 10-K found for ${ticker}`);
    return { relationships: allRelationships, summary };
  }

  const filing = filings[0];
  console.log(`[CompanyGraph] Processing 10-K from ${filing.filingDate} for ${ticker}`);

  try {
    // Fetch and scrape the 10-K
    const scraped = await scrapeUrl(filing.documentUrl);
    const content = scraped.markdown || '';

    if (content.length < 1000) {
      console.warn(`[CompanyGraph] 10-K content too short for ${ticker}`);
      return { relationships: allRelationships, summary };
    }

    // Extract sections for targeted analysis
    const sections = extractSections(content);

    // Process each section with appropriate prompts
    if (sections.business) {
      console.log(`[CompanyGraph] Analyzing Item 1 (Business) section...`);
      const extracted = await extractRelationshipsFromText(
        sections.business,
        companyName,
        'business'
      );
      const stored = await processAndStoreRelationships(
        companyName,
        ticker,
        extracted,
        {
          filingType: '10-K',
          filingDate: filing.filingDate,
          section: 'Item 1 - Business',
          sourceUrl: filing.documentUrl,
        }
      );
      allRelationships.push(...stored);
    }

    if (sections.riskFactors) {
      console.log(`[CompanyGraph] Analyzing Item 1A (Risk Factors) section...`);
      const extracted = await extractRelationshipsFromText(
        sections.riskFactors,
        companyName,
        'risk_factors'
      );
      const stored = await processAndStoreRelationships(
        companyName,
        ticker,
        extracted,
        {
          filingType: '10-K',
          filingDate: filing.filingDate,
          section: 'Item 1A - Risk Factors',
          sourceUrl: filing.documentUrl,
        }
      );
      allRelationships.push(...stored);
    }

    // Try to find Exhibit 21 (subsidiaries)
    const documents = await getFilingDocuments(cik, filing.accessionNumber);
    const exhibit21 = documents.find(d =>
      d.name.toLowerCase().includes('ex21') ||
      d.name.toLowerCase().includes('exhibit21')
    );

    if (exhibit21) {
      console.log(`[CompanyGraph] Found Exhibit 21, extracting subsidiaries...`);
      try {
        const ex21Scraped = await scrapeUrl(exhibit21.url);
        const extracted = await extractRelationshipsFromText(
          ex21Scraped.markdown || '',
          companyName,
          'exhibit_21'
        );
        const stored = await processAndStoreRelationships(
          companyName,
          ticker,
          extracted,
          {
            filingType: '10-K',
            filingDate: filing.filingDate,
            section: 'Exhibit 21 - Subsidiaries',
            sourceUrl: exhibit21.url,
          }
        );
        allRelationships.push(...stored);
      } catch (error: any) {
        console.warn(`[CompanyGraph] Failed to process Exhibit 21:`, error.message);
      }
    }

    // Build summary from stored relationships
    const entities = await getCompanyEntities();
    for (const rel of allRelationships) {
      const target = await entities.findOne({ _id: rel.targetEntityId });
      if (!target) continue;

      switch (rel.relationshipType) {
        case 'customer':
          if (!summary.customers.includes(target.canonicalName)) {
            summary.customers.push(target.canonicalName);
          }
          break;
        case 'supplier':
          if (!summary.suppliers.includes(target.canonicalName)) {
            summary.suppliers.push(target.canonicalName);
          }
          break;
        case 'competitor':
          if (!summary.competitors.includes(target.canonicalName)) {
            summary.competitors.push(target.canonicalName);
          }
          break;
        case 'subsidiary':
          if (!summary.subsidiaries.includes(target.canonicalName)) {
            summary.subsidiaries.push(target.canonicalName);
          }
          break;
      }
    }

    console.log(`[CompanyGraph] Extracted ${allRelationships.length} relationships for ${ticker}`);
    console.log(`[CompanyGraph] Summary: ${summary.customers.length} customers, ${summary.suppliers.length} suppliers, ${summary.competitors.length} competitors, ${summary.subsidiaries.length} subsidiaries`);

  } catch (error: any) {
    console.error(`[CompanyGraph] Failed to extract relationships:`, error.message);
  }

  return { relationships: allRelationships, summary };
}

/**
 * Extract major sections from 10-K content
 */
function extractSections(content: string): {
  business?: string;
  riskFactors?: string;
} {
  const sections: { business?: string; riskFactors?: string } = {};

  // Look for Item 1 - Business
  const item1Match = content.match(/Item\s*1[.\s]*Business([\s\S]*?)(?=Item\s*1A|Item\s*2|$)/i);
  if (item1Match) {
    sections.business = item1Match[1].substring(0, 50000); // Limit size
  }

  // Look for Item 1A - Risk Factors
  const item1aMatch = content.match(/Item\s*1A[.\s]*Risk\s*Factors([\s\S]*?)(?=Item\s*1B|Item\s*2|$)/i);
  if (item1aMatch) {
    sections.riskFactors = item1aMatch[1].substring(0, 50000); // Limit size
  }

  return sections;
}

// ============= SUMMARY GENERATION =============

/**
 * Generate a markdown summary of company relationships
 */
export function generateRelationshipMarkdown(
  companyName: string,
  ticker: string,
  summary: {
    customers: string[];
    suppliers: string[];
    competitors: string[];
    subsidiaries: string[];
    majorShareholders?: Array<{ name: string; percent?: number }>;
  }
): string {
  let md = `### Company Relationships\n\n`;

  if (summary.customers.length > 0) {
    md += `**Major Customers**\n`;
    for (const customer of summary.customers.slice(0, 10)) {
      md += `- ${customer}\n`;
    }
    md += `\n`;
  } else {
    md += `**Major Customers**: No significant customer concentration reported\n\n`;
  }

  if (summary.suppliers.length > 0) {
    md += `**Key Suppliers**\n`;
    for (const supplier of summary.suppliers.slice(0, 10)) {
      md += `- ${supplier}\n`;
    }
    md += `\n`;
  }

  if (summary.competitors.length > 0) {
    md += `**Competitors**\n`;
    for (const competitor of summary.competitors.slice(0, 10)) {
      md += `- ${competitor}\n`;
    }
    md += `\n`;
  }

  if (summary.subsidiaries.length > 0) {
    md += `**Subsidiaries** (${summary.subsidiaries.length} total)\n`;
    for (const subsidiary of summary.subsidiaries.slice(0, 10)) {
      md += `- ${subsidiary}\n`;
    }
    if (summary.subsidiaries.length > 10) {
      md += `- *...and ${summary.subsidiaries.length - 10} more*\n`;
    }
    md += `\n`;
  }

  if (summary.majorShareholders && summary.majorShareholders.length > 0) {
    md += `**Top Institutional Shareholders**\n`;
    for (const holder of summary.majorShareholders.slice(0, 10)) {
      md += holder.percent
        ? `- ${holder.name} (${holder.percent.toFixed(2)}%)\n`
        : `- ${holder.name}\n`;
    }
    md += `\n`;
  }

  return md;
}
