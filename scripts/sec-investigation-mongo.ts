/**
 * SEC Investigation Script - MongoDB Integrated
 *
 * Stores findings in MongoDB so they appear in the UI dashboard.
 * Scans SEC filings for:
 * - 10 major tech companies
 * - Major private equity groups
 * - Short squeeze opportunity detection
 */

import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { connectToDatabase } from '../api/lib/db';
import {
  lookupCIK,
  getCompanyInfo,
  getComprehensiveFilings,
  getRecentFilings,
  SECFiling,
  CompanyInfo,
} from '../api/lib/sec-edgar';
import {
  Finding,
  FindingType,
  ResearchJob,
  calculateExpiresAt,
} from '../api/lib/research-types';

// ============= CONFIGURATION =============

const TECH_COMPANIES = [
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META',
  'AMZN', 'TSLA', 'AMD', 'INTC', 'CRM',
];

const PRIVATE_EQUITY_GROUPS = [
  { name: 'Blackstone Inc', ticker: 'BX' },
  { name: 'KKR & Co', ticker: 'KKR' },
  { name: 'Apollo Global Management', ticker: 'APO' },
  { name: 'Carlyle Group', ticker: 'CG' },
  { name: 'TPG Inc', ticker: 'TPG' },
  { name: 'Ares Management', ticker: 'ARES' },
  { name: 'Blue Owl Capital', ticker: 'OWL' },
];

const SHORT_SQUEEZE_CANDIDATES = [
  'GME', 'AMC', 'CVNA', 'UPST', 'RIVN',
  'LCID', 'SOFI', 'PLTR', 'AFRM', 'MARA',
];

// 8-K Item descriptions for human-readable events
const ITEM_DESCRIPTIONS: Record<string, string> = {
  '1.01': 'Material Definitive Agreement',
  '1.02': 'Termination of Material Agreement',
  '1.03': 'Bankruptcy or Receivership',
  '2.01': 'Acquisition/Disposition of Assets',
  '2.02': 'Results of Operations (Earnings)',
  '2.03': 'Obligation Triggering Events',
  '2.04': 'Triggering Events (Acceleration)',
  '2.05': 'Restructuring Charges',
  '2.06': 'Material Impairments',
  '3.01': 'Delisting Notice',
  '3.02': 'Unregistered Securities Sales',
  '3.03': 'Material Modification to Rights',
  '4.01': 'Auditor Changes',
  '4.02': 'Non-Reliance on Prior Financials',
  '5.01': 'Changes in Control',
  '5.02': 'Executive/Director Changes',
  '5.03': 'Bylaws Amendments',
  '5.07': 'Shareholder Vote Results',
  '7.01': 'Regulation FD Disclosure',
  '8.01': 'Other Events',
  '9.01': 'Exhibits',
};

// ============= DATABASE HELPERS =============

async function createResearchJob(
  ticker: string,
  company: string,
  investigationType: 'tech' | 'pe' | 'squeeze'
): Promise<ObjectId> {
  const { db } = await connectToDatabase();
  const jobs = db.collection<ResearchJob>('researchJobs');

  const job: Omit<ResearchJob, '_id'> = {
    query: {
      company,
      ticker,
      topic: `SEC Investigation: ${investigationType}`,
    },
    depth: 'deep',
    requestedBy: 'sec-investigation-bot',
    triggerType: 'bot_initiated',
    status: 'running',
    findingIds: [],
    cacheHit: false,
    createdAt: new Date(),
    startedAt: new Date(),
    apiCalls: { firecrawl: 0, reducto: 0 },
  };

  const result = await jobs.insertOne(job as any);
  return result.insertedId;
}

async function storeFinding(finding: Omit<Finding, '_id'>): Promise<ObjectId> {
  const { db } = await connectToDatabase();
  const findings = db.collection<Finding>('findings');

  // Upsert by sourceUrl to avoid duplicates
  const result = await findings.updateOne(
    { sourceUrl: finding.sourceUrl },
    { $set: finding },
    { upsert: true }
  );

  return result.upsertedId || (await findings.findOne({ sourceUrl: finding.sourceUrl }))?._id!;
}

async function completeResearchJob(jobId: ObjectId, findingIds: ObjectId[]): Promise<void> {
  const { db } = await connectToDatabase();
  const jobs = db.collection<ResearchJob>('researchJobs');

  await jobs.updateOne(
    { _id: jobId },
    {
      $set: {
        status: 'completed',
        completedAt: new Date(),
        findingIds,
      },
    }
  );
}

// ============= INVESTIGATION FUNCTIONS =============

async function investigateCompany(
  ticker: string,
  investigationType: 'tech' | 'pe' | 'squeeze'
): Promise<{ jobId: ObjectId; findingIds: ObjectId[]; summary: string }> {
  console.log(`\n🔍 Investigating ${ticker}...`);

  const filings = await getComprehensiveFilings(ticker);
  if (!filings.company) {
    console.log(`  ⚠️ Could not find company info for ${ticker}`);
    return { jobId: new ObjectId(), findingIds: [], summary: 'Not found' };
  }

  const jobId = await createResearchJob(ticker, filings.company.name, investigationType);
  const findingIds: ObjectId[] = [];

  // Store company info as a finding
  const companyFinding: Omit<Finding, '_id'> = {
    company: filings.company.name,
    ticker: ticker.toUpperCase(),
    findingType: 'document',
    source: 'manual',
    title: `${filings.company.name} (${ticker}) - Company Profile`,
    sourceUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${filings.company.cik}`,
    structuredData: {
      keyPoints: [
        `Exchange: ${filings.company.exchange || 'N/A'}`,
        `Industry: ${filings.company.sicDescription || filings.company.sic}`,
        `State: ${filings.company.stateOfIncorporation || 'N/A'}`,
        `Fiscal Year End: ${filings.company.fiscalYearEnd || 'N/A'}`,
      ],
    },
    rawContent: JSON.stringify(filings.company, null, 2),
    rawContentTruncated: false,
    createdAt: new Date(),
    expiresAt: calculateExpiresAt('document'),
    researchJobId: jobId,
    createdBy: 'sec-investigation-bot',
  };
  findingIds.push(await storeFinding(companyFinding));

  // Store 10-K filing
  if (filings.latest10K) {
    const finding: Omit<Finding, '_id'> = {
      company: filings.company.name,
      ticker: ticker.toUpperCase(),
      findingType: 'sec_filing',
      source: 'manual',
      title: `${ticker} Annual Report (10-K) - ${filings.latest10K.filingDate}`,
      sourceUrl: filings.latest10K.documentUrl,
      structuredData: {
        filingType: '10-K',
        filingDate: new Date(filings.latest10K.filingDate),
        keyPoints: [
          `Filed: ${filings.latest10K.filingDate}`,
          `Report Period: ${filings.latest10K.reportDate || 'N/A'}`,
          `XBRL: ${filings.latest10K.isXBRL ? 'Yes' : 'No'}`,
        ],
      },
      rawContent: `10-K Annual Report for ${filings.company.name}\nFiled: ${filings.latest10K.filingDate}\nDocument: ${filings.latest10K.documentUrl}`,
      rawContentTruncated: false,
      createdAt: new Date(),
      expiresAt: calculateExpiresAt('sec_filing'),
      researchJobId: jobId,
      createdBy: 'sec-investigation-bot',
    };
    findingIds.push(await storeFinding(finding));
  }

  // Store 10-Q filing
  if (filings.latest10Q) {
    const finding: Omit<Finding, '_id'> = {
      company: filings.company.name,
      ticker: ticker.toUpperCase(),
      findingType: 'sec_filing',
      source: 'manual',
      title: `${ticker} Quarterly Report (10-Q) - ${filings.latest10Q.filingDate}`,
      sourceUrl: filings.latest10Q.documentUrl,
      structuredData: {
        filingType: '10-Q',
        filingDate: new Date(filings.latest10Q.filingDate),
        keyPoints: [
          `Filed: ${filings.latest10Q.filingDate}`,
          `Report Period: ${filings.latest10Q.reportDate || 'N/A'}`,
        ],
      },
      rawContent: `10-Q Quarterly Report for ${filings.company.name}\nFiled: ${filings.latest10Q.filingDate}`,
      rawContentTruncated: false,
      createdAt: new Date(),
      expiresAt: calculateExpiresAt('sec_filing'),
      researchJobId: jobId,
      createdBy: 'sec-investigation-bot',
    };
    findingIds.push(await storeFinding(finding));
  }

  // Store proxy statement
  if (filings.latestProxy) {
    const finding: Omit<Finding, '_id'> = {
      company: filings.company.name,
      ticker: ticker.toUpperCase(),
      findingType: 'sec_filing',
      source: 'manual',
      title: `${ticker} Proxy Statement (DEF 14A) - ${filings.latestProxy.filingDate}`,
      sourceUrl: filings.latestProxy.documentUrl,
      structuredData: {
        filingType: 'DEF 14A',
        filingDate: new Date(filings.latestProxy.filingDate),
        keyPoints: [
          `Filed: ${filings.latestProxy.filingDate}`,
          'Contains: Executive compensation, Board nominations, Shareholder proposals',
        ],
      },
      rawContent: `Proxy Statement for ${filings.company.name}\nFiled: ${filings.latestProxy.filingDate}`,
      rawContentTruncated: false,
      createdAt: new Date(),
      expiresAt: calculateExpiresAt('sec_filing'),
      researchJobId: jobId,
      createdBy: 'sec-investigation-bot',
    };
    findingIds.push(await storeFinding(finding));
  }

  // Store 8-K filings (material events)
  for (const eightK of filings.recent8Ks) {
    const eventDescriptions = (eightK.items || [])
      .map(item => ITEM_DESCRIPTIONS[item] || item)
      .filter(Boolean);

    const finding: Omit<Finding, '_id'> = {
      company: filings.company.name,
      ticker: ticker.toUpperCase(),
      findingType: 'sec_filing',
      source: 'manual',
      title: `${ticker} Material Event (8-K) - ${eightK.filingDate}: ${eventDescriptions.slice(0, 2).join(', ') || 'Event'}`,
      sourceUrl: eightK.documentUrl,
      structuredData: {
        filingType: '8-K',
        filingDate: new Date(eightK.filingDate),
        keyPoints: eventDescriptions.length > 0
          ? eventDescriptions
          : [`Material event filed on ${eightK.filingDate}`],
      },
      rawContent: `8-K Material Event for ${filings.company.name}\nFiled: ${eightK.filingDate}\nItems: ${eventDescriptions.join(', ')}`,
      rawContentTruncated: false,
      createdAt: new Date(),
      expiresAt: calculateExpiresAt('sec_filing'),
      researchJobId: jobId,
      createdBy: 'sec-investigation-bot',
    };
    findingIds.push(await storeFinding(finding));
  }

  // For short squeeze candidates, also check insider activity
  if (investigationType === 'squeeze') {
    const cik = await lookupCIK(ticker);
    if (cik) {
      const insiderFilings = await getRecentFilings(cik, ['4', '4/A', '13D', '13D/A', '13G', '13G/A'], 5);

      for (const filing of insiderFilings) {
        const isActivist = filing.form.includes('13D');
        const finding: Omit<Finding, '_id'> = {
          company: filings.company.name,
          ticker: ticker.toUpperCase(),
          findingType: 'sec_filing',
          source: 'manual',
          title: `${ticker} ${isActivist ? '🔥 ACTIVIST' : 'Insider'} Filing (${filing.form}) - ${filing.filingDate}`,
          sourceUrl: filing.documentUrl,
          structuredData: {
            filingType: filing.form,
            filingDate: new Date(filing.filingDate),
            keyPoints: isActivist
              ? ['⚠️ ACTIVIST INVESTOR POSITION', `Form ${filing.form} indicates >5% ownership with intent to influence`]
              : [`Insider transaction filed ${filing.filingDate}`],
          },
          rawContent: `${filing.form} Filing for ${filings.company.name}\nFiled: ${filing.filingDate}\n${isActivist ? 'ACTIVIST INVESTOR POSITION DETECTED' : 'Insider transaction'}`,
          rawContentTruncated: false,
          createdAt: new Date(),
          expiresAt: calculateExpiresAt('sec_filing'),
          researchJobId: jobId,
          createdBy: 'sec-investigation-bot',
        };
        findingIds.push(await storeFinding(finding));
      }
    }
  }

  // For PE groups, check for 13F holdings
  if (investigationType === 'pe') {
    const cik = await lookupCIK(ticker);
    if (cik) {
      const thirteenFs = await getRecentFilings(cik, ['13F-HR', '13F'], 3);

      for (const filing of thirteenFs) {
        const finding: Omit<Finding, '_id'> = {
          company: filings.company.name,
          ticker: ticker.toUpperCase(),
          findingType: 'sec_filing',
          source: 'manual',
          title: `${ticker} Institutional Holdings (13F) - ${filing.filingDate}`,
          sourceUrl: filing.documentUrl,
          structuredData: {
            filingType: '13F-HR',
            filingDate: new Date(filing.filingDate),
            keyPoints: [
              `Institutional holdings report filed ${filing.filingDate}`,
              'Contains: Portfolio positions, share counts, values',
            ],
          },
          rawContent: `13F Institutional Holdings for ${filings.company.name}\nFiled: ${filing.filingDate}`,
          rawContentTruncated: false,
          createdAt: new Date(),
          expiresAt: calculateExpiresAt('sec_filing'),
          researchJobId: jobId,
          createdBy: 'sec-investigation-bot',
        };
        findingIds.push(await storeFinding(finding));
      }
    }
  }

  await completeResearchJob(jobId, findingIds);

  const summary = `${findingIds.length} findings stored`;
  console.log(`  ✅ ${ticker}: ${summary}`);

  return { jobId, findingIds, summary };
}

// ============= MAIN EXECUTION =============

async function runInvestigation() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('     SEC FILING INVESTIGATION - STORING TO MONGODB');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let totalFindings = 0;
  let totalJobs = 0;

  // === PHASE 1: Tech Companies ===
  console.log('\n📱 PHASE 1: Tech Companies\n' + '─'.repeat(50));
  for (const ticker of TECH_COMPANIES) {
    try {
      const result = await investigateCompany(ticker, 'tech');
      totalFindings += result.findingIds.length;
      totalJobs++;
    } catch (error: any) {
      console.error(`  ❌ ${ticker}: ${error.message}`);
    }
  }

  // === PHASE 2: Private Equity ===
  console.log('\n🏦 PHASE 2: Private Equity Groups\n' + '─'.repeat(50));
  for (const pe of PRIVATE_EQUITY_GROUPS) {
    try {
      const result = await investigateCompany(pe.ticker, 'pe');
      totalFindings += result.findingIds.length;
      totalJobs++;
    } catch (error: any) {
      console.error(`  ❌ ${pe.ticker}: ${error.message}`);
    }
  }

  // === PHASE 3: Short Squeeze Candidates ===
  console.log('\n📊 PHASE 3: Short Squeeze Candidates\n' + '─'.repeat(50));
  for (const ticker of SHORT_SQUEEZE_CANDIDATES) {
    try {
      const result = await investigateCompany(ticker, 'squeeze');
      totalFindings += result.findingIds.length;
      totalJobs++;
    } catch (error: any) {
      console.error(`  ❌ ${ticker}: ${error.message}`);
    }
  }

  console.log('\n' + '═'.repeat(63));
  console.log('                    INVESTIGATION COMPLETE');
  console.log('═'.repeat(63));
  console.log(`\n📊 SUMMARY`);
  console.log(`   Research Jobs Created: ${totalJobs}`);
  console.log(`   Total Findings Stored: ${totalFindings}`);
  console.log(`\n✅ All findings are now in MongoDB and visible in the UI!`);
  console.log(`   View at: /dashboard.html or /pipeline.html`);
}

// Run
runInvestigation()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Investigation failed:', err);
    process.exit(1);
  });
