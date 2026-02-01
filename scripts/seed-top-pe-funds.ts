/**
 * Seed Top 20 PE Funds
 *
 * Creates initial organization entries for top PE funds with their key metadata.
 * Run with: npx tsx scripts/seed-top-pe-funds.ts
 */

import 'dotenv/config';
import {
  createOrganization,
  findOrganizationByName,
  ensureOrgSpiderIndexes,
} from '../api/lib/org-spider-db';
import { Organization, OrgType } from '../api/lib/org-spider-types';
import { knownPEFundWebsites } from '../api/lib/web-extractors';
import { connectToDatabase } from '../api/lib/db';

// Top 20 PE Funds with their metadata
const topPEFunds: Array<{
  name: string;
  ticker?: string;
  cik?: string;
  orgType: OrgType;
  aum?: number; // In USD
  investmentFocus?: string[];
  headquarters?: { city: string; state?: string; country: string };
  foundedYear?: number;
  description?: string;
}> = [
  {
    name: 'Blackstone',
    ticker: 'BX',
    cik: '0001393818',
    orgType: 'asset_manager',
    aum: 1_000_000_000_000, // $1T+
    investmentFocus: ['Private Equity', 'Real Estate', 'Credit', 'Hedge Funds'],
    headquarters: { city: 'New York', state: 'NY', country: 'USA' },
    foundedYear: 1985,
    description: 'World\'s largest alternative asset manager',
  },
  {
    name: 'KKR',
    ticker: 'KKR',
    cik: '0001404912',
    orgType: 'pe_fund',
    aum: 550_000_000_000,
    investmentFocus: ['Private Equity', 'Infrastructure', 'Real Estate', 'Credit'],
    headquarters: { city: 'New York', state: 'NY', country: 'USA' },
    foundedYear: 1976,
    description: 'Global investment firm known for leveraged buyouts',
  },
  {
    name: 'Apollo Global Management',
    ticker: 'APO',
    cik: '0001411494',
    orgType: 'asset_manager',
    aum: 650_000_000_000,
    investmentFocus: ['Credit', 'Private Equity', 'Real Assets'],
    headquarters: { city: 'New York', state: 'NY', country: 'USA' },
    foundedYear: 1990,
    description: 'Alternative investment manager focusing on credit',
  },
  {
    name: 'Carlyle Group',
    ticker: 'CG',
    cik: '0001527166',
    orgType: 'pe_fund',
    aum: 420_000_000_000,
    investmentFocus: ['Private Equity', 'Real Assets', 'Global Credit'],
    headquarters: { city: 'Washington', state: 'DC', country: 'USA' },
    foundedYear: 1987,
    description: 'Global investment firm with political connections',
  },
  {
    name: 'TPG',
    ticker: 'TPG',
    cik: '0001880661',
    orgType: 'pe_fund',
    aum: 220_000_000_000,
    investmentFocus: ['Private Equity', 'Growth', 'Impact', 'Real Estate'],
    headquarters: { city: 'San Francisco', state: 'CA', country: 'USA' },
    foundedYear: 1992,
    description: 'Global alternative asset firm with tech focus',
  },
  {
    name: 'Ares Management',
    ticker: 'ARES',
    cik: '0001555280',
    orgType: 'asset_manager',
    aum: 400_000_000_000,
    investmentFocus: ['Credit', 'Private Equity', 'Real Estate'],
    headquarters: { city: 'Los Angeles', state: 'CA', country: 'USA' },
    foundedYear: 1997,
    description: 'Global alternative investment manager',
  },
  {
    name: 'Blue Owl Capital',
    ticker: 'OWL',
    cik: '0001823945',
    orgType: 'asset_manager',
    aum: 170_000_000_000,
    investmentFocus: ['Direct Lending', 'GP Stakes', 'Real Estate'],
    headquarters: { city: 'New York', state: 'NY', country: 'USA' },
    foundedYear: 2021,
    description: 'Alternative asset manager focused on direct lending',
  },
  {
    name: 'EQT Partners',
    ticker: 'EQT',
    orgType: 'pe_fund',
    aum: 230_000_000_000,
    investmentFocus: ['Private Equity', 'Infrastructure', 'Ventures'],
    headquarters: { city: 'Stockholm', country: 'Sweden' },
    foundedYear: 1994,
    description: 'Purpose-driven global investment organization',
  },
  {
    name: 'Thoma Bravo',
    orgType: 'pe_fund',
    aum: 140_000_000_000,
    investmentFocus: ['Software', 'Technology', 'Security'],
    headquarters: { city: 'San Francisco', state: 'CA', country: 'USA' },
    foundedYear: 1980,
    description: 'Leading software-focused private equity firm',
  },
  {
    name: 'Vista Equity Partners',
    orgType: 'pe_fund',
    aum: 100_000_000_000,
    investmentFocus: ['Enterprise Software', 'Technology'],
    headquarters: { city: 'Austin', state: 'TX', country: 'USA' },
    foundedYear: 2000,
    description: 'Enterprise software-focused private equity firm',
  },
  {
    name: 'Warburg Pincus',
    orgType: 'pe_fund',
    aum: 85_000_000_000,
    investmentFocus: ['Growth Equity', 'Financial Services', 'Healthcare', 'Technology'],
    headquarters: { city: 'New York', state: 'NY', country: 'USA' },
    foundedYear: 1966,
    description: 'Global growth investor',
  },
  {
    name: 'Advent International',
    orgType: 'pe_fund',
    aum: 90_000_000_000,
    investmentFocus: ['Buyouts', 'Business Services', 'Healthcare', 'Retail'],
    headquarters: { city: 'Boston', state: 'MA', country: 'USA' },
    foundedYear: 1984,
    description: 'One of the largest global private equity firms',
  },
  {
    name: 'Bain Capital',
    orgType: 'pe_fund',
    aum: 180_000_000_000,
    investmentFocus: ['Private Equity', 'Credit', 'Ventures', 'Real Estate'],
    headquarters: { city: 'Boston', state: 'MA', country: 'USA' },
    foundedYear: 1984,
    description: 'Leading global private investment firm',
  },
  {
    name: 'General Atlantic',
    orgType: 'pe_fund',
    aum: 85_000_000_000,
    investmentFocus: ['Growth Equity', 'Technology', 'Consumer', 'Healthcare'],
    headquarters: { city: 'New York', state: 'NY', country: 'USA' },
    foundedYear: 1980,
    description: 'Global growth equity firm',
  },
  {
    name: 'Hellman & Friedman',
    orgType: 'pe_fund',
    aum: 100_000_000_000,
    investmentFocus: ['Software', 'Financial Services', 'Healthcare', 'Industrials'],
    headquarters: { city: 'San Francisco', state: 'CA', country: 'USA' },
    foundedYear: 1984,
    description: 'Private equity firm focused on large buyouts',
  },
  {
    name: 'Silver Lake',
    orgType: 'pe_fund',
    aum: 100_000_000_000,
    investmentFocus: ['Technology', 'Tech-Enabled Industries'],
    headquarters: { city: 'Menlo Park', state: 'CA', country: 'USA' },
    foundedYear: 1999,
    description: 'Global technology investment firm',
  },
  {
    name: 'Providence Equity',
    orgType: 'pe_fund',
    aum: 45_000_000_000,
    investmentFocus: ['Media', 'Communications', 'Education', 'Information'],
    headquarters: { city: 'Providence', state: 'RI', country: 'USA' },
    foundedYear: 1989,
    description: 'Media and communications-focused private equity',
  },
  {
    name: 'Leonard Green',
    orgType: 'pe_fund',
    aum: 55_000_000_000,
    investmentFocus: ['Consumer', 'Retail', 'Business Services'],
    headquarters: { city: 'Los Angeles', state: 'CA', country: 'USA' },
    foundedYear: 1989,
    description: 'Consumer and retail-focused private equity',
  },
  {
    name: 'Clayton Dubilier & Rice',
    orgType: 'pe_fund',
    aum: 50_000_000_000,
    investmentFocus: ['Industrials', 'Healthcare', 'Services'],
    headquarters: { city: 'New York', state: 'NY', country: 'USA' },
    foundedYear: 1978,
    description: 'One of the oldest private equity firms',
  },
  {
    name: 'Brookfield Asset Management',
    ticker: 'BAM',
    cik: '0001001085',
    orgType: 'asset_manager',
    aum: 900_000_000_000,
    investmentFocus: ['Real Estate', 'Infrastructure', 'Renewable Power', 'Private Equity'],
    headquarters: { city: 'Toronto', state: 'ON', country: 'Canada' },
    foundedYear: 1899,
    description: 'Global alternative asset manager with real assets focus',
  },
];

async function seedTopPEFunds(): Promise<void> {
  console.log('Connecting to database...');
  await connectToDatabase();

  console.log('Ensuring indexes...');
  await ensureOrgSpiderIndexes();

  console.log(`\nSeeding ${topPEFunds.length} top PE funds...\n`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const fund of topPEFunds) {
    try {
      // Check if already exists
      const existing = await findOrganizationByName(fund.name);

      if (existing) {
        console.log(`  [SKIP] ${fund.name} already exists`);
        skipped++;
        continue;
      }

      // Get website from known URLs
      const knownWebsite = knownPEFundWebsites[fund.name]?.website;

      // Create the organization
      const org = await createOrganization({
        canonicalName: fund.name,
        aliases: generateAliases(fund.name, fund.ticker),
        ticker: fund.ticker,
        cik: fund.cik,
        orgType: fund.orgType,
        aum: fund.aum,
        investmentFocus: fund.investmentFocus,
        headquarters: fund.headquarters,
        website: knownWebsite,
        description: fund.description,
        foundedYear: fund.foundedYear,
      });

      console.log(`  [CREATE] ${fund.name}${fund.ticker ? ` (${fund.ticker})` : ''} - ID: ${org._id}`);
      created++;

    } catch (error: any) {
      console.error(`  [ERROR] ${fund.name}: ${error.message}`);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Total: ${topPEFunds.length}`);
}

function generateAliases(name: string, ticker?: string): string[] {
  const aliases: string[] = [];

  // Add ticker as alias
  if (ticker) {
    aliases.push(ticker);
  }

  // Add common variations
  if (name.includes(' ')) {
    // Acronym
    const acronym = name.split(' ').map(w => w[0]).join('').toUpperCase();
    if (acronym.length >= 2 && acronym.length <= 5) {
      aliases.push(acronym);
    }
  }

  // Handle specific known aliases
  const knownAliases: Record<string, string[]> = {
    'Clayton Dubilier & Rice': ['CD&R', 'CDR'],
    'Hellman & Friedman': ['H&F', 'HF'],
    'Apollo Global Management': ['Apollo', 'Apollo Management'],
    'Ares Management': ['Ares'],
    'Blue Owl Capital': ['Blue Owl', 'Owl Rock'],
    'Thoma Bravo': ['TB'],
    'Vista Equity Partners': ['Vista Equity', 'Vista'],
    'Warburg Pincus': ['WP'],
    'Advent International': ['Advent'],
    'Bain Capital': ['Bain'],
    'General Atlantic': ['GA'],
    'Leonard Green': ['LGP', 'Leonard Green & Partners'],
    'Providence Equity': ['Providence'],
    'EQT Partners': ['EQT'],
    'Brookfield Asset Management': ['Brookfield', 'BAM'],
  };

  if (knownAliases[name]) {
    aliases.push(...knownAliases[name]);
  }

  return [...new Set(aliases)];
}

// Run the script
seedTopPEFunds()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to seed:', error);
    process.exit(1);
  });
