/**
 * Research Pipeline Types
 *
 * Core type definitions for the ActiveInvestorBot research pipeline.
 * See RESEARCH_PIPELINE.md for full documentation.
 */

import { ObjectId } from 'mongodb';

// ============= FINDING TYPES =============

export type FindingType =
  | 'web_search'    // Firecrawl search results
  | 'ir_page'       // Investor relations page scrape
  | 'news'          // News article scrape
  | 'sec_filing'    // SEC document (10-K, 8-K, etc.)
  | 'social'        // Social media mention
  | 'analyst'       // Analyst coverage
  | 'document';     // Other parsed document

export type FindingSource = 'firecrawl' | 'reducto' | 'manual' | 'apewisdom' | 'alphavantage';

export interface FindingStructuredData {
  // For sec_filing
  filingType?: '10-K' | '10-Q' | '8-K' | 'DEF 14A' | 'S-1' | string;
  filingDate?: Date;
  fiscalYear?: number;
  revenue?: number;
  netIncome?: number;
  eps?: number;

  // For news (enhanced with Alpha Vantage sentiment)
  publishedAt?: Date;
  author?: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
  sentimentScore?: number;        // -1 to 1 scale
  sentimentLabel?: string;        // Bullish, Bearish, Neutral, etc.
  articleCount?: number;          // Count of articles analyzed
  bullishCount?: number;          // Count of bullish articles
  bearishCount?: number;          // Count of bearish articles
  neutralCount?: number;          // Count of neutral articles

  // For social (ApeWisdom Reddit/WSB data)
  redditRank?: number;
  redditMentions?: number;
  redditUpvotes?: number;
  rank24hAgo?: number;
  mentions24hAgo?: number;
  isTrending?: boolean;
  wsbActive?: boolean;            // Active on WallStreetBets

  // For ir_page
  executives?: Array<{ name: string; title: string }>;
  upcomingEvents?: Array<{ date: Date; event: string }>;

  // Common fields
  keyPoints?: string[];
  mentions?: string[];  // Other companies/tickers mentioned
  risks?: string[];
}

export interface Finding {
  _id?: ObjectId;

  // Identification
  company: string;
  ticker?: string;

  // Classification
  findingType: FindingType;
  source: FindingSource;

  // Content
  title: string;
  sourceUrl: string;
  structuredData: FindingStructuredData;
  rawContent: string;
  rawContentTruncated: boolean;

  // Metadata
  createdAt: Date;
  expiresAt: Date;

  // Provenance
  researchJobId?: ObjectId;
  createdBy: string;
}

// ============= COMPANY GRAPH TYPES =============

export type CompanyEntityType = 'public_company' | 'private_company' | 'government' | 'institution' | 'individual';

export type CompanyRelationshipType = 'customer' | 'supplier' | 'competitor' | 'subsidiary' | 'shareholder' | 'partner';

export interface CompanyGraphSummary {
  customers: string[];
  suppliers: string[];
  competitors: string[];
  subsidiaries: string[];
  majorShareholders: Array<{ name: string; percent?: number }>;
}

// ============= RESEARCH JOB TYPES =============

export type ResearchDepth = 'quick' | 'standard' | 'deep';

export type TriggerType = 'moltbook_tag' | 'bot_initiated' | 'api_request';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'partial';

export interface ResearchQuery {
  company?: string;
  ticker?: string;
  topic?: string;
  specificQuestions?: string[];
}

export interface TriggerContext {
  moltbookPostId?: string;
  moltbookThreadId?: string;
}

export interface ResearchJob {
  _id?: ObjectId;

  // Request
  query: ResearchQuery;
  depth: ResearchDepth;

  // Provenance
  requestedBy: string;
  triggerType: TriggerType;
  triggerContext?: TriggerContext;

  // Status
  status: JobStatus;

  // Results
  findingIds: ObjectId[];
  cacheHit: boolean;

  // Timing
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;

  // Metrics
  apiCalls: {
    firecrawl: number;
    reducto: number;
  };

  // Error handling
  error?: {
    message: string;
    step: string;
    retryable: boolean;
  };
}

// ============= REQUEST/RESPONSE TYPES =============

export interface ResearchRequest {
  rawText: string;
  company?: string;
  ticker?: string;
  topic?: string;
  depth: ResearchDepth;
  specificQuestions?: string[];
  forceRefresh?: boolean;
}

export interface ResearchReportStructured {
  company: string;
  ticker?: string;
  researchedAt: Date;
  depth: ResearchDepth;
  cacheHit: boolean;
  summary: {
    keyPoints: string[];
    sentiment?: string;
  };
  financials?: {
    revenue?: number;
    netIncome?: number;
    eps?: number;
    filingDate?: Date;
  };
  socialSentiment?: {
    redditRank?: number;
    redditMentions?: number;
    redditUpvotes?: number;
    mentionChange24h?: number;
    isTrending?: boolean;
    wsbActive?: boolean;
  };
  newsSentiment?: {
    overallLabel?: string;
    overallScore?: number;
    articleCount?: number;
    bullishCount?: number;
    bearishCount?: number;
    neutralCount?: number;
  };
  companyGraph?: CompanyGraphSummary;
  news: Array<{
    title: string;
    url: string;
    publishedAt?: Date;
    sentiment?: string;
  }>;
  risks: string[];
  sources: string[];
}

export interface ResearchReport {
  jobId: ObjectId;
  structured: ResearchReportStructured;
  markdown: string;
  findings: Finding[];
}

// ============= RAW RESULT TYPES =============

export interface RawResearchResult {
  type: FindingType;
  source: FindingSource;
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
  data: unknown;
}

// ============= CONFIG =============

export const RESEARCH_CONFIG = {
  // TTL in hours by finding type
  TTL: {
    news: 4,
    social: 1,
    web_search: 4,
    ir_page: 24,
    sec_filing: 168,    // 7 days
    analyst: 24,
    document: 168       // 7 days
  } as Record<FindingType, number>,

  // Max items to fetch
  LIMITS: {
    searchResults: 5,
    newsArticles: 5,
    secFilings: 2,
    analystReports: 3
  },

  // Content truncation
  MAX_CONTENT: {
    default: 50000,
    sec_filing: 100000
  },

  // Approval threshold for karma
  APPROVAL_THRESHOLD: 1000
};

// ============= HELPER FUNCTIONS =============

export function getTTLHours(type: FindingType): number {
  return RESEARCH_CONFIG.TTL[type] || 24;
}

export function calculateExpiresAt(type: FindingType): Date {
  const hours = getTTLHours(type);
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export function getRequiredTypesForDepth(depth: ResearchDepth): FindingType[] {
  switch (depth) {
    case 'quick':
      return ['web_search'];
    case 'standard':
      return ['web_search', 'ir_page', 'news'];
    case 'deep':
      return ['web_search', 'ir_page', 'news', 'sec_filing', 'analyst'];
  }
}

export function truncateContent(content: string, type: FindingType): { content: string; truncated: boolean } {
  const maxLength = type === 'sec_filing'
    ? RESEARCH_CONFIG.MAX_CONTENT.sec_filing
    : RESEARCH_CONFIG.MAX_CONTENT.default;

  if (content.length <= maxLength) {
    return { content, truncated: false };
  }

  return { content: content.substring(0, maxLength), truncated: true };
}
