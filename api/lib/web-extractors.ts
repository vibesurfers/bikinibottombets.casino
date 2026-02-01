/**
 * Web Extractors for Org Spider
 *
 * Scrape PE/VC fund websites for team members and portfolio companies.
 */

import { config } from './config';
import { scrapeUrl } from './services';
import {
  fundTeamExtractionSchema,
  portfolioExtractionSchema,
  extractionPrompts,
  FundTeamExtraction,
  PortfolioExtraction,
} from './extraction-schemas';

// Simple in-memory cache with TTL
const cache = new Map<string, { data: any; expires: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL });
}

// Rate limiting per domain
const domainLastRequest = new Map<string, number>();
const MIN_REQUEST_INTERVAL = 2000; // 2 seconds between requests to same domain

async function rateLimitedScrape(url: string): Promise<{ markdown: string } | null> {
  const domain = new URL(url).hostname;
  const lastRequest = domainLastRequest.get(domain) || 0;
  const timeSinceLastRequest = Date.now() - lastRequest;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }

  domainLastRequest.set(domain, Date.now());

  try {
    return await scrapeUrl(url);
  } catch (error: any) {
    console.error(`[Web Extractors] Failed to scrape ${url}:`, error.message);
    return null;
  }
}

/**
 * Extract team members from a PE/VC fund's team page
 */
export async function extractFundTeam(
  fundName: string,
  teamPageUrl: string
): Promise<FundTeamExtraction | null> {
  const cacheKey = `team:${teamPageUrl}`;
  const cached = getCached<FundTeamExtraction>(cacheKey);
  if (cached) return cached;

  const apiKey = config.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[Web Extractors] GEMINI_API_KEY not set');
    return null;
  }

  const scraped = await rateLimitedScrape(teamPageUrl);
  if (!scraped || !scraped.markdown || scraped.markdown.length < 500) {
    console.warn('[Web Extractors] Team page content too short');
    return null;
  }

  // Truncate content
  const maxChars = 100000;
  const content = scraped.markdown.length > maxChars
    ? scraped.markdown.substring(0, maxChars) + '...[truncated]'
    : scraped.markdown;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${extractionPrompts.fundTeam}

Fund Name: ${fundName}
Team Page URL: ${teamPageUrl}

Page Content:
${content}

Return ONLY valid JSON matching this schema:
{
  "fundName": "string",
  "teamMembers": [
    {
      "name": "string",
      "title": "string",
      "role": "partner" | "managing_director" | "principal" | "vice_president" | "associate" | "analyst" | "advisor" | "other",
      "biography": "string (optional)",
      "linkedIn": "string (optional)",
      "focus": ["string"] (optional investment focus areas)
    }
  ]
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
      console.error('[Web Extractors] Gemini API error:', await response.text());
      return null;
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[Web Extractors] No JSON found in team extraction response');
      return null;
    }

    const result = JSON.parse(jsonMatch[0]) as FundTeamExtraction;
    setCache(cacheKey, result);
    return result;
  } catch (error: any) {
    console.error('[Web Extractors] Team extraction failed:', error.message);
    return null;
  }
}

/**
 * Extract portfolio companies from a PE/VC fund's portfolio page
 */
export async function extractPortfolioCompanies(
  fundName: string,
  portfolioPageUrl: string
): Promise<PortfolioExtraction | null> {
  const cacheKey = `portfolio:${portfolioPageUrl}`;
  const cached = getCached<PortfolioExtraction>(cacheKey);
  if (cached) return cached;

  const apiKey = config.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[Web Extractors] GEMINI_API_KEY not set');
    return null;
  }

  const scraped = await rateLimitedScrape(portfolioPageUrl);
  if (!scraped || !scraped.markdown || scraped.markdown.length < 300) {
    console.warn('[Web Extractors] Portfolio page content too short');
    return null;
  }

  // Truncate content
  const maxChars = 150000;
  const content = scraped.markdown.length > maxChars
    ? scraped.markdown.substring(0, maxChars) + '...[truncated]'
    : scraped.markdown;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${extractionPrompts.portfolio}

Fund Name: ${fundName}
Portfolio Page URL: ${portfolioPageUrl}

Page Content:
${content}

Return ONLY valid JSON matching this schema:
{
  "fundName": "string",
  "portfolioCompanies": [
    {
      "name": "string",
      "description": "string (optional)",
      "sector": "string (optional)",
      "website": "string (optional)",
      "investmentType": "buyout" | "growth" | "venture" | "other" (optional),
      "status": "active" | "exited" | "unknown" (optional)
    }
  ]
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
      console.error('[Web Extractors] Gemini API error:', await response.text());
      return null;
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[Web Extractors] No JSON found in portfolio extraction response');
      return null;
    }

    const result = JSON.parse(jsonMatch[0]) as PortfolioExtraction;
    setCache(cacheKey, result);
    return result;
  } catch (error: any) {
    console.error('[Web Extractors] Portfolio extraction failed:', error.message);
    return null;
  }
}

/**
 * Try to find team and portfolio pages from a fund's main website
 */
export async function discoverFundPages(
  fundWebsite: string
): Promise<{
  teamPageUrl?: string;
  portfolioPageUrl?: string;
  aboutPageUrl?: string;
}> {
  const apiKey = config.GEMINI_API_KEY;
  if (!apiKey) {
    // Fallback to common URL patterns
    const baseUrl = fundWebsite.replace(/\/$/, '');
    return {
      teamPageUrl: `${baseUrl}/team`,
      portfolioPageUrl: `${baseUrl}/portfolio`,
      aboutPageUrl: `${baseUrl}/about`,
    };
  }

  const scraped = await rateLimitedScrape(fundWebsite);
  if (!scraped || !scraped.markdown) {
    const baseUrl = fundWebsite.replace(/\/$/, '');
    return {
      teamPageUrl: `${baseUrl}/team`,
      portfolioPageUrl: `${baseUrl}/portfolio`,
    };
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Analyze this website content and find links to team/people and portfolio/investments pages.

Website: ${fundWebsite}

Content:
${scraped.markdown.substring(0, 30000)}

Return ONLY valid JSON:
{
  "teamPageUrl": "full URL to team/people page or null",
  "portfolioPageUrl": "full URL to portfolio/investments page or null",
  "aboutPageUrl": "full URL to about page or null"
}`,
            }],
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error('API request failed');
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error: any) {
    console.warn('[Web Extractors] Page discovery failed:', error.message);
  }

  // Fallback to common patterns
  const baseUrl = fundWebsite.replace(/\/$/, '');
  return {
    teamPageUrl: `${baseUrl}/team`,
    portfolioPageUrl: `${baseUrl}/portfolio`,
  };
}

/**
 * Extract comprehensive fund data from website
 */
export async function extractFundData(
  fundName: string,
  fundWebsite: string
): Promise<{
  team: FundTeamExtraction | null;
  portfolio: PortfolioExtraction | null;
}> {
  // Discover relevant pages
  const pages = await discoverFundPages(fundWebsite);

  // Extract team and portfolio in parallel
  const [team, portfolio] = await Promise.all([
    pages.teamPageUrl
      ? extractFundTeam(fundName, pages.teamPageUrl).catch(() => null)
      : Promise.resolve(null),
    pages.portfolioPageUrl
      ? extractPortfolioCompanies(fundName, pages.portfolioPageUrl).catch(() => null)
      : Promise.resolve(null),
  ]);

  return { team, portfolio };
}

// Known PE fund website URLs for seeding
export const knownPEFundWebsites: Record<string, {
  website: string;
  teamPage?: string;
  portfolioPage?: string;
}> = {
  'Blackstone': {
    website: 'https://www.blackstone.com',
    teamPage: 'https://www.blackstone.com/people',
    portfolioPage: 'https://www.blackstone.com/our-businesses/private-equity',
  },
  'KKR': {
    website: 'https://www.kkr.com',
    teamPage: 'https://www.kkr.com/our-firm/leadership',
    portfolioPage: 'https://www.kkr.com/businesses/private-equity/portfolio',
  },
  'Apollo Global Management': {
    website: 'https://www.apollo.com',
    teamPage: 'https://www.apollo.com/about-apollo/leadership',
    portfolioPage: 'https://www.apollo.com/what-we-do/private-equity',
  },
  'Carlyle Group': {
    website: 'https://www.carlyle.com',
    teamPage: 'https://www.carlyle.com/about-carlyle/team',
    portfolioPage: 'https://www.carlyle.com/our-business/portfolio',
  },
  'TPG': {
    website: 'https://www.tpg.com',
    teamPage: 'https://www.tpg.com/people',
    portfolioPage: 'https://www.tpg.com/platforms/capital/portfolio',
  },
  'Ares Management': {
    website: 'https://www.aresmgmt.com',
    teamPage: 'https://www.aresmgmt.com/about-us/leadership',
    portfolioPage: 'https://www.aresmgmt.com/our-business/private-equity',
  },
  'Thoma Bravo': {
    website: 'https://www.thomabravo.com',
    teamPage: 'https://www.thomabravo.com/team',
    portfolioPage: 'https://www.thomabravo.com/companies',
  },
  'Vista Equity Partners': {
    website: 'https://www.vistaequitypartners.com',
    teamPage: 'https://www.vistaequitypartners.com/team/',
    portfolioPage: 'https://www.vistaequitypartners.com/companies/',
  },
  'Warburg Pincus': {
    website: 'https://www.warburgpincus.com',
    teamPage: 'https://www.warburgpincus.com/team/',
    portfolioPage: 'https://www.warburgpincus.com/investments/',
  },
  'Advent International': {
    website: 'https://www.adventinternational.com',
    teamPage: 'https://www.adventinternational.com/team/',
    portfolioPage: 'https://www.adventinternational.com/portfolio/',
  },
  'Bain Capital': {
    website: 'https://www.baincapital.com',
    teamPage: 'https://www.baincapitalprivateequity.com/team',
    portfolioPage: 'https://www.baincapitalprivateequity.com/portfolio',
  },
  'General Atlantic': {
    website: 'https://www.generalatlantic.com',
    teamPage: 'https://www.generalatlantic.com/team/',
    portfolioPage: 'https://www.generalatlantic.com/portfolio/',
  },
  'Hellman & Friedman': {
    website: 'https://www.hfrp.com',
    teamPage: 'https://www.hfrp.com/team/',
    portfolioPage: 'https://www.hfrp.com/investments/',
  },
  'Silver Lake': {
    website: 'https://www.silverlake.com',
    teamPage: 'https://www.silverlake.com/team/',
    portfolioPage: 'https://www.silverlake.com/companies/',
  },
  'Providence Equity': {
    website: 'https://www.provequity.com',
    teamPage: 'https://www.provequity.com/team/',
    portfolioPage: 'https://www.provequity.com/portfolio/',
  },
  'Leonard Green': {
    website: 'https://www.leonardgreen.com',
    teamPage: 'https://www.leonardgreen.com/team/',
    portfolioPage: 'https://www.leonardgreen.com/companies/',
  },
  'Clayton Dubilier & Rice': {
    website: 'https://www.cdr-inc.com',
    teamPage: 'https://www.cdr-inc.com/team/',
    portfolioPage: 'https://www.cdr-inc.com/portfolio/',
  },
  'Brookfield Asset Management': {
    website: 'https://www.brookfield.com',
    teamPage: 'https://www.brookfield.com/about-us/leadership',
    portfolioPage: 'https://www.brookfield.com/our-businesses/private-equity',
  },
  'EQT Partners': {
    website: 'https://www.eqtgroup.com',
    teamPage: 'https://www.eqtgroup.com/About/Organization/',
    portfolioPage: 'https://www.eqtgroup.com/Investments/',
  },
  'Blue Owl Capital': {
    website: 'https://www.blueowl.com',
    teamPage: 'https://www.blueowl.com/about/leadership/',
    portfolioPage: 'https://www.blueowl.com/strategies/',
  },
};
