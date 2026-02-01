/**
 * SEC Investigation Script
 *
 * Comprehensive scan of SEC filings for:
 * - 10 major tech companies (AAPL, MSFT, NVDA, GOOGL, META, AMZN, TSLA, AMD, INTC, CRM)
 * - Major private equity groups (Blackstone, KKR, Apollo, Carlyle, TPG)
 * - Short squeeze opportunity detection
 */

import {
  lookupCIK,
  getCompanyInfo,
  getComprehensiveFilings,
  getRecentFilings,
  searchFilings,
  SECFiling,
  CompanyInfo,
} from '../api/lib/sec-edgar';

// ============= CONFIGURATION =============

const TECH_COMPANIES = [
  'AAPL',  // Apple
  'MSFT',  // Microsoft
  'NVDA',  // NVIDIA
  'GOOGL', // Alphabet
  'META',  // Meta Platforms
  'AMZN',  // Amazon
  'TSLA',  // Tesla
  'AMD',   // Advanced Micro Devices
  'INTC',  // Intel
  'CRM',   // Salesforce
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

// Stocks known for short squeeze potential (high short interest)
const SHORT_SQUEEZE_CANDIDATES = [
  'GME',   // GameStop
  'AMC',   // AMC Entertainment
  'BBBY', // Bed Bath & Beyond (if still active)
  'CVNA',  // Carvana
  'UPST',  // Upstart
  'RIVN',  // Rivian
  'LCID',  // Lucid
  'SOFI',  // SoFi
  'PLTR',  // Palantir
  'AFRM',  // Affirm
];

// ============= INVESTIGATION TYPES =============

interface CompanyFilingReport {
  ticker: string;
  company: CompanyInfo | null;
  latest10K: SECFiling | null;
  latest10Q: SECFiling | null;
  latestProxy: SECFiling | null;
  recent8Ks: SECFiling[];
  recentFilingCount: number;
  keyEvents: string[];
}

interface PEFilingReport {
  name: string;
  ticker: string;
  cik: string | null;
  company: CompanyInfo | null;
  latest13F: SECFiling | null;
  latest10K: SECFiling | null;
  recentFilings: SECFiling[];
  portfolioIndicators: string[];
}

interface ShortSqueezeReport {
  ticker: string;
  company: CompanyInfo | null;
  recentFilings: SECFiling[];
  recent8Ks: SECFiling[];
  insiderActivity: SECFiling[];
  squeezePotential: 'high' | 'medium' | 'low';
  indicators: string[];
}

// ============= INVESTIGATION FUNCTIONS =============

async function investigateTechCompany(ticker: string): Promise<CompanyFilingReport> {
  console.log(`\n🔍 Investigating ${ticker}...`);

  const filings = await getComprehensiveFilings(ticker);

  // Analyze 8-K events for key happenings
  const keyEvents: string[] = [];
  for (const eightK of filings.recent8Ks) {
    if (eightK.items) {
      // Map 8-K item codes to descriptions
      const itemDescriptions: Record<string, string> = {
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
        '5.04': 'Temporary Trading Suspension',
        '5.05': 'Amendments to Code of Ethics',
        '5.06': 'Change in Shell Company Status',
        '5.07': 'Shareholder Vote Results',
        '5.08': 'Shareholder Nominations',
        '7.01': 'Regulation FD Disclosure',
        '8.01': 'Other Events',
        '9.01': 'Exhibits',
      };

      for (const item of eightK.items) {
        const desc = itemDescriptions[item] || item;
        keyEvents.push(`${eightK.filingDate}: ${desc}`);
      }
    }
  }

  return {
    ticker,
    company: filings.company,
    latest10K: filings.latest10K,
    latest10Q: filings.latest10Q,
    latestProxy: filings.latestProxy,
    recent8Ks: filings.recent8Ks,
    recentFilingCount: filings.allRecentFilings.length,
    keyEvents: keyEvents.slice(0, 10),
  };
}

async function investigatePEGroup(pe: { name: string; ticker: string }): Promise<PEFilingReport> {
  console.log(`\n🏦 Investigating ${pe.name} (${pe.ticker})...`);

  const cik = await lookupCIK(pe.ticker);
  if (!cik) {
    return {
      name: pe.name,
      ticker: pe.ticker,
      cik: null,
      company: null,
      latest13F: null,
      latest10K: null,
      recentFilings: [],
      portfolioIndicators: [`Could not find CIK for ${pe.ticker}`],
    };
  }

  const company = await getCompanyInfo(cik);

  // Get 13F filings (institutional holdings reports)
  const all13Fs = await getRecentFilings(cik, ['13F-HR', '13F'], 5);
  const latest13F = all13Fs[0] || null;

  // Get 10-K for business overview
  const filings = await getComprehensiveFilings(pe.ticker);

  // Get all recent filings for activity analysis
  const recentFilings = await getRecentFilings(cik, undefined, 20);

  // Analyze portfolio indicators from filing patterns
  const portfolioIndicators: string[] = [];

  if (latest13F) {
    portfolioIndicators.push(`Latest 13F filed: ${latest13F.filingDate}`);
  }

  // Check for recent material events
  const recent8Ks = await getRecentFilings(cik, ['8-K'], 5);
  for (const eightK of recent8Ks) {
    if (eightK.items?.includes('2.01')) {
      portfolioIndicators.push(`ACQUISITION/DISPOSITION: ${eightK.filingDate}`);
    }
    if (eightK.items?.includes('1.01')) {
      portfolioIndicators.push(`MATERIAL AGREEMENT: ${eightK.filingDate}`);
    }
  }

  return {
    name: pe.name,
    ticker: pe.ticker,
    cik,
    company,
    latest13F,
    latest10K: filings.latest10K,
    recentFilings,
    portfolioIndicators,
  };
}

async function investigateShortSqueezeCandidate(ticker: string): Promise<ShortSqueezeReport> {
  console.log(`\n📊 Investigating short squeeze candidate: ${ticker}...`);

  const cik = await lookupCIK(ticker);
  if (!cik) {
    return {
      ticker,
      company: null,
      recentFilings: [],
      recent8Ks: [],
      insiderActivity: [],
      squeezePotential: 'low',
      indicators: [`Could not find CIK for ${ticker}`],
    };
  }

  const company = await getCompanyInfo(cik);
  const recentFilings = await getRecentFilings(cik, undefined, 20);
  const recent8Ks = await getRecentFilings(cik, ['8-K'], 10);

  // Look for Form 4 (insider transactions) and 13G/13D (large holder reports)
  const insiderActivity = await getRecentFilings(cik, ['4', '4/A', '13D', '13D/A', '13G', '13G/A'], 10);

  // Analyze squeeze potential indicators
  const indicators: string[] = [];
  let squeezePotential: 'high' | 'medium' | 'low' = 'low';
  let score = 0;

  // Check for recent insider buying (bullish signal)
  if (insiderActivity.length > 3) {
    indicators.push(`HIGH INSIDER ACTIVITY: ${insiderActivity.length} recent filings`);
    score += 2;
  }

  // Check for 13D filings (activist investors taking large positions)
  const activistFilings = insiderActivity.filter(f => f.form.includes('13D'));
  if (activistFilings.length > 0) {
    indicators.push(`ACTIVIST INVESTOR: ${activistFilings.length} 13D filings`);
    score += 3;
  }

  // Check for recent material events
  for (const eightK of recent8Ks) {
    if (eightK.items?.includes('2.02')) {
      indicators.push(`EARNINGS RELEASED: ${eightK.filingDate}`);
      score += 1;
    }
    if (eightK.items?.includes('5.02')) {
      indicators.push(`EXECUTIVE CHANGES: ${eightK.filingDate}`);
      score += 1;
    }
    if (eightK.items?.includes('1.01')) {
      indicators.push(`NEW AGREEMENT: ${eightK.filingDate}`);
      score += 2;
    }
  }

  // Check filing frequency (high activity = something brewing)
  if (recentFilings.length > 15) {
    indicators.push(`HIGH FILING ACTIVITY: ${recentFilings.length} filings`);
    score += 1;
  }

  // Determine potential
  if (score >= 5) squeezePotential = 'high';
  else if (score >= 3) squeezePotential = 'medium';

  return {
    ticker,
    company,
    recentFilings,
    recent8Ks,
    insiderActivity,
    squeezePotential,
    indicators,
  };
}

// ============= REPORT GENERATION =============

function generateTechCompanyReport(reports: CompanyFilingReport[]): string {
  let md = `# Tech Companies SEC Filing Analysis\n\n`;
  md += `*Generated: ${new Date().toISOString()}*\n\n`;
  md += `---\n\n`;

  for (const report of reports) {
    md += `## ${report.ticker} - ${report.company?.name || 'Unknown'}\n\n`;

    if (report.company) {
      md += `| Attribute | Value |\n|-----------|-------|\n`;
      md += `| Exchange | ${report.company.exchange || 'N/A'} |\n`;
      md += `| SIC | ${report.company.sic} - ${report.company.sicDescription || ''} |\n`;
      md += `| State | ${report.company.stateOfIncorporation || 'N/A'} |\n`;
      md += `| Fiscal Year End | ${report.company.fiscalYearEnd || 'N/A'} |\n\n`;
    }

    md += `### Filing Coverage\n\n`;
    md += `| Filing | Date | Link |\n|--------|------|------|\n`;

    if (report.latest10K) {
      md += `| 10-K (Annual) | ${report.latest10K.filingDate} | [View](${report.latest10K.documentUrl}) |\n`;
    }
    if (report.latest10Q) {
      md += `| 10-Q (Quarterly) | ${report.latest10Q.filingDate} | [View](${report.latest10Q.documentUrl}) |\n`;
    }
    if (report.latestProxy) {
      md += `| DEF 14A (Proxy) | ${report.latestProxy.filingDate} | [View](${report.latestProxy.documentUrl}) |\n`;
    }

    md += `\n**Total Recent Filings:** ${report.recentFilingCount}\n\n`;

    if (report.keyEvents.length > 0) {
      md += `### Key Events (8-K Filings)\n\n`;
      for (const event of report.keyEvents) {
        md += `- ${event}\n`;
      }
      md += `\n`;
    }

    md += `---\n\n`;
  }

  return md;
}

function generatePEReport(reports: PEFilingReport[]): string {
  let md = `# Private Equity Groups SEC Filing Analysis\n\n`;
  md += `*Generated: ${new Date().toISOString()}*\n\n`;
  md += `---\n\n`;

  for (const report of reports) {
    md += `## ${report.name} (${report.ticker})\n\n`;

    if (!report.cik) {
      md += `⚠️ Could not locate in SEC EDGAR\n\n---\n\n`;
      continue;
    }

    md += `**CIK:** ${report.cik}\n\n`;

    if (report.company) {
      md += `| Attribute | Value |\n|-----------|-------|\n`;
      md += `| Exchange | ${report.company.exchange || 'N/A'} |\n`;
      md += `| SIC | ${report.company.sic} - ${report.company.sicDescription || ''} |\n\n`;
    }

    md += `### 13F Holdings Report (Institutional Portfolio)\n\n`;
    if (report.latest13F) {
      md += `- **Latest 13F:** ${report.latest13F.filingDate}\n`;
      md += `- **Document:** [View Holdings](${report.latest13F.documentUrl})\n\n`;
    } else {
      md += `*No 13F filings found (may file under different entity)*\n\n`;
    }

    if (report.portfolioIndicators.length > 0) {
      md += `### Activity Indicators\n\n`;
      for (const indicator of report.portfolioIndicators) {
        md += `- ${indicator}\n`;
      }
      md += `\n`;
    }

    md += `**Total Recent Filings:** ${report.recentFilings.length}\n\n`;
    md += `---\n\n`;
  }

  return md;
}

function generateShortSqueezeReport(reports: ShortSqueezeReport[]): string {
  let md = `# Short Squeeze Opportunity Analysis\n\n`;
  md += `*Generated: ${new Date().toISOString()}*\n\n`;
  md += `⚠️ **DISCLAIMER:** This is based on SEC filing activity only. Short interest data requires additional data sources.\n\n`;
  md += `---\n\n`;

  // Sort by squeeze potential
  const sorted = [...reports].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.squeezePotential] - order[b.squeezePotential];
  });

  // Summary table
  md += `## Summary\n\n`;
  md += `| Ticker | Company | Potential | Insider Filings | 8-K Events |\n`;
  md += `|--------|---------|-----------|-----------------|------------|\n`;

  for (const report of sorted) {
    const emoji = report.squeezePotential === 'high' ? '🔥' : report.squeezePotential === 'medium' ? '⚡' : '•';
    md += `| ${emoji} ${report.ticker} | ${report.company?.name || 'Unknown'} | ${report.squeezePotential.toUpperCase()} | ${report.insiderActivity.length} | ${report.recent8Ks.length} |\n`;
  }

  md += `\n---\n\n`;

  // Detailed reports for high/medium potential
  md += `## Detailed Analysis\n\n`;

  for (const report of sorted.filter(r => r.squeezePotential !== 'low')) {
    const emoji = report.squeezePotential === 'high' ? '🔥' : '⚡';
    md += `### ${emoji} ${report.ticker} - ${report.company?.name || 'Unknown'}\n\n`;
    md += `**Squeeze Potential:** ${report.squeezePotential.toUpperCase()}\n\n`;

    if (report.indicators.length > 0) {
      md += `**Indicators:**\n`;
      for (const indicator of report.indicators) {
        md += `- ${indicator}\n`;
      }
      md += `\n`;
    }

    if (report.insiderActivity.length > 0) {
      md += `**Recent Insider/Large Holder Filings:**\n`;
      for (const filing of report.insiderActivity.slice(0, 5)) {
        md += `- ${filing.filingDate}: ${filing.form} - [View](${filing.documentUrl})\n`;
      }
      md += `\n`;
    }

    md += `---\n\n`;
  }

  return md;
}

// ============= MAIN EXECUTION =============

async function runFullInvestigation() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('           SEC FILING INVESTIGATION - FULL SCAN');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const results = {
    techCompanies: [] as CompanyFilingReport[],
    privateEquity: [] as PEFilingReport[],
    shortSqueeze: [] as ShortSqueezeReport[],
  };

  // === PHASE 1: Tech Companies ===
  console.log('\n📱 PHASE 1: Investigating Tech Companies...\n');
  console.log('─'.repeat(50));

  for (const ticker of TECH_COMPANIES) {
    try {
      const report = await investigateTechCompany(ticker);
      results.techCompanies.push(report);
      console.log(`  ✅ ${ticker}: ${report.recentFilingCount} filings, ${report.keyEvents.length} events`);
    } catch (error: any) {
      console.error(`  ❌ ${ticker}: ${error.message}`);
    }
  }

  // === PHASE 2: Private Equity ===
  console.log('\n🏦 PHASE 2: Investigating Private Equity Groups...\n');
  console.log('─'.repeat(50));

  for (const pe of PRIVATE_EQUITY_GROUPS) {
    try {
      const report = await investigatePEGroup(pe);
      results.privateEquity.push(report);
      console.log(`  ✅ ${pe.ticker}: ${report.recentFilings.length} filings, ${report.portfolioIndicators.length} indicators`);
    } catch (error: any) {
      console.error(`  ❌ ${pe.ticker}: ${error.message}`);
    }
  }

  // === PHASE 3: Short Squeeze Candidates ===
  console.log('\n📊 PHASE 3: Investigating Short Squeeze Candidates...\n');
  console.log('─'.repeat(50));

  for (const ticker of SHORT_SQUEEZE_CANDIDATES) {
    try {
      const report = await investigateShortSqueezeCandidate(ticker);
      results.shortSqueeze.push(report);
      const emoji = report.squeezePotential === 'high' ? '🔥' : report.squeezePotential === 'medium' ? '⚡' : '•';
      console.log(`  ${emoji} ${ticker}: ${report.squeezePotential.toUpperCase()} potential, ${report.indicators.length} indicators`);
    } catch (error: any) {
      console.error(`  ❌ ${ticker}: ${error.message}`);
    }
  }

  // === GENERATE REPORTS ===
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('                    INVESTIGATION COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const techReport = generateTechCompanyReport(results.techCompanies);
  const peReport = generatePEReport(results.privateEquity);
  const squeezeReport = generateShortSqueezeReport(results.shortSqueeze);

  // Output summary
  console.log('\n📊 SUMMARY\n');
  console.log(`Tech Companies Analyzed: ${results.techCompanies.length}`);
  console.log(`  - Total Filings Tracked: ${results.techCompanies.reduce((sum, r) => sum + r.recentFilingCount, 0)}`);
  console.log(`  - Total Key Events: ${results.techCompanies.reduce((sum, r) => sum + r.keyEvents.length, 0)}`);

  console.log(`\nPrivate Equity Groups Analyzed: ${results.privateEquity.length}`);
  console.log(`  - Total Filings Tracked: ${results.privateEquity.reduce((sum, r) => sum + r.recentFilings.length, 0)}`);
  console.log(`  - Groups with 13F Data: ${results.privateEquity.filter(r => r.latest13F).length}`);

  console.log(`\nShort Squeeze Candidates Analyzed: ${results.shortSqueeze.length}`);
  console.log(`  - HIGH Potential: ${results.shortSqueeze.filter(r => r.squeezePotential === 'high').length}`);
  console.log(`  - MEDIUM Potential: ${results.shortSqueeze.filter(r => r.squeezePotential === 'medium').length}`);
  console.log(`  - LOW Potential: ${results.shortSqueeze.filter(r => r.squeezePotential === 'low').length}`);

  return {
    results,
    reports: {
      techReport,
      peReport,
      squeezeReport,
    },
  };
}

// Export for use as module
export {
  runFullInvestigation,
  investigateTechCompany,
  investigatePEGroup,
  investigateShortSqueezeCandidate,
  TECH_COMPANIES,
  PRIVATE_EQUITY_GROUPS,
  SHORT_SQUEEZE_CANDIDATES,
};

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  import('fs').then(async (fs) => {
    import('path').then(async (path) => {
      const { reports, results } = await runFullInvestigation();

      // Save reports to files
      const reportsDir = path.join(process.cwd(), 'scripts', 'reports');
      fs.mkdirSync(reportsDir, { recursive: true });

      const timestamp = new Date().toISOString().split('T')[0];

      fs.writeFileSync(
        path.join(reportsDir, `tech-companies-${timestamp}.md`),
        reports.techReport
      );
      console.log(`\n✅ Saved: scripts/reports/tech-companies-${timestamp}.md`);

      fs.writeFileSync(
        path.join(reportsDir, `private-equity-${timestamp}.md`),
        reports.peReport
      );
      console.log(`✅ Saved: scripts/reports/private-equity-${timestamp}.md`);

      fs.writeFileSync(
        path.join(reportsDir, `short-squeeze-${timestamp}.md`),
        reports.squeezeReport
      );
      console.log(`✅ Saved: scripts/reports/short-squeeze-${timestamp}.md`);

      // Save raw JSON data for further analysis
      fs.writeFileSync(
        path.join(reportsDir, `investigation-data-${timestamp}.json`),
        JSON.stringify(results, null, 2)
      );
      console.log(`✅ Saved: scripts/reports/investigation-data-${timestamp}.json`);

      console.log('\n' + '═'.repeat(70));
      console.log('All reports saved to scripts/reports/');
      console.log('═'.repeat(70) + '\n');
    });
  }).catch(console.error);
}
