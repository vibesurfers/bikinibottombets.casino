import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getTopPEFunds,
  getPortfolioCompanies,
  getFundTeam,
  getCoInvestors,
} from '../lib/org-spider-db';
import { PEFundSummary } from '../lib/org-spider-types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { limit } = req.query;
    const maxFunds = parseInt(limit as string) || 20;

    const funds = await getTopPEFunds(maxFunds);

    // Get additional stats for each fund
    const fundSummaries: PEFundSummary[] = await Promise.all(
      funds.map(async (fund) => {
        const [portfolio, team, coInvestors] = await Promise.all([
          getPortfolioCompanies(fund._id!).catch(() => []),
          getFundTeam(fund._id!).catch(() => []),
          getCoInvestors(fund._id!).catch(() => []),
        ]);

        return {
          id: fund._id!.toString(),
          name: fund.canonicalName,
          ticker: fund.ticker,
          aum: fund.aum,
          portfolioCount: portfolio.length,
          teamCount: team.length,
          coInvestorCount: coInvestors.length,
        };
      })
    );

    // Sort by AUM descending
    fundSummaries.sort((a, b) => (b.aum || 0) - (a.aum || 0));

    res.status(200).json({
      funds: fundSummaries,
      count: fundSummaries.length,
    });
  } catch (error: any) {
    console.error('[PE Top Funds] Error:', error);
    res.status(500).json({ error: error.message });
  }
}
