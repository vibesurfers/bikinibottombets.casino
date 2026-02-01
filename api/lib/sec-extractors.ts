/**
 * SEC Filing Extractors for Org Spider
 *
 * Specialized extractors for DEF 14A, 13D/13G, and enhanced 13F parsing
 * to extract executives, board members, activist investors, and institutional holders.
 */

import { config } from './config';
import {
  lookupCIK,
  getRecentFilings,
  getFilingDocuments,
  getLatestProxy,
  SECFiling,
} from './sec-edgar';
import { scrapeUrl } from './services';
import {
  def14aExtractionSchema,
  filing13DGExtractionSchema,
  filing13FExtractionSchema,
  extractionPrompts,
  DEF14AExtraction,
  Filing13DGExtraction,
  Filing13FExtraction,
  Filing13FHolding,
} from './extraction-schemas';
import {
  ExtractedExecutive,
  ExtractedBoardMember,
  DEF14AExtraction as DEF14AResult,
  Filing13DGExtraction as Filing13DGResult,
  InstitutionalHolder,
} from './org-spider-types';

const SEC_DATA = 'https://data.sec.gov';
const SEC_WWW = 'https://www.sec.gov';
const USER_AGENT = 'ActiveInvestorBot research@bikinibottombets.casino';

// Rate limiting
let lastRequestTime = 0;
async function rateLimitedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < 100) {
    await new Promise(resolve => setTimeout(resolve, 100 - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();

  return fetch(url, {
    ...options,
    headers: {
      'User-Agent': USER_AGENT,
      ...options.headers,
    },
  });
}

/**
 * Extract executives and board members from DEF 14A proxy statement using LLM
 */
export async function extractFromDEF14A(
  cik: string,
  filing?: SECFiling | null
): Promise<DEF14AResult | null> {
  const apiKey = config.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[SEC Extractors] GEMINI_API_KEY not set');
    return null;
  }

  // Get the proxy filing if not provided
  if (!filing) {
    filing = await getLatestProxy(cik);
    if (!filing) {
      console.warn(`[SEC Extractors] No DEF 14A found for CIK ${cik}`);
      return null;
    }
  }

  try {
    // Fetch and parse the proxy statement
    const scraped = await scrapeUrl(filing.documentUrl);
    const content = scraped.markdown || '';

    if (content.length < 1000) {
      console.warn('[SEC Extractors] DEF 14A content too short');
      return null;
    }

    // Extract relevant sections (executive comp, board of directors)
    const relevantContent = extractProxySections(content);

    // Truncate to fit in context
    const maxChars = 150000;
    const truncatedContent = relevantContent.length > maxChars
      ? relevantContent.substring(0, maxChars) + '...[truncated]'
      : relevantContent;

    // Call Gemini for extraction
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${extractionPrompts.def14a}

Filing Date: ${filing.filingDate}

Proxy Statement Content:
${truncatedContent}

Return ONLY valid JSON matching this schema:
{
  "companyName": "string",
  "filingDate": "YYYY-MM-DD",
  "executives": [{ "name": "string", "title": "string", "compensation": { "salary": number, "bonus": number, "stockAwards": number, "total": number }, "biography": "string" }],
  "boardMembers": [{ "name": "string", "title": "string", "committees": ["string"], "independentDirector": boolean, "biography": "string" }]
}`,
            }],
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
          },
        }),
      }
    );

    if (!response.ok) {
      console.error('[SEC Extractors] Gemini API error:', await response.text());
      return null;
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[SEC Extractors] No JSON found in response');
      return null;
    }

    const extracted = JSON.parse(jsonMatch[0]);

    return {
      executives: (extracted.executives || []).map((e: any) => ({
        name: e.name,
        title: e.title,
        compensation: e.compensation,
        biography: e.biography,
      })),
      boardMembers: (extracted.boardMembers || []).map((b: any) => ({
        name: b.name,
        title: b.title,
        committees: b.committees,
        independentDirector: b.independentDirector,
        biography: b.biography,
      })),
      companyName: extracted.companyName || '',
      filingDate: new Date(filing.filingDate),
    };
  } catch (error: any) {
    console.error('[SEC Extractors] DEF 14A extraction failed:', error.message);
    return null;
  }
}

/**
 * Extract relevant sections from proxy statement
 */
function extractProxySections(content: string): string {
  const sections: string[] = [];

  // Executive compensation section
  const execCompMatch = content.match(
    /Executive\s+Compensation([\s\S]*?)(?=Director\s+Compensation|Equity\s+Compensation|Security\s+Ownership|$)/i
  );
  if (execCompMatch) {
    sections.push('=== EXECUTIVE COMPENSATION ===\n' + execCompMatch[1].substring(0, 50000));
  }

  // Board of Directors section
  const boardMatch = content.match(
    /(Board\s+of\s+Directors|Directors\s+and\s+Nominees)([\s\S]*?)(?=Executive\s+Officers|Compensation|$)/i
  );
  if (boardMatch) {
    sections.push('=== BOARD OF DIRECTORS ===\n' + boardMatch[2].substring(0, 30000));
  }

  // Named Executive Officers
  const neoMatch = content.match(
    /Named\s+Executive\s+Officers([\s\S]*?)(?=Summary\s+Compensation|$)/i
  );
  if (neoMatch) {
    sections.push('=== NAMED EXECUTIVE OFFICERS ===\n' + neoMatch[1].substring(0, 20000));
  }

  // Summary Compensation Table
  const compTableMatch = content.match(
    /Summary\s+Compensation\s+Table([\s\S]*?)(?=Grants\s+of|Option\s+Exercises|$)/i
  );
  if (compTableMatch) {
    sections.push('=== SUMMARY COMPENSATION TABLE ===\n' + compTableMatch[1].substring(0, 30000));
  }

  if (sections.length === 0) {
    // Fallback: return first 100k chars
    return content.substring(0, 100000);
  }

  return sections.join('\n\n');
}

/**
 * Extract activist investor information from 13D/13G filings
 */
export async function extractFrom13DG(
  targetTicker: string
): Promise<Filing13DGResult[]> {
  const apiKey = config.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[SEC Extractors] GEMINI_API_KEY not set');
    return [];
  }

  const cik = await lookupCIK(targetTicker);
  if (!cik) {
    console.warn(`[SEC Extractors] Could not find CIK for ${targetTicker}`);
    return [];
  }

  // Get recent 13D/13G filings
  const filings = await getRecentFilings(cik, ['SC 13D', 'SC 13G', '13D', '13G'], 10);
  if (filings.length === 0) {
    return [];
  }

  const results: Filing13DGResult[] = [];

  for (const filing of filings.slice(0, 5)) { // Process top 5
    try {
      const scraped = await scrapeUrl(filing.documentUrl);
      const content = scraped.markdown || '';

      if (content.length < 500) continue;

      // Truncate content
      const truncatedContent = content.length > 50000
        ? content.substring(0, 50000) + '...[truncated]'
        : content;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `${extractionPrompts.filing13DG}

Filing Date: ${filing.filingDate}
Filing Type: ${filing.form}

Filing Content:
${truncatedContent}

Return ONLY valid JSON matching this schema:
{
  "filerName": "string",
  "filerType": "individual" | "institution",
  "targetCompany": "string",
  "sharesOwned": number,
  "percentOwnership": number,
  "purpose": "string",
  "filingDate": "YYYY-MM-DD"
}`,
              }],
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 2048,
            },
          }),
        }
      );

      if (!response.ok) continue;

      const data = await response.json();
      const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const extracted = JSON.parse(jsonMatch[0]);

      results.push({
        filerName: extracted.filerName || '',
        filerType: extracted.filerType || 'institution',
        targetCompany: extracted.targetCompany || targetTicker,
        sharesOwned: extracted.sharesOwned || 0,
        percentOwnership: extracted.percentOwnership || 0,
        purpose: extracted.purpose || '',
        filingDate: new Date(filing.filingDate),
      });
    } catch (error: any) {
      console.warn(`[SEC Extractors] 13D/G extraction failed for ${filing.accessionNumber}:`, error.message);
    }
  }

  return results;
}

/**
 * Get institutional holders from 13F filings - Enhanced version
 * Searches for institutions that hold the target company
 */
export async function getInstitutionalHolders(
  ticker: string,
  limit = 20
): Promise<InstitutionalHolder[]> {
  const cik = await lookupCIK(ticker);
  if (!cik) {
    console.warn(`[SEC Extractors] Could not find CIK for ${ticker}`);
    return [];
  }

  const holders: InstitutionalHolder[] = [];

  try {
    // Search for 13F filings mentioning this company
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const startDate = sixMonthsAgo.toISOString().split('T')[0];
    const endDate = new Date().toISOString().split('T')[0];

    const searchUrl = `https://efts.sec.gov/LATEST/search-index?q="${ticker}"&forms=13F-HR&dateRange=custom&startdt=${startDate}&enddt=${endDate}`;

    const response = await rateLimitedFetch(searchUrl);
    if (!response.ok) {
      console.warn('[SEC Extractors] 13F search failed');
      return holders;
    }

    const data = await response.json();
    const hits = data.hits?.hits || [];

    // Get unique filers
    const seenCiks = new Set<string>();

    for (const hit of hits) {
      const source = hit._source;
      const filerCik = source.ciks?.[0];

      if (!filerCik || seenCiks.has(filerCik)) continue;
      seenCiks.add(filerCik);

      if (seenCiks.size > limit) break;

      // Get the actual 13F filing to extract holdings
      try {
        const filings = await getRecentFilings(filerCik, ['13F-HR'], 1);
        if (filings.length === 0) continue;

        const filing = filings[0];
        const documents = await getFilingDocuments(filerCik, filing.accessionNumber);

        // Find the info table XML
        const infoTable = documents.find(d =>
          d.name.toLowerCase().includes('infotable') ||
          d.name.endsWith('.xml')
        );

        if (infoTable) {
          const xmlResponse = await rateLimitedFetch(infoTable.url);
          if (xmlResponse.ok) {
            const xml = await xmlResponse.text();
            const holdings = parse13FHoldings(xml, ticker.toUpperCase());

            if (holdings.length > 0) {
              // Sum up all holdings of this ticker
              const totalShares = holdings.reduce((sum, h) => sum + h.shares, 0);
              const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);

              holders.push({
                institutionName: source.display_names?.[0] || 'Unknown',
                cik: filerCik,
                sharesHeld: totalShares,
                value: totalValue,
                percentOfPortfolio: 0, // Would need total portfolio value to calculate
                reportDate: new Date(filing.filingDate),
              });
            }
          }
        }
      } catch (error: any) {
        console.warn(`[SEC Extractors] Failed to process 13F for CIK ${filerCik}:`, error.message);
      }
    }

    // Sort by value descending
    holders.sort((a, b) => b.value - a.value);

  } catch (error: any) {
    console.error('[SEC Extractors] getInstitutionalHolders failed:', error.message);
  }

  return holders;
}

/**
 * Parse 13F XML for holdings of a specific ticker
 */
function parse13FHoldings(xml: string, targetTicker: string): Array<{
  issuerName: string;
  shares: number;
  value: number;
}> {
  const holdings: Array<{ issuerName: string; shares: number; value: number }> = [];

  // Match info table entries
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

    const issuerName = getValue('nameOfIssuer');

    // Check if this is the ticker we're looking for
    // Match on name containing ticker or CUSIP lookup
    if (
      issuerName.toUpperCase().includes(targetTicker) ||
      entry.toUpperCase().includes(targetTicker)
    ) {
      holdings.push({
        issuerName,
        shares: getNumber('sshPrnamt'),
        value: getNumber('value') * 1000, // 13F reports in thousands
      });
    }
  }

  return holdings;
}

/**
 * Get 13F holdings for an institutional investor
 */
export async function get13FHoldings(
  institutionCik: string,
  limit = 50
): Promise<Filing13FHolding[]> {
  const filings = await getRecentFilings(institutionCik, ['13F-HR'], 1);
  if (filings.length === 0) return [];

  const filing = filings[0];
  const documents = await getFilingDocuments(institutionCik, filing.accessionNumber);

  // Find info table
  const infoTable = documents.find(d =>
    d.name.toLowerCase().includes('infotable') ||
    (d.name.endsWith('.xml') && !d.name.includes('primary'))
  );

  if (!infoTable) return [];

  try {
    const response = await rateLimitedFetch(infoTable.url);
    if (!response.ok) return [];

    const xml = await response.text();
    return parseAll13FHoldings(xml, limit);
  } catch (error: any) {
    console.error('[SEC Extractors] Failed to parse 13F holdings:', error.message);
    return [];
  }
}

/**
 * Parse all holdings from 13F XML
 */
function parseAll13FHoldings(xml: string, limit: number): Filing13FHolding[] {
  const holdings: Filing13FHolding[] = [];

  const infoTableRegex = /<infoTable>([\s\S]*?)<\/infoTable>/gi;
  let match;

  while ((match = infoTableRegex.exec(xml)) !== null && holdings.length < limit) {
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
      issuerName: getValue('nameOfIssuer'),
      titleOfClass: getValue('titleOfClass'),
      cusip: getValue('cusip'),
      value: getNumber('value') * 1000,
      shares: getNumber('sshPrnamt'),
      sharesPrn: getValue('sshPrnamtType') as 'SH' | 'PRN',
      investmentDiscretion: getValue('investmentDiscretion') as 'SOLE' | 'SHARED' | 'NONE',
      votingAuthority: {
        sole: getNumber('Sole'),
        shared: getNumber('Shared'),
        none: getNumber('None'),
      },
    });
  }

  // Sort by value descending
  holdings.sort((a, b) => b.value - a.value);

  return holdings;
}

/**
 * Extract executives for a company by ticker
 */
export async function getExecutivesForCompany(
  ticker: string
): Promise<ExtractedExecutive[]> {
  const cik = await lookupCIK(ticker);
  if (!cik) return [];

  const extraction = await extractFromDEF14A(cik);
  return extraction?.executives || [];
}

/**
 * Extract board members for a company by ticker
 */
export async function getBoardMembersForCompany(
  ticker: string
): Promise<ExtractedBoardMember[]> {
  const cik = await lookupCIK(ticker);
  if (!cik) return [];

  const extraction = await extractFromDEF14A(cik);
  return extraction?.boardMembers || [];
}

/**
 * Get activist investors for a company
 */
export async function getActivistInvestors(
  ticker: string
): Promise<Filing13DGResult[]> {
  return extractFrom13DG(ticker);
}

/**
 * Comprehensive executive/board data for a public company
 */
export async function getCompanyLeadership(ticker: string): Promise<{
  executives: ExtractedExecutive[];
  boardMembers: ExtractedBoardMember[];
  activistInvestors: Filing13DGResult[];
  topInstitutionalHolders: InstitutionalHolder[];
}> {
  const [executives, boardMembers, activists, holders] = await Promise.all([
    getExecutivesForCompany(ticker).catch(() => []),
    getBoardMembersForCompany(ticker).catch(() => []),
    getActivistInvestors(ticker).catch(() => []),
    getInstitutionalHolders(ticker, 10).catch(() => []),
  ]);

  return {
    executives,
    boardMembers,
    activistInvestors: activists,
    topInstitutionalHolders: holders,
  };
}
