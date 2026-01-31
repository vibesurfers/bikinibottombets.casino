/**
 * SEC EDGAR Integration
 *
 * Direct integration with SEC's EDGAR system for actual filing data.
 * No limitations. No excuses. Get the real data.
 */

export interface SECFiling {
  accessionNumber: string;
  filingDate: string;
  reportDate?: string;
  form: string;        // 10-K, 10-Q, 8-K, etc.
  fileNumber: string;
  filmNumber?: string;
  items?: string[];    // For 8-K: which items reported
  size: number;
  isXBRL: boolean;
  primaryDocument: string;
  primaryDocDescription: string;
  documentUrl: string; // Direct URL to the document
  filingIndexUrl: string;
}

export interface CompanyInfo {
  cik: string;
  name: string;
  ticker?: string;
  exchange?: string;
  sic?: string;
  sicDescription?: string;
  stateOfIncorporation?: string;
  fiscalYearEnd?: string;
}

const SEC_DATA = 'https://data.sec.gov';      // For submissions API
const SEC_WWW = 'https://www.sec.gov';        // For company tickers
const SEC_EFTS = 'https://efts.sec.gov/LATEST/search-index';
const USER_AGENT = 'ActiveInvestorBot research@bikinibottombets.casino';

// Rate limiting: SEC requires max 10 requests/second
let lastRequestTime = 0;
async function rateLimitedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < 100) { // 100ms = 10 req/sec
    await new Promise(resolve => setTimeout(resolve, 100 - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();

  return fetch(url, {
    ...options,
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
      ...options.headers,
    },
  });
}

/**
 * Look up CIK (Central Index Key) for a company by ticker
 */
export async function lookupCIK(ticker: string): Promise<string | null> {
  try {
    // SEC provides a JSON mapping of tickers to CIKs
    const response = await rateLimitedFetch(`${SEC_WWW}/files/company_tickers.json`);
    if (!response.ok) return null;

    const data = await response.json();
    const upperTicker = ticker.toUpperCase();

    // Data is { "0": { "cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc." }, ... }
    for (const key of Object.keys(data)) {
      if (data[key].ticker === upperTicker) {
        // Pad CIK to 10 digits
        return String(data[key].cik_str).padStart(10, '0');
      }
    }
    return null;
  } catch (error) {
    console.error('CIK lookup failed:', error);
    return null;
  }
}

/**
 * Get company information from SEC
 */
export async function getCompanyInfo(cik: string): Promise<CompanyInfo | null> {
  try {
    const paddedCik = cik.padStart(10, '0');
    const response = await rateLimitedFetch(
      `${SEC_DATA}/submissions/CIK${paddedCik}.json`
    );
    if (!response.ok) return null;

    const data = await response.json();

    return {
      cik: paddedCik,
      name: data.name,
      ticker: data.tickers?.[0],
      exchange: data.exchanges?.[0],
      sic: data.sic,
      sicDescription: data.sicDescription,
      stateOfIncorporation: data.stateOfIncorporation,
      fiscalYearEnd: data.fiscalYearEnd,
    };
  } catch (error) {
    console.error('Company info fetch failed:', error);
    return null;
  }
}

/**
 * Get recent filings for a company
 */
export async function getRecentFilings(
  cik: string,
  formTypes?: string[],
  limit = 20
): Promise<SECFiling[]> {
  try {
    const paddedCik = cik.padStart(10, '0');
    const response = await rateLimitedFetch(
      `${SEC_DATA}/submissions/CIK${paddedCik}.json`
    );
    if (!response.ok) return [];

    const data = await response.json();
    const recent = data.filings?.recent;
    if (!recent) return [];

    const filings: SECFiling[] = [];
    // Scan more filings when filtering by type (10-K might be buried)
    const scanLimit = formTypes?.length ? 100 : limit * 3;
    const count = Math.min(recent.accessionNumber?.length || 0, scanLimit);

    for (let i = 0; i < count && filings.length < limit; i++) {
      const form = recent.form[i];

      // Filter by form type if specified
      if (formTypes && formTypes.length > 0) {
        if (!formTypes.some(t => form.includes(t))) continue;
      }

      const accessionNumber = recent.accessionNumber[i];
      const accessionNumberNoDash = accessionNumber.replace(/-/g, '');
      const primaryDocument = recent.primaryDocument[i];
      // Use unpadded CIK for www.sec.gov document URLs (SEC requires this format)
      const unpadCik = parseInt(cik, 10).toString();

      filings.push({
        accessionNumber,
        filingDate: recent.filingDate[i],
        reportDate: recent.reportDate?.[i],
        form,
        fileNumber: recent.fileNumber?.[i] || '',
        filmNumber: recent.filmNumber?.[i],
        items: recent.items?.[i]?.split(',').filter(Boolean),
        size: recent.size?.[i] || 0,
        isXBRL: recent.isXBRL?.[i] === 1,
        primaryDocument,
        primaryDocDescription: recent.primaryDocDescription?.[i] || '',
        documentUrl: `${SEC_WWW}/Archives/edgar/data/${unpadCik}/${accessionNumberNoDash}/${primaryDocument}`,
        filingIndexUrl: `${SEC_WWW}/cgi-bin/browse-edgar?action=getcompany&CIK=${paddedCik}&type=${form}&dateb=&owner=include&count=40`,
      });
    }

    return filings;
  } catch (error) {
    console.error('Recent filings fetch failed:', error);
    return [];
  }
}

/**
 * Get the most recent 10-K filing
 */
export async function getLatest10K(cik: string): Promise<SECFiling | null> {
  const filings = await getRecentFilings(cik, ['10-K'], 1);
  return filings[0] || null;
}

/**
 * Get the most recent 10-Q filing
 */
export async function getLatest10Q(cik: string): Promise<SECFiling | null> {
  const filings = await getRecentFilings(cik, ['10-Q'], 1);
  return filings[0] || null;
}

/**
 * Get recent 8-K filings (material events)
 */
export async function getRecent8Ks(cik: string, limit = 5): Promise<SECFiling[]> {
  return getRecentFilings(cik, ['8-K'], limit);
}

/**
 * Get proxy statement (DEF 14A) - contains executive compensation
 */
export async function getLatestProxy(cik: string): Promise<SECFiling | null> {
  const filings = await getRecentFilings(cik, ['DEF 14A', 'DEFA14A'], 1);
  return filings[0] || null;
}

/**
 * Full-text search SEC filings
 */
export async function searchFilings(
  query: string,
  options: {
    forms?: string[];
    dateRange?: { start: string; end: string };
    limit?: number;
  } = {}
): Promise<Array<{
  cik: string;
  companyName: string;
  form: string;
  filingDate: string;
  documentUrl: string;
}>> {
  try {
    const params = new URLSearchParams({
      q: query,
      dateRange: 'custom',
      startdt: options.dateRange?.start || '2020-01-01',
      enddt: options.dateRange?.end || new Date().toISOString().split('T')[0],
    });

    if (options.forms) {
      params.set('forms', options.forms.join(','));
    }

    const response = await rateLimitedFetch(
      `https://efts.sec.gov/LATEST/search-index?${params}`,
      {
        headers: {
          'User-Agent': USER_AGENT,
        },
      }
    );

    if (!response.ok) {
      // Fall back to basic approach if full-text search fails
      return [];
    }

    const data = await response.json();
    const results: Array<{
      cik: string;
      companyName: string;
      form: string;
      filingDate: string;
      documentUrl: string;
    }> = [];

    const hits = data.hits?.hits || [];
    const limit = options.limit || 10;

    for (const hit of hits.slice(0, limit)) {
      const source = hit._source;
      results.push({
        cik: source.ciks?.[0] || '',
        companyName: source.display_names?.[0] || '',
        form: source.form || '',
        filingDate: source.file_date || '',
        documentUrl: `https://www.sec.gov/Archives/edgar/data/${source.ciks?.[0]}/${source.adsh?.replace(/-/g, '')}/${source.file_name}`,
      });
    }

    return results;
  } catch (error) {
    console.error('SEC search failed:', error);
    return [];
  }
}

/**
 * Get all filing URLs for comprehensive parsing
 */
export async function getFilingDocuments(
  cik: string,
  accessionNumber: string
): Promise<Array<{ name: string; url: string; type: string; size: number }>> {
  try {
    const paddedCik = cik.padStart(10, '0');
    const unpadCik = parseInt(cik, 10).toString();
    const accessionNoDash = accessionNumber.replace(/-/g, '');

    // index.json works with data.sec.gov and padded CIK
    const response = await rateLimitedFetch(
      `${SEC_DATA}/Archives/edgar/data/${paddedCik}/${accessionNoDash}/index.json`
    );
    if (!response.ok) return [];

    const data = await response.json();
    const documents: Array<{ name: string; url: string; type: string; size: number }> = [];

    for (const item of data.directory?.item || []) {
      if (item.type === 'file') {
        documents.push({
          name: item.name,
          // Document URLs use www.sec.gov with unpadded CIK
          url: `${SEC_WWW}/Archives/edgar/data/${unpadCik}/${accessionNoDash}/${item.name}`,
          type: item.name.split('.').pop() || '',
          size: item.size || 0,
        });
      }
    }

    return documents;
  } catch (error) {
    console.error('Filing documents fetch failed:', error);
    return [];
  }
}

/**
 * Comprehensive research: Get ALL relevant filings for a company
 */
export async function getComprehensiveFilings(ticker: string): Promise<{
  company: CompanyInfo | null;
  latest10K: SECFiling | null;
  latest10Q: SECFiling | null;
  latestProxy: SECFiling | null;
  recent8Ks: SECFiling[];
  allRecentFilings: SECFiling[];
}> {
  const cik = await lookupCIK(ticker);
  if (!cik) {
    return {
      company: null,
      latest10K: null,
      latest10Q: null,
      latestProxy: null,
      recent8Ks: [],
      allRecentFilings: [],
    };
  }

  // Fetch all in parallel for speed
  const [company, latest10K, latest10Q, latestProxy, recent8Ks, allRecentFilings] = await Promise.all([
    getCompanyInfo(cik),
    getLatest10K(cik),
    getLatest10Q(cik),
    getLatestProxy(cik),
    getRecent8Ks(cik, 5),
    getRecentFilings(cik, undefined, 20),
  ]);

  return {
    company,
    latest10K,
    latest10Q,
    latestProxy,
    recent8Ks,
    allRecentFilings,
  };
}
