/**
 * Company Graph Tests
 *
 * Tests for the company relationship graph module (Bloomberg SPLC-like feature).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as dotenv from 'dotenv';

// Load env vars BEFORE importing modules that use them
dotenv.config();

import {
  normalizeCompanyName,
  namesMatch,
  resolveEntity,
  addRelationship,
  extractRelationshipsFromText,
  parse13FHoldings,
  getCompanyGraph,
  getSupplyChain,
  getCompetitors,
  extractRelationshipsFromSECFilings,
  generateRelationshipMarkdown,
} from '../api/lib/company-graph';

// Test prerequisites
const hasMongoDB = !!process.env.MONGODB_CONNECTION_URI || !!process.env.MONGODB_URI;
const hasGemini = !!process.env.GEMINI_API_KEY;
const hasFirecrawl = !!process.env.FIRECRAWL_API_KEY;

describe('Company Graph', () => {
  describe('Name Normalization', () => {
    it('removes common suffixes', () => {
      expect(normalizeCompanyName('Apple Inc.')).toBe('Apple');
      expect(normalizeCompanyName('Microsoft Corporation')).toBe('Microsoft');
      expect(normalizeCompanyName('Alphabet, Inc.')).toBe('Alphabet');
      expect(normalizeCompanyName('Tesla, Inc')).toBe('Tesla');
    });

    it('handles LLC and LLP variants', () => {
      expect(normalizeCompanyName('Acme, LLC')).toBe('Acme');
      expect(normalizeCompanyName('Partners LP')).toBe('Partners');
      expect(normalizeCompanyName('Holdings, L.P.')).toBe('Holdings');
    });

    it('normalizes whitespace', () => {
      expect(normalizeCompanyName('  Apple   Inc  ')).toBe('Apple');
    });

    it('handles international suffixes', () => {
      expect(normalizeCompanyName('TSMC Limited')).toBe('TSMC');
      expect(normalizeCompanyName('Samsung Electronics Co., Ltd.')).toBe('Samsung Electronics');
      expect(normalizeCompanyName('SAP SE')).toBe('SAP');
    });
  });

  describe('Name Matching', () => {
    it('matches identical normalized names', () => {
      expect(namesMatch('Apple Inc.', 'Apple Inc')).toBe(true);
      expect(namesMatch('Microsoft Corporation', 'Microsoft Corp.')).toBe(true);
    });

    it('matches known aliases', () => {
      expect(namesMatch('Apple', 'AAPL')).toBe(true);
      expect(namesMatch('Google', 'Alphabet')).toBe(true);
      expect(namesMatch('Facebook', 'Meta')).toBe(true);
    });

    it('matches partial names when one contains the other', () => {
      expect(namesMatch('Taiwan Semiconductor', 'TSMC')).toBe(true);
    });

    it('does not match unrelated companies', () => {
      expect(namesMatch('Apple', 'Microsoft')).toBe(false);
      expect(namesMatch('Google', 'Amazon')).toBe(false);
    });
  });

  describe('Entity Resolution', () => {
    it.skipIf(!hasMongoDB)('creates new entity for unknown company', async () => {
      const testName = `TestCompany_${Date.now()}`;
      const entity = await resolveEntity(testName, { entityType: 'private_company' });

      expect(entity.canonicalName).toBe(testName);
      expect(entity.aliases).toContain(testName);
      expect(entity.entityType).toBe('private_company');
    });

    it.skipIf(!hasMongoDB)('resolves entity by ticker', async () => {
      const uniqueTicker = `TEST${Date.now()}`;

      // Create entity with ticker
      const entity1 = await resolveEntity('Test Company One', { ticker: uniqueTicker, entityType: 'public_company' });

      // Resolve by same ticker should return same entity
      const entity2 = await resolveEntity('Test Company Two', { ticker: uniqueTicker });

      // Same entity ID
      expect(entity1._id?.toString()).toBe(entity2._id?.toString());
      // The second call adds the new alias to the entity
      expect(entity2.aliases).toContain('Test Company Two');
    });

    it.skipIf(!hasMongoDB)('resolves entity by canonical name', async () => {
      const name = `UniqueCompanyName_${Date.now()}`;

      const entity1 = await resolveEntity(name);
      const entity2 = await resolveEntity(name);

      expect(entity1._id?.toString()).toBe(entity2._id?.toString());
    });
  });

  describe('Relationship Storage', () => {
    it.skipIf(!hasMongoDB)('stores relationship between entities', async () => {
      const source = await resolveEntity(`SourceCo_${Date.now()}`);
      const target = await resolveEntity(`TargetCo_${Date.now()}`);

      const relationship = await addRelationship(
        source,
        target,
        'supplier',
        {
          filingType: '10-K',
          filingDate: '2024-01-15',
          section: 'Item 1 - Business',
          extractedText: 'We rely on TargetCo for critical components',
          sourceUrl: 'https://sec.gov/example',
        },
        0.85,
        { description: 'Manufacturing partner' }
      );

      expect(relationship.sourceEntityId.toString()).toBe(source._id?.toString());
      expect(relationship.targetEntityId.toString()).toBe(target._id?.toString());
      expect(relationship.relationshipType).toBe('supplier');
      expect(relationship.confidence).toBe(0.85);
      expect(relationship.evidence).toHaveLength(1);
    });

    it.skipIf(!hasMongoDB)('deduplicates relationships with same evidence', async () => {
      const source = await resolveEntity(`DedupeSource_${Date.now()}`);
      const target = await resolveEntity(`DedupeTarget_${Date.now()}`);

      const evidence = {
        filingType: '10-K',
        filingDate: '2024-01-15',
        section: 'Item 1',
        extractedText: 'Same evidence',
        sourceUrl: 'https://sec.gov/same-filing',
      };

      const rel1 = await addRelationship(source, target, 'customer', evidence, 0.7);
      const rel2 = await addRelationship(source, target, 'customer', evidence, 0.8);

      // Should be same relationship with updated confidence
      expect(rel1._id?.toString()).toBe(rel2._id?.toString());
      expect(rel2.confidence).toBe(0.8); // Max of both
      expect(rel2.evidence).toHaveLength(1); // Not duplicated
    });
  });

  describe('13F Parsing', () => {
    it('parses 13F XML holdings', () => {
      const sampleXml = `
        <infoTable>
          <nameOfIssuer>APPLE INC</nameOfIssuer>
          <titleOfClass>COM</titleOfClass>
          <cusip>037833100</cusip>
          <value>1500000</value>
          <sshPrnamt>10000</sshPrnamt>
          <sshPrnamtType>SH</sshPrnamtType>
          <investmentDiscretion>SOLE</investmentDiscretion>
          <Sole>10000</Sole>
          <Shared>0</Shared>
          <None>0</None>
        </infoTable>
        <infoTable>
          <nameOfIssuer>MICROSOFT CORP</nameOfIssuer>
          <titleOfClass>COM</titleOfClass>
          <cusip>594918104</cusip>
          <value>2500000</value>
          <sshPrnamt>5000</sshPrnamt>
          <sshPrnamtType>SH</sshPrnamtType>
          <investmentDiscretion>SOLE</investmentDiscretion>
          <Sole>5000</Sole>
          <Shared>0</Shared>
          <None>0</None>
        </infoTable>
      `;

      const holdings = parse13FHoldings(sampleXml);

      expect(holdings).toHaveLength(2);
      expect(holdings[0].nameOfIssuer).toBe('APPLE INC');
      expect(holdings[0].value).toBe(1500000000); // Value in thousands -> dollars
      expect(holdings[0].shares).toBe(10000);
      expect(holdings[1].nameOfIssuer).toBe('MICROSOFT CORP');
    });

    it('handles empty or malformed XML', () => {
      expect(parse13FHoldings('')).toHaveLength(0);
      expect(parse13FHoldings('<invalid>xml')).toHaveLength(0);
    });
  });

  describe('LLM Extraction', () => {
    it.skipIf(!hasGemini)('extracts relationships from text', async () => {
      const sampleText = `
        Apple Inc. relies on Taiwan Semiconductor Manufacturing Company (TSMC) for the
        production of its custom silicon chips. TSMC is our primary semiconductor foundry
        partner. We also source components from Samsung Electronics for display panels.

        Our major competitors include Samsung in the smartphone market and Microsoft in
        the personal computing market. We compete with Google in the services space.
      `;

      const relationships = await extractRelationshipsFromText(sampleText, 'Apple Inc', 'business');

      expect(relationships.length).toBeGreaterThan(0);

      // Should find suppliers
      const suppliers = relationships.filter(r => r.relationshipType === 'supplier');
      expect(suppliers.length).toBeGreaterThan(0);

      // Should find at least one of: TSMC, Samsung
      const supplierNames = suppliers.map(s => s.relatedEntity.toLowerCase());
      expect(supplierNames.some(n => n.includes('tsmc') || n.includes('taiwan') || n.includes('samsung'))).toBe(true);

      // Should find competitors
      const competitors = relationships.filter(r => r.relationshipType === 'competitor');
      expect(competitors.length).toBeGreaterThan(0);
    }, 30000);

    it.skipIf(!hasGemini)('extracts subsidiaries from Exhibit 21 text', async () => {
      const exhibit21Text = `
        EXHIBIT 21

        SUBSIDIARIES OF THE REGISTRANT

        The following is a list of significant subsidiaries of Apple Inc.:

        Apple Sales International (Ireland)
        Apple Operations International (Ireland)
        Apple Distribution International Ltd. (Ireland)
        Braeburn Capital, Inc. (Nevada)
        FileMaker, Inc. (California)
      `;

      const relationships = await extractRelationshipsFromText(exhibit21Text, 'Apple Inc', 'exhibit_21');

      const subsidiaries = relationships.filter(r => r.relationshipType === 'subsidiary');
      expect(subsidiaries.length).toBeGreaterThan(0);
    }, 30000);
  });

  describe('Graph Queries', () => {
    it.skipIf(!hasMongoDB)('returns null for unknown ticker', async () => {
      const graph = await getCompanyGraph('NONEXISTENT12345');
      expect(graph).toBeNull();
    });

    it.skipIf(!hasMongoDB)('returns supply chain for company', async () => {
      // This relies on having data in the database
      // In integration tests, we'd first populate data
      const supplyChain = await getSupplyChain('AAPL');

      // Should return structure even if empty
      expect(supplyChain).toHaveProperty('customers');
      expect(supplyChain).toHaveProperty('suppliers');
      expect(Array.isArray(supplyChain.customers)).toBe(true);
      expect(Array.isArray(supplyChain.suppliers)).toBe(true);
    });

    it.skipIf(!hasMongoDB)('returns competitors for company', async () => {
      const competitors = await getCompetitors('AAPL');
      expect(Array.isArray(competitors)).toBe(true);
    });
  });

  describe('SEC Filing Extraction', () => {
    it.skipIf(!hasFirecrawl || !hasGemini || !hasMongoDB)(
      'extracts relationships from real SEC filings',
      async () => {
        console.log('\n=== EXTRACTING RELATIONSHIPS FROM AAPL 10-K ===\n');

        const result = await extractRelationshipsFromSECFilings('AAPL', 'Apple Inc');

        console.log(`Extracted ${result.relationships.length} relationships`);
        console.log(`Customers: ${result.summary.customers.join(', ') || 'None'}`);
        console.log(`Suppliers: ${result.summary.suppliers.join(', ') || 'None'}`);
        console.log(`Competitors: ${result.summary.competitors.join(', ') || 'None'}`);
        console.log(`Subsidiaries: ${result.summary.subsidiaries.length} found`);

        // Apple should have some relationships extracted
        // (might be empty if no API key, but structure should exist)
        expect(result.summary).toHaveProperty('customers');
        expect(result.summary).toHaveProperty('suppliers');
        expect(result.summary).toHaveProperty('competitors');
        expect(result.summary).toHaveProperty('subsidiaries');

        // With real APIs, expect at least some relationships
        if (hasGemini) {
          // Apple typically has competitors mentioned in risk factors
          expect(
            result.summary.competitors.length > 0 ||
            result.summary.suppliers.length > 0 ||
            result.summary.subsidiaries.length > 0
          ).toBe(true);
        }
      },
      180000 // 3 minute timeout for full extraction
    );
  });

  describe('Markdown Generation', () => {
    it('generates markdown for company relationships', () => {
      const summary = {
        customers: ['Major Retailer', 'Big Corp'],
        suppliers: ['TSMC', 'Samsung'],
        competitors: ['Microsoft', 'Google'],
        subsidiaries: ['Apple Ireland', 'Braeburn Capital'],
        majorShareholders: [
          { name: 'Vanguard Group', percent: 8.5 },
          { name: 'BlackRock', percent: 6.2 },
        ],
      };

      const markdown = generateRelationshipMarkdown('Apple Inc', 'AAPL', summary);

      expect(markdown).toContain('Company Relationships');
      expect(markdown).toContain('Major Customers');
      expect(markdown).toContain('Major Retailer');
      expect(markdown).toContain('Key Suppliers');
      expect(markdown).toContain('TSMC');
      expect(markdown).toContain('Competitors');
      expect(markdown).toContain('Microsoft');
      expect(markdown).toContain('Subsidiaries');
      expect(markdown).toContain('Top Institutional Shareholders');
      expect(markdown).toContain('Vanguard Group');
      expect(markdown).toContain('8.50%');
    });

    it('handles empty sections gracefully', () => {
      const summary = {
        customers: [],
        suppliers: [],
        competitors: [],
        subsidiaries: [],
        majorShareholders: [],
      };

      const markdown = generateRelationshipMarkdown('Unknown Co', 'XXX', summary);

      expect(markdown).toContain('No significant customer concentration');
      expect(markdown).not.toContain('Key Suppliers'); // Empty, shouldn't show
    });
  });
});
