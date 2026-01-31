/**
 * Research Pipeline Tests
 *
 * E2E tests for the research pipeline including SEC EDGAR integration.
 * These tests verify we're getting REAL data, not graceful degradation.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as dotenv from 'dotenv';

// Load env vars BEFORE importing modules that use them
dotenv.config();

import {
  parseResearchRequest,
  checkCache,
  research,
  quickLookup,
  deepDive,
} from '../api/lib/research-pipeline';
import {
  lookupCIK,
  getCompanyInfo,
  getRecentFilings,
  getComprehensiveFilings,
} from '../api/lib/sec-edgar';

// Skip live API tests if not configured
const hasFirecrawl = !!process.env.FIRECRAWL_API_KEY;
const hasMongoDB = !!process.env.MONGODB_CONNECTION_URI || !!process.env.MONGODB_URI;

describe('Research Pipeline', () => {
  describe('parseResearchRequest', () => {
    it('extracts ticker from $AAPL format', () => {
      const result = parseResearchRequest('What is happening with $AAPL?');
      expect(result.ticker).toBe('AAPL');
      expect(result.depth).toBe('standard');
    });

    it('detects deep dive requests', () => {
      const result = parseResearchRequest('Do a deep dive on $TSLA');
      expect(result.ticker).toBe('TSLA');
      expect(result.depth).toBe('deep');
    });

    it('detects quick lookups', () => {
      const result = parseResearchRequest('Quick tldr on $NVDA');
      expect(result.ticker).toBe('NVDA');
      expect(result.depth).toBe('quick');
    });

    it('extracts company names', () => {
      const result = parseResearchRequest('Research Apple Inc for me');
      expect(result.company).toContain('Apple');
    });
  });

  describe('SEC EDGAR Direct Integration', () => {
    it('looks up CIK for Apple', async () => {
      const cik = await lookupCIK('AAPL');
      expect(cik).toBe('0000320193');
    });

    it('looks up CIK for Tesla', async () => {
      const cik = await lookupCIK('TSLA');
      expect(cik).toBe('0001318605');
    });

    it('gets company info', async () => {
      const info = await getCompanyInfo('0000320193');
      expect(info).not.toBeNull();
      expect(info!.name).toContain('Apple');
      expect(info!.ticker).toBe('AAPL');
    });

    it('gets recent filings including 10-K', async () => {
      const filings = await getRecentFilings('0000320193', ['10-K'], 1);
      expect(filings.length).toBeGreaterThan(0);

      const tenK = filings[0];
      expect(tenK.form).toBe('10-K');
      // URLs use www.sec.gov (not data.sec.gov) for document access
      expect(tenK.documentUrl).toContain('www.sec.gov/Archives/edgar');
      // URL format verification (not HEAD request which SEC blocks)
      expect(tenK.documentUrl).toMatch(/\.(htm|html|pdf)$/);
    });

    it('gets comprehensive filings for ticker', async () => {
      const data = await getComprehensiveFilings('AAPL');

      expect(data.company).not.toBeNull();
      expect(data.company!.name).toContain('Apple');

      // Should have at least one of: 10-K, 10-Q, or proxy
      const hasFilings = data.latest10K || data.latest10Q || data.latestProxy;
      expect(hasFilings).toBeTruthy();

      if (data.latest10K) {
        expect(data.latest10K.form).toBe('10-K');
        expect(data.latest10K.documentUrl).toContain('www.sec.gov');
      }
    });
  });

  describe('Quick Research', () => {
    it.skipIf(!hasFirecrawl || !hasMongoDB)('executes quick lookup', async () => {
      const report = await quickLookup('AAPL');

      expect(report).toBeDefined();
      expect(report.structured.depth).toBe('quick');
      expect(report.findings.length).toBeGreaterThan(0);
      expect(report.markdown).toContain('AAPL');
    }, 30000);
  });

  describe('Standard Research', () => {
    it.skipIf(!hasFirecrawl || !hasMongoDB)('executes standard research', async () => {
      const report = await research('Tell me about $MSFT', { depthOverride: 'standard' });

      expect(report).toBeDefined();
      expect(report.structured.depth).toBe('standard');
      expect(report.findings.length).toBeGreaterThan(0);

      // Should have web search results
      const webSearch = report.findings.filter(f => f.findingType === 'web_search');
      expect(webSearch.length).toBeGreaterThan(0);
    }, 60000);
  });

  describe('Deep Research with SEC Filings', () => {
    it.skipIf(!hasFirecrawl || !hasMongoDB)('executes deep dive with real SEC data', async () => {
      console.log('\n=== DEEP DIVE TEST: SCANNING FULL SEC DATA ===\n');

      // Force refresh to bypass any cached data with old URLs
      const report = await research('deep dive on Apple $AAPL', { depthOverride: 'deep', forceRefresh: true });

      expect(report).toBeDefined();
      expect(report.structured.depth).toBe('deep');

      // CRITICAL: We must have SEC filings for deep research
      const secFilings = report.findings.filter(f => f.findingType === 'sec_filing');
      console.log(`Found ${secFilings.length} SEC filing findings`);

      // The roaring lobster demands REAL DATA
      expect(secFilings.length).toBeGreaterThan(0);

      // Verify we got actual content, not empty shells
      for (const filing of secFilings) {
        console.log(`- ${filing.title}: ${filing.rawContent.length} chars`);
        expect(filing.rawContent.length).toBeGreaterThan(1000);
        expect(filing.sourceUrl).toContain('sec.gov');
      }

      // Should also have news and analyst data
      const news = report.findings.filter(f => f.findingType === 'news' || f.findingType === 'web_search');
      expect(news.length).toBeGreaterThan(0);

      // Should have social sentiment from ApeWisdom (if ticker is trending)
      const social = report.findings.find(f => f.findingType === 'social' && f.source === 'apewisdom');
      if (social) {
        console.log(`\nSocial Sentiment: ${social.structuredData.redditRank ? `Rank #${social.structuredData.redditRank}` : 'N/A'}`);
        expect(social.structuredData.redditMentions).toBeDefined();
      }

      // Check structured output has social data
      if (report.structured.socialSentiment) {
        console.log(`Structured Social: Rank #${report.structured.socialSentiment.redditRank}, WSB: ${report.structured.socialSentiment.wsbActive}`);
      }

      console.log(`\nTotal findings: ${report.findings.length}`);
      console.log(`Markdown report length: ${report.markdown.length} chars`);
    }, 120000);
  });

  describe('Cache Hit', () => {
    it.skipIf(!hasMongoDB)('returns cached findings when available', async () => {
      // First, we need data in the cache
      // This test just verifies the cache check logic doesn't crash
      const request = parseResearchRequest('$AAPL update');
      const cached = await checkCache(request);

      // Either null (no cache) or array (cache hit)
      expect(cached === null || Array.isArray(cached)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('handles invalid tickers gracefully', async () => {
      const cik = await lookupCIK('INVALIDTICKER12345');
      expect(cik).toBeNull();
    });

    it('handles missing CIK gracefully', async () => {
      const info = await getCompanyInfo('9999999999');
      expect(info).toBeNull();
    });
  });
});
