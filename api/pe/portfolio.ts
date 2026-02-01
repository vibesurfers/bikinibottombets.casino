import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import {
  findOrganizationById,
  getPortfolioCompanies,
  findRelationshipsForEntity,
} from '../lib/org-spider-db';

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
    const { fundId } = req.query;

    if (!fundId || typeof fundId !== 'string') {
      return res.status(400).json({ error: 'fundId is required' });
    }

    if (!ObjectId.isValid(fundId)) {
      return res.status(400).json({ error: 'Invalid fundId' });
    }

    const fund = await findOrganizationById(fundId);
    if (!fund) {
      return res.status(404).json({ error: 'Fund not found' });
    }

    const portfolioCompanies = await getPortfolioCompanies(fundId);

    // Get relationship details for each company
    const relationships = await findRelationshipsForEntity('organization', new ObjectId(fundId), 'outgoing');
    const portfolioRels = relationships.filter(r => r.relationshipType === 'portfolio_company');

    const companies = portfolioCompanies.map(company => {
      const rel = portfolioRels.find(r => r.targetId.equals(company._id!));
      return {
        id: company._id!.toString(),
        name: company.canonicalName,
        ticker: company.ticker,
        orgType: company.orgType,
        sector: company.investmentFocus?.[0],
        website: company.website,
        description: company.description,
        investmentDetails: rel ? {
          dealType: rel.metadata.dealType,
          investmentAmount: rel.metadata.investmentAmount,
          ownershipPercent: rel.metadata.ownershipPercent,
          startDate: rel.metadata.startDate,
          endDate: rel.metadata.endDate,
          exitType: rel.metadata.exitType,
          confidence: rel.confidence,
        } : null,
      };
    });

    res.status(200).json({
      fund: {
        id: fund._id!.toString(),
        name: fund.canonicalName,
        ticker: fund.ticker,
      },
      portfolioCompanies: companies,
      count: companies.length,
    });
  } catch (error: any) {
    console.error('[PE Portfolio] Error:', error);
    res.status(500).json({ error: error.message });
  }
}
