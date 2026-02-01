/**
 * Research Pipeline Service
 *
 * Core implementation of the ActiveInvestorBot research pipeline.
 * See RESEARCH_PIPELINE.md for full documentation.
 */

import { ObjectId, Collection } from 'mongodb';
import { connectToDatabase } from './db';
import { scrapeUrl, searchWeb, searchAndScrape, parseDocument, ScrapeResult } from './services';
import {
  getComprehensiveFilings,
  lookupCIK,
  getCompanyInfo,
  SECFiling,
  CompanyInfo,
} from './sec-edgar';
import { getSocialSentiment, ApeWisdomMention } from './apewisdom';
import { getComprehensiveNewsSentiment, NewsArticle } from './alphavantage';
import {
  Finding,
  FindingType,
  ResearchJob,
  ResearchRequest,
  ResearchReport,
  ResearchReportStructured,
  ResearchDepth,
  TriggerType,
  TriggerContext,
  RawResearchResult,
  RESEARCH_CONFIG,
  getTTLHours,
  calculateExpiresAt,
  getRequiredTypesForDepth,
  truncateContent,
  CompanyGraphSummary,
} from './research-types';
import {
  extractRelationshipsFromSECFilings,
  generateRelationshipMarkdown,
  getCompanyGraph,
} from './company-graph';
import { triggerFindingAlgoliaSync } from './algolia';

// ============= COLLECTION HELPERS =============

async function getFindings(): Promise<Collection<Finding>> {
  const { db } = await connectToDatabase();
  return db.collection<Finding>('findings');
}

async function getResearchJobs(): Promise<Collection<ResearchJob>> {
  const { db } = await connectToDatabase();
  return db.collection<ResearchJob>('researchJobs');
}

// ============= REQUEST PARSING =============

const TICKER_REGEX = /\$([A-Z]{1,5})\b/g;
const DEEP_KEYWORDS = ['deep dive', 'inquisition', 'full analysis', 'due diligence', 'dd'];
const QUICK_KEYWORDS = ['quick', 'brief', 'tldr', 'summary', "what's happening"];

export function parseResearchRequest(rawText: string): ResearchRequest {
  const lowerText = rawText.toLowerCase();

  // Extract ticker(s)
  const tickers = [...rawText.matchAll(TICKER_REGEX)].map(m => m[1]);
  const ticker = tickers[0]; // Use first ticker found

  // Try to extract company name (basic heuristic)
  let company: string | undefined;
  const companyPatterns = [
    /research\s+(.+?)(?:\s+\$|\s+stock|\s+for|$)/i,
    /about\s+(.+?)(?:\s+\$|\s+stock|\s+for|$)/i,
    /on\s+(.+?)(?:\s+\$|\s+stock|\s+for|$)/i,
  ];
  for (const pattern of companyPatterns) {
    const match = rawText.match(pattern);
    if (match && match[1] && match[1].length > 2 && match[1].length < 50) {
      company = match[1].trim();
      break;
    }
  }

  // Determine depth
  let depth: ResearchDepth = 'standard';
  if (DEEP_KEYWORDS.some(k => lowerText.includes(k))) {
    depth = 'deep';
  } else if (QUICK_KEYWORDS.some(k => lowerText.includes(k))) {
    depth = 'quick';
  }

  return {
    rawText,
    company,
    ticker,
    depth,
  };
}

// ============= CACHE CHECKING =============

export async function checkCache(request: ResearchRequest): Promise<Finding[] | null> {
  const { company, ticker, depth } = request;

  if (!company && !ticker) {
    return null; // Can't query without identifiers
  }

  const requiredTypes = getRequiredTypesForDepth(depth);
  const findings: Finding[] = [];
  const findingsCollection = await getFindings();

  for (const findingType of requiredTypes) {
    const ttlHours = getTTLHours(findingType);
    const minCreatedAt = new Date(Date.now() - ttlHours * 60 * 60 * 1000);

    // Build query
    const query: any = {
      findingType,
      createdAt: { $gte: minCreatedAt }
    };

    if (company && ticker) {
      query.$or = [
        { company: { $regex: company, $options: 'i' } },
        { ticker: ticker.toUpperCase() }
      ];
    } else if (ticker) {
      query.ticker = ticker.toUpperCase();
    } else if (company) {
      query.company = { $regex: company, $options: 'i' };
    }

    const cached = await findingsCollection.find(query).toArray();

    if (cached.length === 0) {
      // Cache miss for this type
      return null;
    }

    findings.push(...cached);
  }

  return findings;
}

// ============= RESEARCH EXECUTION =============

async function incrementApiCalls(
  jobsCollection: Collection<ResearchJob>,
  jobId: ObjectId,
  api: 'firecrawl' | 'reducto'
): Promise<void> {
  await jobsCollection.updateOne(
    { _id: jobId },
    { $inc: { [`apiCalls.${api}`]: 1 } }
  );
}

async function findIRPage(company: string, ticker?: string): Promise<string | null> {
  try {
    const query = ticker
      ? `${company} ${ticker} investor relations`
      : `${company} investor relations`;
    const results = await searchWeb(query, 1);
    if (results.length > 0) {
      // Look for likely IR page
      const irResult = results.find(r =>
        r.url.includes('investor') ||
        r.url.includes('ir.') ||
        r.metadata?.title?.toString().toLowerCase().includes('investor')
      );
      return irResult?.url || results[0].url;
    }
    return null;
  } catch {
    return null;
  }
}

// SEC EDGAR integration - get REAL filing URLs directly from SEC
async function getSECFilingsForTicker(ticker: string): Promise<{
  company: CompanyInfo | null;
  filings: Array<{ url: string; type: string; date: string; description: string }>;
}> {
  try {
    const data = await getComprehensiveFilings(ticker);

    const filings: Array<{ url: string; type: string; date: string; description: string }> = [];

    // Add 10-K (annual report - CRITICAL for deep analysis)
    if (data.latest10K) {
      filings.push({
        url: data.latest10K.documentUrl,
        type: '10-K',
        date: data.latest10K.filingDate,
        description: data.latest10K.primaryDocDescription || 'Annual Report',
      });
    }

    // Add 10-Q (quarterly report)
    if (data.latest10Q) {
      filings.push({
        url: data.latest10Q.documentUrl,
        type: '10-Q',
        date: data.latest10Q.filingDate,
        description: data.latest10Q.primaryDocDescription || 'Quarterly Report',
      });
    }

    // Add proxy statement (executive compensation, governance)
    if (data.latestProxy) {
      filings.push({
        url: data.latestProxy.documentUrl,
        type: 'DEF 14A',
        date: data.latestProxy.filingDate,
        description: 'Proxy Statement - Executive Compensation',
      });
    }

    // Add recent 8-Ks (material events)
    for (const eightK of data.recent8Ks) {
      filings.push({
        url: eightK.documentUrl,
        type: '8-K',
        date: eightK.filingDate,
        description: eightK.items?.join(', ') || 'Material Event',
      });
    }

    return { company: data.company, filings };
  } catch (error) {
    console.error('SEC EDGAR lookup failed:', error);
    return { company: null, filings: [] };
  }
}

export async function executeResearch(
  request: ResearchRequest,
  jobId: ObjectId,
  jobsCollection: Collection<ResearchJob>
): Promise<RawResearchResult[]> {
  const results: RawResearchResult[] = [];
  const { company, ticker, depth } = request;

  const searchTarget = ticker || company || 'market';

  // === QUICK: Fast search (titles/descriptions only) ===
  // === STANDARD & DEEP: Full search + scrape for rich content ===
  try {
    const searchQuery = ticker
      ? `${company || ''} ${ticker} stock news analysis`
      : `${company} investor news analysis`;

    if (depth === 'quick') {
      // Quick: Just get search results (titles, descriptions)
      const searchResults = await searchWeb(searchQuery, RESEARCH_CONFIG.LIMITS.searchResults);
      await incrementApiCalls(jobsCollection, jobId, 'firecrawl');

      results.push({
        type: 'web_search',
        source: 'firecrawl',
        data: searchResults
      });
      return results;
    }

    // Standard/Deep: Search AND scrape for full page content
    console.log(`[Firecrawl] Searching and scraping for "${searchQuery}"...`);
    const scrapedResults = await searchAndScrape(searchQuery, RESEARCH_CONFIG.LIMITS.searchResults);
    // Count API calls: 1 search + N scrapes
    await incrementApiCalls(jobsCollection, jobId, 'firecrawl');
    for (let i = 0; i < scrapedResults.length; i++) {
      await incrementApiCalls(jobsCollection, jobId, 'firecrawl');
    }

    results.push({
      type: 'web_search',
      source: 'firecrawl',
      data: scrapedResults
    });

    console.log(`[Firecrawl] ✓ Scraped ${scrapedResults.length} pages, avg ${Math.round(scrapedResults.reduce((sum, r) => sum + (r.markdown?.length || 0), 0) / scrapedResults.length)} chars`);
  } catch (error: any) {
    console.error('Search failed:', error.message);
    // Search is critical - rethrow
    throw error;
  }

  // === STANDARD & DEEP: IR page ===
  try {
    const irUrl = await findIRPage(company || searchTarget, ticker);
    await incrementApiCalls(jobsCollection, jobId, 'firecrawl');

    if (irUrl) {
      const irPage = await scrapeUrl(irUrl);
      await incrementApiCalls(jobsCollection, jobId, 'firecrawl');

      results.push({
        type: 'ir_page',
        source: 'firecrawl',
        sourceUrl: irUrl,
        data: irPage
      });
    }
  } catch (error: any) {
    console.warn('IR page scrape failed, continuing:', error.message);
  }

  // === STANDARD & DEEP: Recent news ===
  try {
    const today = new Date().toISOString().split('T')[0];
    const newsQuery = `"${company || ticker}" news ${today}`;

    if (depth === 'deep') {
      // Deep: Scrape full articles
      console.log(`[Firecrawl] Scraping news articles for "${newsQuery}"...`);
      const newsResults = await searchAndScrape(newsQuery, RESEARCH_CONFIG.LIMITS.newsArticles);
      await incrementApiCalls(jobsCollection, jobId, 'firecrawl');
      for (let i = 0; i < newsResults.length; i++) {
        await incrementApiCalls(jobsCollection, jobId, 'firecrawl');
      }

      results.push({
        type: 'news',
        source: 'firecrawl',
        data: newsResults
      });
      console.log(`[Firecrawl] ✓ Scraped ${newsResults.length} news articles`);
    } else {
      // Standard: Just search results (faster)
      const newsResults = await searchWeb(newsQuery, RESEARCH_CONFIG.LIMITS.newsArticles);
      await incrementApiCalls(jobsCollection, jobId, 'firecrawl');

      results.push({
        type: 'news',
        source: 'firecrawl',
        data: newsResults
      });
    }
  } catch (error: any) {
    console.warn('News search failed, continuing:', error.message);
  }

  // === STANDARD & DEEP: Reddit/WSB Social Sentiment (ApeWisdom) ===
  if (ticker) {
    try {
      console.log(`[ApeWisdom] Fetching Reddit sentiment for ${ticker}...`);
      const socialData = await getSocialSentiment(ticker);

      if (socialData.wsb || socialData.allStocks) {
        const primary = socialData.wsb || socialData.allStocks!;
        results.push({
          type: 'social',
          source: 'apewisdom',
          sourceUrl: `https://apewisdom.io/stocks/${ticker}`,
          metadata: {
            dataType: 'reddit_sentiment',
            wsbActive: !!socialData.wsb,
            isTrending: socialData.momentum?.isTrending || false,
          },
          data: {
            markdown: `# Reddit Social Sentiment: ${ticker}\n\n` +
              `${socialData.summary}\n\n` +
              `- **Rank**: #${primary.rank}\n` +
              `- **Mentions**: ${primary.mentions}\n` +
              `- **Upvotes**: ${primary.upvotes}\n` +
              (socialData.momentum?.rankChange != null
                ? `- **Rank Change (24h)**: ${socialData.momentum!.rankChange > 0 ? '+' : ''}${socialData.momentum!.rankChange}\n`
                : '') +
              (socialData.momentum?.mentionChangePercent != null
                ? `- **Mention Change (24h)**: ${socialData.momentum!.mentionChangePercent > 0 ? '+' : ''}${socialData.momentum!.mentionChangePercent.toFixed(1)}%\n`
                : '') +
              (socialData.wsb ? '\n**Active on r/WallStreetBets**\n' : ''),
            metadata: { title: `${ticker} Reddit Sentiment` },
            structuredData: {
              redditRank: primary.rank,
              redditMentions: primary.mentions,
              redditUpvotes: primary.upvotes,
              rank24hAgo: primary.rank24hAgo,
              mentions24hAgo: primary.mentions24hAgo,
              isTrending: socialData.momentum?.isTrending || false,
              wsbActive: !!socialData.wsb,
            },
          }
        });
        console.log(`[ApeWisdom] ✓ ${socialData.summary}`);
      } else {
        console.log(`[ApeWisdom] ${ticker} not trending on Reddit`);
      }
    } catch (error: any) {
      console.warn('[ApeWisdom] Social sentiment failed, continuing:', error.message);
    }
  }

  // === STANDARD & DEEP: Alpha Vantage News Sentiment ===
  if (ticker) {
    try {
      console.log(`[Alpha Vantage] Fetching news sentiment for ${ticker}...`);
      const newsData = await getComprehensiveNewsSentiment(ticker);

      if (newsData.articles.length > 0) {
        // Add individual articles as news findings with sentiment
        for (const article of newsData.articles.slice(0, 5)) {
          const tickerSentiment = article.tickerSentiment.find(
            ts => ts.ticker.toUpperCase() === ticker.toUpperCase()
          );

          results.push({
            type: 'news',
            source: 'alphavantage',
            sourceUrl: article.url,
            metadata: {
              dataType: 'news_with_sentiment',
              sentimentScore: tickerSentiment?.sentimentScore || article.overallSentimentScore,
              sentimentLabel: tickerSentiment?.sentimentLabel || article.overallSentimentLabel,
            },
            data: {
              markdown: `# ${article.title}\n\n` +
                `**Source**: ${article.source}\n` +
                `**Published**: ${article.timePublished.toISOString()}\n` +
                `**Sentiment**: ${tickerSentiment?.sentimentLabel || article.overallSentimentLabel} ` +
                `(${(tickerSentiment?.sentimentScore || article.overallSentimentScore).toFixed(2)})\n\n` +
                `${article.summary}\n`,
              metadata: { title: article.title },
            }
          });
        }

        // Add sentiment summary
        results.push({
          type: 'analyst',
          source: 'alphavantage',
          sourceUrl: `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${ticker}`,
          metadata: {
            dataType: 'sentiment_summary',
          },
          data: {
            markdown: `# ${ticker} News Sentiment Summary\n\n` +
              `${newsData.formattedSummary}\n\n` +
              `**Sources**: ${newsData.summary.sources.join(', ')}\n`,
            metadata: { title: `${ticker} News Sentiment Summary` },
            structuredData: {
              sentimentScore: newsData.summary.averageSentiment,
              sentimentLabel: newsData.summary.sentimentLabel,
              articleCount: newsData.summary.articleCount,
              bullishCount: newsData.summary.bullishCount,
              bearishCount: newsData.summary.bearishCount,
              neutralCount: newsData.summary.neutralCount,
            },
          }
        });
        console.log(`[Alpha Vantage] ✓ ${newsData.summary.articleCount} articles, sentiment: ${newsData.summary.sentimentLabel}`);
      } else {
        console.log(`[Alpha Vantage] No news articles found for ${ticker}`);
      }
    } catch (error: any) {
      console.warn('[Alpha Vantage] News sentiment failed, continuing:', error.message);
    }
  }

  if (depth === 'standard') {
    return results;
  }

  // === DEEP: SEC filings via EDGAR API (THE REAL DATA) ===
  if (ticker) {
    try {
      console.log(`[SEC EDGAR] Fetching comprehensive filings for ${ticker}...`);
      const secData = await getSECFilingsForTicker(ticker);

      // Store company info
      if (secData.company) {
        results.push({
          type: 'document',
          source: 'manual',
          sourceUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${secData.company.cik}`,
          metadata: {
            dataType: 'company_info',
            ...secData.company,
          },
          data: {
            markdown: `# ${secData.company.name} (${secData.company.ticker})\n\n` +
              `- **CIK**: ${secData.company.cik}\n` +
              `- **Exchange**: ${secData.company.exchange || 'N/A'}\n` +
              `- **SIC**: ${secData.company.sic} - ${secData.company.sicDescription || ''}\n` +
              `- **State of Incorporation**: ${secData.company.stateOfIncorporation || 'N/A'}\n` +
              `- **Fiscal Year End**: ${secData.company.fiscalYearEnd || 'N/A'}\n`,
            metadata: { title: `${secData.company.name} Company Information` },
          }
        });
      }

      console.log(`[SEC EDGAR] Found ${secData.filings.length} filings to process`);

      // Process each filing with Reducto
      for (const filing of secData.filings.slice(0, 4)) { // Limit to 4 most important filings
        try {
          console.log(`[SEC EDGAR] Parsing ${filing.type} from ${filing.date}...`);

          // Check if it's HTML or PDF
          const isHtml = filing.url.endsWith('.htm') || filing.url.endsWith('.html');

          if (isHtml) {
            // For HTML filings, use Firecrawl to scrape (better for HTML)
            const scraped = await scrapeUrl(filing.url);
            await incrementApiCalls(jobsCollection, jobId, 'firecrawl');

            results.push({
              type: 'sec_filing',
              source: 'firecrawl',
              sourceUrl: filing.url,
              metadata: {
                filingType: filing.type,
                filingDate: filing.date,
                description: filing.description,
              },
              data: scraped
            });
            console.log(`[SEC EDGAR] ✓ Scraped ${filing.type} (${scraped.markdown.length} chars)`);
          } else {
            // For PDF filings, use Reducto
            const parsed = await parseDocument(filing.url);
            await incrementApiCalls(jobsCollection, jobId, 'reducto');

            results.push({
              type: 'sec_filing',
              source: 'reducto',
              sourceUrl: filing.url,
              metadata: {
                filingType: filing.type,
                filingDate: filing.date,
                description: filing.description,
              },
              data: parsed
            });
            console.log(`[SEC EDGAR] ✓ Parsed ${filing.type} (${parsed.chunks?.length || 0} chunks, ${parsed.numPages} pages)`);
          }
        } catch (error: any) {
          console.error(`[SEC EDGAR] ✗ Failed to parse ${filing.type}: ${error.message}`);
          // Don't give up - try alternate method
          try {
            // Try scraping as backup
            const scraped = await scrapeUrl(filing.url);
            await incrementApiCalls(jobsCollection, jobId, 'firecrawl');

            results.push({
              type: 'sec_filing',
              source: 'firecrawl',
              sourceUrl: filing.url,
              metadata: {
                filingType: filing.type,
                filingDate: filing.date,
                description: filing.description,
              },
              data: scraped
            });
            console.log(`[SEC EDGAR] ✓ Fallback scrape succeeded for ${filing.type}`);
          } catch (fallbackError: any) {
            console.error(`[SEC EDGAR] ✗ Fallback also failed: ${fallbackError.message}`);
          }
        }
      }
    } catch (error: any) {
      console.error('[SEC EDGAR] Critical failure:', error.message);
    }
  }

  // === DEEP: Analyst coverage ===
  try {
    const analystQuery = `${company || ticker} analyst rating price target`;
    const analystResults = await searchWeb(analystQuery, RESEARCH_CONFIG.LIMITS.analystReports);
    await incrementApiCalls(jobsCollection, jobId, 'firecrawl');

    results.push({
      type: 'analyst',
      source: 'firecrawl',
      data: analystResults
    });
  } catch (error: any) {
    console.warn('Analyst search failed, continuing:', error.message);
  }

  return results;
}

// ============= NORMALIZATION & STORAGE =============

function extractKeyPoints(content: string): string[] {
  // Simple extraction: look for sentences with key financial terms
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
  const keyTerms = ['revenue', 'profit', 'growth', 'market', 'announced', 'launched', 'acquired', 'partnership'];

  return sentences
    .filter(s => keyTerms.some(t => s.toLowerCase().includes(t)))
    .slice(0, 5)
    .map(s => s.trim());
}

function normalizeSearchResult(
  result: ScrapeResult,
  request: ResearchRequest,
  type: FindingType
): Partial<Finding> {
  const { content, truncated } = truncateContent(result.markdown || '', type);

  return {
    company: request.company || request.ticker || 'Unknown',
    ticker: request.ticker?.toUpperCase(),
    findingType: type,
    source: 'firecrawl',
    title: (result.metadata?.title as string) || result.url,
    sourceUrl: result.url,
    structuredData: {
      keyPoints: extractKeyPoints(result.markdown || ''),
    },
    rawContent: content,
    rawContentTruncated: truncated,
  };
}

function normalizeReductoResult(
  result: any,
  sourceUrl: string,
  metadata: Record<string, unknown>,
  request: ResearchRequest
): Partial<Finding> {
  const fullContent = result.chunks?.map((c: any) => c.content).join('\n\n') || '';
  const { content, truncated } = truncateContent(fullContent, 'sec_filing');

  return {
    company: request.company || request.ticker || 'Unknown',
    ticker: request.ticker?.toUpperCase(),
    findingType: 'sec_filing',
    source: 'reducto',
    title: `${request.company || request.ticker} ${metadata.filingType || 'Filing'}`,
    sourceUrl,
    structuredData: {
      filingType: metadata.filingType as string,
      keyPoints: extractKeyPoints(fullContent),
    },
    rawContent: content,
    rawContentTruncated: truncated,
  };
}

export async function normalizeAndStore(
  rawResults: RawResearchResult[],
  request: ResearchRequest,
  jobId: ObjectId,
  createdBy: string = 'bot'
): Promise<Finding[]> {
  const findingsCollection = await getFindings();
  const findings: Finding[] = [];

  for (const raw of rawResults) {
    try {
      let partialFindings: Partial<Finding>[] = [];

      if (raw.source === 'firecrawl') {
        if (Array.isArray(raw.data)) {
          // Search results - multiple findings
          partialFindings = (raw.data as ScrapeResult[]).map(r =>
            normalizeSearchResult(r, request, raw.type)
          );
        } else {
          // Single scrape result
          partialFindings = [normalizeSearchResult(raw.data as ScrapeResult, request, raw.type)];
        }
      } else if (raw.source === 'reducto') {
        partialFindings = [normalizeReductoResult(
          raw.data,
          raw.sourceUrl || '',
          raw.metadata || {},
          request
        )];
      } else if (raw.source === 'apewisdom' || raw.source === 'alphavantage') {
        // Direct structured data from ApeWisdom or Alpha Vantage
        const data = raw.data as { markdown: string; metadata?: Record<string, unknown>; structuredData?: Record<string, unknown> };
        const { content, truncated } = truncateContent(data.markdown || '', raw.type);

        partialFindings = [{
          company: request.company || request.ticker || 'Unknown',
          ticker: request.ticker?.toUpperCase(),
          findingType: raw.type,
          source: raw.source,
          title: (data.metadata?.title as string) || `${request.ticker} ${raw.type}`,
          sourceUrl: raw.sourceUrl || '',
          structuredData: {
            ...data.structuredData,
            ...(raw.metadata || {}),
          },
          rawContent: content,
          rawContentTruncated: truncated,
        }];
      } else if (raw.source === 'manual') {
        // Manual/document data (e.g., company info from SEC)
        const data = raw.data as { markdown: string; metadata?: Record<string, unknown> };
        const { content, truncated } = truncateContent(data.markdown || '', raw.type);

        partialFindings = [{
          company: request.company || request.ticker || 'Unknown',
          ticker: request.ticker?.toUpperCase(),
          findingType: raw.type,
          source: raw.source,
          title: (data.metadata?.title as string) || `${request.ticker} ${raw.type}`,
          sourceUrl: raw.sourceUrl || '',
          structuredData: {
            ...(raw.metadata || {}),
          },
          rawContent: content,
          rawContentTruncated: truncated,
        }];
      }

      // Add common fields and store
      for (const partial of partialFindings) {
        if (!partial.sourceUrl) continue; // Skip invalid entries

        const finding: Finding = {
          ...partial as Finding,
          createdAt: new Date(),
          expiresAt: calculateExpiresAt(partial.findingType!),
          researchJobId: jobId,
          createdBy,
        };

        // Upsert by sourceUrl to avoid duplicates
        const result = await findingsCollection.updateOne(
          { sourceUrl: finding.sourceUrl },
          { $set: finding },
          { upsert: true }
        );

        if (result.upsertedId) {
          finding._id = result.upsertedId;
          // Sync new finding to Algolia (only for newly inserted records)
          triggerFindingAlgoliaSync(finding);
        } else {
          const existing = await findingsCollection.findOne({ sourceUrl: finding.sourceUrl });
          if (existing) finding._id = existing._id;
        }

        findings.push(finding);
      }
    } catch (error: any) {
      console.error('Failed to normalize/store result:', error.message);
    }
  }

  return findings;
}

// ============= OUTPUT GENERATION =============

function formatNumber(num: number): string {
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(2);
}

export function generateMarkdown(findings: Finding[], request: ResearchRequest): string {
  const { company, ticker, depth } = request;

  let md = `## Research Report: ${company || 'Company'}`;
  if (ticker) md += ` ($${ticker})`;
  md += `\n\n`;
  md += `*Generated ${new Date().toISOString().split('T')[0]} | Depth: ${depth}*\n\n`;

  // === SUMMARY SECTION ===
  md += `### Summary\n\n`;
  const summaryPoints = findings
    .flatMap(f => f.structuredData.keyPoints || [])
    .filter((v, i, a) => a.indexOf(v) === i) // Dedupe
    .slice(0, 5);

  if (summaryPoints.length > 0) {
    for (const point of summaryPoints) {
      md += `- ${point}\n`;
    }
  } else {
    md += `*No key points extracted*\n`;
  }
  md += `\n`;

  // === SOCIAL SENTIMENT (Reddit/WSB) ===
  const socialFinding = findings.find(f => f.findingType === 'social' && f.source === 'apewisdom');
  if (socialFinding) {
    md += `### Social Sentiment (Reddit)\n\n`;
    const sd = socialFinding.structuredData;
    if (sd.redditRank) {
      md += `| Metric | Value |\n|--------|-------|\n`;
      md += `| Reddit Rank | #${sd.redditRank} |\n`;
      if (sd.redditMentions) md += `| Mentions | ${sd.redditMentions} |\n`;
      if (sd.redditUpvotes) md += `| Upvotes | ${sd.redditUpvotes} |\n`;
      if (sd.mentions24hAgo && sd.redditMentions) {
        const change = ((sd.redditMentions - sd.mentions24hAgo) / sd.mentions24hAgo * 100).toFixed(1);
        md += `| 24h Change | ${parseFloat(change) > 0 ? '+' : ''}${change}% |\n`;
      }
      md += `\n`;
      if (sd.isTrending) md += `**TRENDING** `;
      if (sd.wsbActive) md += `*Active on r/WallStreetBets*`;
      if (sd.isTrending || sd.wsbActive) md += `\n\n`;
    }
  }

  // === NEWS SENTIMENT ===
  const sentimentSummary = findings.find(f => f.source === 'alphavantage' && f.structuredData.sentimentLabel);
  if (sentimentSummary) {
    md += `### News Sentiment\n\n`;
    const sd = sentimentSummary.structuredData;
    md += `**Overall**: ${sd.sentimentLabel}`;
    if (sd.sentimentScore !== undefined) {
      md += ` (${(sd.sentimentScore as number).toFixed(2)})`;
    }
    md += `\n\n`;
    if (sd.articleCount) {
      md += `| Sentiment | Count |\n|-----------|-------|\n`;
      md += `| Bullish | ${sd.bullishCount || 0} |\n`;
      md += `| Neutral | ${sd.neutralCount || 0} |\n`;
      md += `| Bearish | ${sd.bearishCount || 0} |\n`;
      md += `\n*Based on ${sd.articleCount} articles*\n\n`;
    }
  }

  // === FINANCIALS (if available) ===
  const filing = findings.find(f => f.findingType === 'sec_filing');
  if (filing?.structuredData.revenue || filing?.structuredData.netIncome) {
    md += `### Key Financials\n\n`;
    md += `| Metric | Value |\n|--------|-------|\n`;
    if (filing.structuredData.revenue) {
      md += `| Revenue | $${formatNumber(filing.structuredData.revenue)} |\n`;
    }
    if (filing.structuredData.netIncome) {
      md += `| Net Income | $${formatNumber(filing.structuredData.netIncome)} |\n`;
    }
    if (filing.structuredData.eps) {
      md += `| EPS | $${filing.structuredData.eps.toFixed(2)} |\n`;
    }
    md += `\n`;
  }

  // === RECENT NEWS ===
  const newsFindings = findings.filter(f => f.findingType === 'news' || f.findingType === 'web_search');
  if (newsFindings.length > 0) {
    md += `### Sources & News\n\n`;
    const seen = new Set<string>();
    for (const news of newsFindings.slice(0, 8)) {
      if (seen.has(news.sourceUrl)) continue;
      seen.add(news.sourceUrl);
      const sentiment = news.structuredData.sentimentLabel;
      const sentimentBadge = sentiment ? ` [${sentiment}]` : '';
      md += `- [${news.title.substring(0, 70)}](${news.sourceUrl})${sentimentBadge}\n`;
    }
    md += `\n`;
  }

  // === RISKS (if deep research) ===
  const risks = findings
    .flatMap(f => f.structuredData.risks || [])
    .slice(0, 3);
  if (risks.length > 0) {
    md += `### Key Risks\n\n`;
    for (const risk of risks) {
      md += `- ${risk}\n`;
    }
    md += `\n`;
  }

  // === RESEARCH STATS ===
  md += `---\n`;
  md += `*${findings.length} findings from ${new Set(findings.map(f => f.source)).size} sources*\n`;

  return md;
}

export function generateMarkdownWithGraph(
  findings: Finding[],
  request: ResearchRequest,
  companyGraph?: CompanyGraphSummary
): string {
  // Start with base markdown
  let md = generateMarkdown(findings, request);

  // Insert company relationships section before research stats
  if (companyGraph && request.depth === 'deep') {
    const graphMd = generateRelationshipMarkdown(
      request.company || request.ticker || 'Unknown',
      request.ticker || '',
      companyGraph
    );

    // Insert before the final stats line
    const statsIndex = md.lastIndexOf('---\n');
    if (statsIndex > 0) {
      md = md.slice(0, statsIndex) + graphMd + md.slice(statsIndex);
    } else {
      md += graphMd;
    }
  }

  return md;
}

export function generateOutput(
  findings: Finding[],
  request: ResearchRequest,
  jobId: ObjectId,
  cacheHit: boolean,
  companyGraph?: CompanyGraphSummary
): ResearchReport {
  const structured: ResearchReportStructured = {
    company: request.company || request.ticker || 'Unknown',
    ticker: request.ticker,
    researchedAt: new Date(),
    depth: request.depth,
    cacheHit,
    summary: {
      keyPoints: findings
        .flatMap(f => f.structuredData.keyPoints || [])
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, 5),
    },
    news: findings
      .filter(f => f.findingType === 'news' || f.findingType === 'web_search')
      .slice(0, 5)
      .map(f => ({
        title: f.title,
        url: f.sourceUrl,
        publishedAt: f.structuredData.publishedAt,
      })),
    risks: findings
      .flatMap(f => f.structuredData.risks || [])
      .slice(0, 3),
    sources: [...new Set(findings.map(f => f.sourceUrl))].slice(0, 10),
  };

  // Add financials if available
  const filing = findings.find(f => f.findingType === 'sec_filing');
  if (filing) {
    structured.financials = {
      revenue: filing.structuredData.revenue,
      netIncome: filing.structuredData.netIncome,
      eps: filing.structuredData.eps,
      filingDate: filing.structuredData.filingDate,
    };
  }

  // Add social sentiment (Reddit/WSB from ApeWisdom)
  const socialFinding = findings.find(f => f.findingType === 'social' && f.source === 'apewisdom');
  if (socialFinding) {
    const sd = socialFinding.structuredData;
    structured.socialSentiment = {
      redditRank: sd.redditRank,
      redditMentions: sd.redditMentions,
      redditUpvotes: sd.redditUpvotes,
      mentionChange24h: sd.mentions24hAgo && sd.redditMentions
        ? ((sd.redditMentions - sd.mentions24hAgo) / sd.mentions24hAgo) * 100
        : undefined,
      isTrending: sd.isTrending,
      wsbActive: sd.wsbActive,
    };
  }

  // Add news sentiment (from Alpha Vantage)
  const sentimentSummary = findings.find(f => f.source === 'alphavantage' && f.structuredData.sentimentLabel);
  if (sentimentSummary) {
    const sd = sentimentSummary.structuredData;
    structured.newsSentiment = {
      overallLabel: sd.sentimentLabel as string,
      overallScore: sd.sentimentScore as number,
      articleCount: sd.articleCount as number,
      bullishCount: sd.bullishCount as number,
      bearishCount: sd.bearishCount as number,
      neutralCount: sd.neutralCount as number,
    };
  }

  // Add company graph if available
  if (companyGraph) {
    structured.companyGraph = companyGraph;
  }

  return {
    jobId,
    structured,
    markdown: generateMarkdownWithGraph(findings, request, companyGraph),
    findings,
  };
}

// ============= MAIN PIPELINE =============

export interface ResearchOptions {
  triggerType?: TriggerType;
  triggerContext?: TriggerContext;
  forceRefresh?: boolean;
  depthOverride?: ResearchDepth;
  requestedBy?: string;
}

export async function research(
  rawText: string,
  options: ResearchOptions = {}
): Promise<ResearchReport> {
  const jobsCollection = await getResearchJobs();

  // === STEP 1: Parse request ===
  const request = parseResearchRequest(rawText);

  // Apply overrides
  if (options.depthOverride) {
    request.depth = options.depthOverride;
  }

  // === STEP 2: Create job record ===
  const job: ResearchJob = {
    query: {
      company: request.company,
      ticker: request.ticker,
      topic: request.topic,
    },
    depth: request.depth,
    requestedBy: options.requestedBy || 'bot',
    triggerType: options.triggerType || 'api_request',
    triggerContext: options.triggerContext,
    status: 'pending',
    findingIds: [],
    cacheHit: false,
    createdAt: new Date(),
    apiCalls: { firecrawl: 0, reducto: 0 }
  };

  const insertResult = await jobsCollection.insertOne(job as any);
  const jobId = insertResult.insertedId;

  try {
    // === STEP 3: Update status to running ===
    await jobsCollection.updateOne(
      { _id: jobId },
      { $set: { status: 'running', startedAt: new Date() } }
    );

    // === STEP 4: Check cache (unless forceRefresh) ===
    if (!options.forceRefresh) {
      const cachedFindings = await checkCache(request);
      if (cachedFindings && cachedFindings.length > 0) {
        // Try to load company graph from database for deep research
        let cachedGraph: CompanyGraphSummary | undefined;
        if (request.depth === 'deep' && request.ticker) {
          const graph = await getCompanyGraph(request.ticker);
          if (graph) {
            cachedGraph = {
              customers: graph.customers.map(c => c.entity.canonicalName),
              suppliers: graph.suppliers.map(s => s.entity.canonicalName),
              competitors: graph.competitors.map(c => c.entity.canonicalName),
              subsidiaries: graph.subsidiaries.map(s => s.entity.canonicalName),
              majorShareholders: graph.shareholders.map(s => ({
                name: s.entity.canonicalName,
                percent: s.relationship.metadata.ownershipPercent,
              })),
            };
          }
        }

        await jobsCollection.updateOne(
          { _id: jobId },
          {
            $set: {
              cacheHit: true,
              findingIds: cachedFindings.map(f => f._id!),
              status: 'completed',
              completedAt: new Date()
            }
          }
        );
        return generateOutput(cachedFindings, request, jobId, true, cachedGraph);
      }
    }

    // === STEP 5: Execute research ===
    const rawResults = await executeResearch(request, jobId, jobsCollection);

    // === STEP 6: Normalize and store ===
    const findings = await normalizeAndStore(
      rawResults,
      request,
      jobId,
      options.requestedBy || 'bot'
    );

    // === STEP 6.5: Extract company relationships (deep research only) ===
    let companyGraph: CompanyGraphSummary | undefined;
    if (request.depth === 'deep' && request.ticker) {
      try {
        console.log(`[CompanyGraph] Extracting relationships for ${request.ticker}...`);
        const graphResult = await extractRelationshipsFromSECFilings(
          request.ticker,
          request.company || request.ticker
        );
        companyGraph = {
          customers: graphResult.summary.customers,
          suppliers: graphResult.summary.suppliers,
          competitors: graphResult.summary.competitors,
          subsidiaries: graphResult.summary.subsidiaries,
          majorShareholders: [], // Will be populated from 13F data if available
        };
        console.log(`[CompanyGraph] Extracted: ${graphResult.relationships.length} relationships`);
      } catch (error: any) {
        console.warn('[CompanyGraph] Relationship extraction failed:', error.message);
      }
    }

    // === STEP 7: Update job ===
    await jobsCollection.updateOne(
      { _id: jobId },
      {
        $set: {
          findingIds: findings.map(f => f._id!).filter(Boolean),
          status: findings.length > 0 ? 'completed' : 'partial',
          completedAt: new Date()
        }
      }
    );

    // === STEP 8: Generate output ===
    return generateOutput(findings, request, jobId, false, companyGraph);

  } catch (error: any) {
    // Update job with error
    await jobsCollection.updateOne(
      { _id: jobId },
      {
        $set: {
          status: 'failed',
          error: {
            message: error.message,
            step: error.step || 'unknown',
            retryable: error.message.includes('rate') || error.message.includes('timeout')
          },
          completedAt: new Date()
        }
      }
    );
    throw error;
  }
}

// ============= CONVENIENCE FUNCTIONS =============

export async function quickLookup(ticker: string): Promise<ResearchReport> {
  return research(`quick update on $${ticker}`, { depthOverride: 'quick' });
}

export async function deepDive(company: string, ticker?: string): Promise<ResearchReport> {
  const query = ticker ? `deep dive on ${company} $${ticker}` : `deep dive on ${company}`;
  return research(query, { depthOverride: 'deep' });
}

export async function getCachedFindings(
  company?: string,
  ticker?: string
): Promise<Finding[]> {
  const findingsCollection = await getFindings();

  const query: any = {};
  if (company && ticker) {
    query.$or = [
      { company: { $regex: company, $options: 'i' } },
      { ticker: ticker.toUpperCase() }
    ];
  } else if (ticker) {
    query.ticker = ticker.toUpperCase();
  } else if (company) {
    query.company = { $regex: company, $options: 'i' };
  } else {
    return [];
  }

  // Only return non-expired findings
  query.expiresAt = { $gt: new Date() };

  return findingsCollection.find(query).sort({ createdAt: -1 }).limit(20).toArray();
}
