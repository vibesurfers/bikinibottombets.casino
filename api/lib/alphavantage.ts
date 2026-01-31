/**
 * Alpha Vantage API Integration
 *
 * News & Sentiment API providing market news with AI-powered sentiment analysis.
 * Free tier: 25 requests/day. Premium plans available.
 *
 * Docs: https://www.alphavantage.co/documentation/
 */

import { config } from './config';

const ALPHAVANTAGE_API = 'https://www.alphavantage.co/query';

export type NewsTopic =
  | 'blockchain'
  | 'earnings'
  | 'ipo'
  | 'mergers_and_acquisitions'
  | 'financial_markets'
  | 'economy_fiscal'
  | 'economy_monetary'
  | 'economy_macro'
  | 'energy_transportation'
  | 'finance'
  | 'life_sciences'
  | 'manufacturing'
  | 'real_estate'
  | 'retail_wholesale'
  | 'technology';

export type SentimentLabel = 'Bearish' | 'Somewhat-Bearish' | 'Neutral' | 'Somewhat-Bullish' | 'Bullish';

export interface TickerSentiment {
  ticker: string;
  relevanceScore: number;
  sentimentScore: number;
  sentimentLabel: SentimentLabel;
}

export interface NewsArticle {
  title: string;
  url: string;
  timePublished: Date;
  authors: string[];
  summary: string;
  bannerImage?: string;
  source: string;
  sourceDomain: string;
  categoryWithinSource: string;
  topics: Array<{ topic: string; relevanceScore: number }>;
  overallSentimentScore: number;
  overallSentimentLabel: SentimentLabel;
  tickerSentiment: TickerSentiment[];
}

export interface NewsResponse {
  items: number;
  sentimentScoreDefinition: string;
  relevanceScoreDefinition: string;
  articles: NewsArticle[];
}

function parseDate(dateStr: string): Date {
  // Format: YYYYMMDDTHHMMSS
  const year = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(4, 6), 10) - 1;
  const day = parseInt(dateStr.slice(6, 8), 10);
  const hour = parseInt(dateStr.slice(9, 11), 10);
  const minute = parseInt(dateStr.slice(11, 13), 10);
  const second = parseInt(dateStr.slice(13, 15), 10) || 0;

  return new Date(year, month, day, hour, minute, second);
}

function parseSentimentLabel(label: string): SentimentLabel {
  const normalized = label.toLowerCase().replace(/_/g, '-');
  if (normalized.includes('bearish') && normalized.includes('somewhat')) return 'Somewhat-Bearish';
  if (normalized.includes('bearish')) return 'Bearish';
  if (normalized.includes('bullish') && normalized.includes('somewhat')) return 'Somewhat-Bullish';
  if (normalized.includes('bullish')) return 'Bullish';
  return 'Neutral';
}

/**
 * Get news and sentiment for a ticker or topic
 */
export async function getNewsSentiment(options: {
  tickers?: string[];
  topics?: NewsTopic[];
  timeFrom?: Date;
  timeTo?: Date;
  sort?: 'LATEST' | 'EARLIEST' | 'RELEVANCE';
  limit?: number;
}): Promise<NewsResponse> {
  const apiKey = config.ALPHAVANTAGE_API_KEY;
  if (!apiKey) {
    console.warn('Alpha Vantage API key not configured');
    return { items: 0, sentimentScoreDefinition: '', relevanceScoreDefinition: '', articles: [] };
  }

  try {
    const params = new URLSearchParams({
      function: 'NEWS_SENTIMENT',
      apikey: apiKey,
    });

    if (options.tickers?.length) {
      params.set('tickers', options.tickers.join(','));
    }

    if (options.topics?.length) {
      params.set('topics', options.topics.join(','));
    }

    if (options.timeFrom) {
      params.set('time_from', formatDateForAPI(options.timeFrom));
    }

    if (options.timeTo) {
      params.set('time_to', formatDateForAPI(options.timeTo));
    }

    if (options.sort) {
      params.set('sort', options.sort);
    }

    if (options.limit) {
      params.set('limit', Math.min(options.limit, 1000).toString());
    }

    const response = await fetch(`${ALPHAVANTAGE_API}?${params}`);

    if (!response.ok) {
      throw new Error(`Alpha Vantage API error: ${response.status}`);
    }

    const data = await response.json();

    // Check for API errors
    if (data.Note || data.Information) {
      console.warn('Alpha Vantage API limit/notice:', data.Note || data.Information);
      return { items: 0, sentimentScoreDefinition: '', relevanceScoreDefinition: '', articles: [] };
    }

    if (data['Error Message']) {
      throw new Error(data['Error Message']);
    }

    const articles: NewsArticle[] = (data.feed || []).map((item: any) => ({
      title: item.title || '',
      url: item.url || '',
      timePublished: parseDate(item.time_published || ''),
      authors: item.authors || [],
      summary: item.summary || '',
      bannerImage: item.banner_image,
      source: item.source || '',
      sourceDomain: item.source_domain || '',
      categoryWithinSource: item.category_within_source || '',
      topics: (item.topics || []).map((t: any) => ({
        topic: t.topic || '',
        relevanceScore: parseFloat(t.relevance_score) || 0,
      })),
      overallSentimentScore: parseFloat(item.overall_sentiment_score) || 0,
      overallSentimentLabel: parseSentimentLabel(item.overall_sentiment_label || 'Neutral'),
      tickerSentiment: (item.ticker_sentiment || []).map((ts: any) => ({
        ticker: ts.ticker || '',
        relevanceScore: parseFloat(ts.relevance_score) || 0,
        sentimentScore: parseFloat(ts.ticker_sentiment_score) || 0,
        sentimentLabel: parseSentimentLabel(ts.ticker_sentiment_label || 'Neutral'),
      })),
    }));

    return {
      items: parseInt(data.items, 10) || articles.length,
      sentimentScoreDefinition: data.sentiment_score_definition || '',
      relevanceScoreDefinition: data.relevance_score_definition || '',
      articles,
    };
  } catch (error: any) {
    console.error('Alpha Vantage API failed:', error.message);
    return { items: 0, sentimentScoreDefinition: '', relevanceScoreDefinition: '', articles: [] };
  }
}

function formatDateForAPI(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}`;
}

/**
 * Get news for a specific ticker
 */
export async function getTickerNews(
  ticker: string,
  limit = 10
): Promise<NewsArticle[]> {
  const response = await getNewsSentiment({
    tickers: [ticker],
    sort: 'LATEST',
    limit,
  });
  return response.articles;
}

/**
 * Get sentiment summary for a ticker
 */
export async function getTickerSentimentSummary(ticker: string): Promise<{
  ticker: string;
  articleCount: number;
  averageSentiment: number;
  sentimentLabel: SentimentLabel;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  recentHeadlines: string[];
  sources: string[];
}> {
  const articles = await getTickerNews(ticker, 20);

  if (articles.length === 0) {
    return {
      ticker,
      articleCount: 0,
      averageSentiment: 0,
      sentimentLabel: 'Neutral',
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      recentHeadlines: [],
      sources: [],
    };
  }

  // Calculate sentiment from ticker-specific sentiment when available
  let totalSentiment = 0;
  let sentimentCount = 0;
  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;

  for (const article of articles) {
    const tickerSentiment = article.tickerSentiment.find(
      ts => ts.ticker.toUpperCase() === ticker.toUpperCase()
    );

    if (tickerSentiment) {
      totalSentiment += tickerSentiment.sentimentScore;
      sentimentCount++;

      if (tickerSentiment.sentimentLabel.includes('Bullish')) bullishCount++;
      else if (tickerSentiment.sentimentLabel.includes('Bearish')) bearishCount++;
      else neutralCount++;
    } else {
      // Fall back to overall sentiment
      totalSentiment += article.overallSentimentScore;
      sentimentCount++;

      if (article.overallSentimentLabel.includes('Bullish')) bullishCount++;
      else if (article.overallSentimentLabel.includes('Bearish')) bearishCount++;
      else neutralCount++;
    }
  }

  const averageSentiment = sentimentCount > 0 ? totalSentiment / sentimentCount : 0;

  // Determine overall label based on average
  let sentimentLabel: SentimentLabel = 'Neutral';
  if (averageSentiment >= 0.35) sentimentLabel = 'Bullish';
  else if (averageSentiment >= 0.15) sentimentLabel = 'Somewhat-Bullish';
  else if (averageSentiment <= -0.35) sentimentLabel = 'Bearish';
  else if (averageSentiment <= -0.15) sentimentLabel = 'Somewhat-Bearish';

  return {
    ticker,
    articleCount: articles.length,
    averageSentiment,
    sentimentLabel,
    bullishCount,
    bearishCount,
    neutralCount,
    recentHeadlines: articles.slice(0, 5).map(a => a.title),
    sources: [...new Set(articles.map(a => a.source))].slice(0, 5),
  };
}

/**
 * Get market-wide news by topic
 */
export async function getTopicNews(
  topic: NewsTopic,
  limit = 10
): Promise<NewsArticle[]> {
  const response = await getNewsSentiment({
    topics: [topic],
    sort: 'LATEST',
    limit,
  });
  return response.articles;
}

/**
 * Get earnings-related news for a ticker
 */
export async function getEarningsNews(ticker: string): Promise<NewsArticle[]> {
  const response = await getNewsSentiment({
    tickers: [ticker],
    topics: ['earnings'],
    sort: 'LATEST',
    limit: 10,
  });
  return response.articles;
}

/**
 * Get comprehensive news sentiment for research pipeline
 */
export async function getComprehensiveNewsSentiment(ticker: string): Promise<{
  ticker: string;
  summary: ReturnType<typeof getTickerSentimentSummary> extends Promise<infer T> ? T : never;
  articles: NewsArticle[];
  earningsNews: NewsArticle[];
  formattedSummary: string;
}> {
  const [summary, articles, earningsNews] = await Promise.all([
    getTickerSentimentSummary(ticker),
    getTickerNews(ticker, 10),
    getEarningsNews(ticker),
  ]);

  let formattedSummary = `${ticker} News Sentiment: ${summary.sentimentLabel}`;
  formattedSummary += ` (${summary.articleCount} articles, avg score: ${summary.averageSentiment.toFixed(2)})`;
  formattedSummary += `\n  Bullish: ${summary.bullishCount} | Bearish: ${summary.bearishCount} | Neutral: ${summary.neutralCount}`;

  if (summary.recentHeadlines.length > 0) {
    formattedSummary += '\n  Recent Headlines:';
    for (const headline of summary.recentHeadlines.slice(0, 3)) {
      formattedSummary += `\n    - ${headline.substring(0, 80)}${headline.length > 80 ? '...' : ''}`;
    }
  }

  return {
    ticker,
    summary,
    articles,
    earningsNews,
    formattedSummary,
  };
}
