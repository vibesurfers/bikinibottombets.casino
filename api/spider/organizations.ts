import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAgent } from '../lib/auth';
import { searchOrganizations, getTopPEFunds } from '../lib/org-spider-db';
import { OrgType } from '../lib/org-spider-types';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAgent(req, res);
  if (!auth) return;

  try {
    const { query, type, top } = req.query;

    // If "top" is specified, return top PE funds
    if (top === 'true' || top === '1') {
      const topFunds = await getTopPEFunds(20);
      return res.json({
        organizations: topFunds.map(org => ({
          id: org._id!.toString(),
          name: org.canonicalName,
          ticker: org.ticker,
          orgType: org.orgType,
          aum: org.aum,
          website: org.website,
        })),
      });
    }

    // Search organizations
    const searchQuery = typeof query === 'string' ? query : '';
    const orgType = typeof type === 'string' ? type as OrgType : undefined;

    const results = await searchOrganizations(searchQuery, orgType, 50);

    res.json({
      organizations: results.map(org => ({
        id: org._id!.toString(),
        name: org.canonicalName,
        aliases: org.aliases,
        ticker: org.ticker,
        cik: org.cik,
        orgType: org.orgType,
        aum: org.aum,
        website: org.website,
        description: org.description,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
