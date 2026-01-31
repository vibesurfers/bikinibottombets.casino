/**
 * ApeWisdom API Integration
 *
 * Tracks trending stocks and crypto mentions across Reddit (WSB, r/stocks, etc.)
 * and 4chan /biz/. Free API, no authentication required.
 *
 * Docs: https://apewisdom.io/api/
 */

const APEWISDOM_API = 'https://apewisdom.io/api/v1.0';

export type ApeWisdomFilter =
  | 'all'              // All subreddits combined
  | 'all-stocks'       // Stock-focused subs only
  | 'all-crypto'       // Crypto subs only
  | '4chan'            // 4chan /biz/
  | 'wallstreetbets'   // r/wallstreetbets
  | 'stocks'           // r/stocks
  | 'options'          // r/options
  | 'investing'        // r/investing
  | 'Daytrading'       // r/Daytrading
  | 'CryptoCurrency'   // r/CryptoCurrency
  | 'Bitcoin'          // r/Bitcoin
  | 'SatoshiStreetBets'; // r/SatoshiStreetBets

export interface ApeWisdomMention {
  rank: number;
  ticker: string;
  name: string;
  mentions: number;
  upvotes: number;
  rank24hAgo: number | null;
  mentions24hAgo: number | null;
}

export interface ApeWisdomResponse {
  count: number;
  pages: number;
  currentPage: number;
  results: ApeWisdomMention[];
}

/**
 * Get trending tickers from Reddit/4chan
 */
export async function getTrendingTickers(
  filter: ApeWisdomFilter = 'all-stocks',
  page = 1
): Promise<ApeWisdomResponse> {
  try {
    const url = page > 1
      ? `${APEWISDOM_API}/filter/${filter}/page/${page}`
      : `${APEWISDOM_API}/filter/${filter}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`ApeWisdom API error: ${response.status}`);
    }

    const data = await response.json();

    return {
      count: data.count || 0,
      pages: data.pages || 1,
      currentPage: data.current_page || page,
      results: (data.results || []).map((r: any) => ({
        rank: parseInt(r.rank, 10) || 0,
        ticker: r.ticker || '',
        name: r.name || '',
        mentions: parseInt(r.mentions, 10) || 0,
        upvotes: parseInt(r.upvotes, 10) || 0,
        rank24hAgo: r.rank_24h_ago ? parseInt(r.rank_24h_ago, 10) : null,
        mentions24hAgo: r.mentions_24h_ago ? parseInt(r.mentions_24h_ago, 10) : null,
      })),
    };
  } catch (error: any) {
    console.error('ApeWisdom API failed:', error.message);
    return {
      count: 0,
      pages: 0,
      currentPage: page,
      results: [],
    };
  }
}

/**
 * Get sentiment data for a specific ticker
 */
export async function getTickerSentiment(
  ticker: string,
  filter: ApeWisdomFilter = 'all-stocks'
): Promise<ApeWisdomMention | null> {
  try {
    // ApeWisdom doesn't have a direct ticker lookup, so we fetch trending
    // and search for the ticker. Check first few pages.
    const upperTicker = ticker.toUpperCase();

    for (let page = 1; page <= 3; page++) {
      const data = await getTrendingTickers(filter, page);

      const found = data.results.find(r => r.ticker.toUpperCase() === upperTicker);
      if (found) {
        return found;
      }

      // If we've searched all pages or this page had no results
      if (page >= data.pages || data.results.length === 0) {
        break;
      }
    }

    return null;
  } catch (error: any) {
    console.error('Ticker sentiment lookup failed:', error.message);
    return null;
  }
}

/**
 * Get WSB-specific sentiment for a ticker
 */
export async function getWSBSentiment(ticker: string): Promise<ApeWisdomMention | null> {
  return getTickerSentiment(ticker, 'wallstreetbets');
}

/**
 * Calculate momentum score based on rank and mention changes
 */
export function calculateMomentum(mention: ApeWisdomMention): {
  rankChange: number | null;
  mentionChange: number | null;
  mentionChangePercent: number | null;
  isTrending: boolean;
} {
  const rankChange = mention.rank24hAgo !== null
    ? mention.rank24hAgo - mention.rank // Positive = moved up
    : null;

  const mentionChange = mention.mentions24hAgo !== null
    ? mention.mentions - mention.mentions24hAgo
    : null;

  const mentionChangePercent = mention.mentions24hAgo !== null && mention.mentions24hAgo > 0
    ? ((mention.mentions - mention.mentions24hAgo) / mention.mentions24hAgo) * 100
    : null;

  // Trending if rank improved or mentions increased significantly
  const isTrending =
    (rankChange !== null && rankChange > 0) ||
    (mentionChangePercent !== null && mentionChangePercent > 20);

  return {
    rankChange,
    mentionChange,
    mentionChangePercent,
    isTrending,
  };
}

/**
 * Get comprehensive social sentiment for research pipeline
 */
export async function getSocialSentiment(ticker: string): Promise<{
  ticker: string;
  wsb: ApeWisdomMention | null;
  allStocks: ApeWisdomMention | null;
  momentum: ReturnType<typeof calculateMomentum> | null;
  summary: string;
}> {
  const [wsb, allStocks] = await Promise.all([
    getWSBSentiment(ticker),
    getTickerSentiment(ticker, 'all-stocks'),
  ]);

  const primary = wsb || allStocks;
  const momentum = primary ? calculateMomentum(primary) : null;

  let summary = `${ticker}: `;
  if (!primary) {
    summary += 'Not trending on Reddit';
  } else {
    summary += `Rank #${primary.rank} with ${primary.mentions} mentions`;
    if (momentum?.isTrending) {
      summary += ' (TRENDING';
      if (momentum.mentionChangePercent !== null) {
        summary += `, +${momentum.mentionChangePercent.toFixed(0)}% mentions`;
      }
      if (momentum.rankChange !== null && momentum.rankChange > 0) {
        summary += `, up ${momentum.rankChange} ranks`;
      }
      summary += ')';
    }
    if (wsb) {
      summary += ' [Active on WSB]';
    }
  }

  return {
    ticker,
    wsb,
    allStocks,
    momentum,
    summary,
  };
}
