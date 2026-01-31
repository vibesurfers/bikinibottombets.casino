/**
 * API Format Verification Test
 * Tests all sponsor APIs to verify data formats match pitchdeck goals
 */

import FirecrawlApp from '@mendable/firecrawl-js';

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || 'fc-d7b8f22345844aaa8393505f928f1f36';
const REDUCTO_API_KEY = process.env.REDUCTO_API_KEY || 'd361d66172987e160fdf6dc42d55664e516e46a32756b994b3e52d08533dd3b8dc7127f85adc8b5cfe537ae35e7932c1';

interface TestResult {
  api: string;
  operation: string;
  success: boolean;
  format: Record<string, string>;
  sample: unknown;
  error?: string;
}

const results: TestResult[] = [];

// ============= FIRECRAWL TESTS =============

async function testFirecrawlScrape() {
  console.log('\n=== Testing Firecrawl scrapeUrl ===');
  const firecrawl = new FirecrawlApp({ apiKey: FIRECRAWL_API_KEY });

  try {
    // Test with a simple IR page format
    const result = await firecrawl.scrapeUrl('https://investor.apple.com', {
      formats: ['markdown', 'html'],
    });

    if (result.success) {
      const format = {
        markdown: typeof result.markdown,
        html: typeof result.html,
        metadata: typeof result.metadata,
        'metadata.title': typeof result.metadata?.title,
        'metadata.description': typeof result.metadata?.description,
      };

      results.push({
        api: 'Firecrawl',
        operation: 'scrapeUrl',
        success: true,
        format,
        sample: {
          markdownLength: result.markdown?.length || 0,
          hasHtml: !!result.html,
          title: result.metadata?.title,
        },
      });

      console.log('✅ scrapeUrl SUCCESS');
      console.log('   Format:', JSON.stringify(format, null, 2));
      console.log('   Sample:', { title: result.metadata?.title, markdownChars: result.markdown?.length });
    } else {
      throw new Error('Scrape returned success: false');
    }
  } catch (error: any) {
    results.push({
      api: 'Firecrawl',
      operation: 'scrapeUrl',
      success: false,
      format: {},
      sample: null,
      error: error.message,
    });
    console.log('❌ scrapeUrl FAILED:', error.message);
  }
}

async function testFirecrawlSearch() {
  console.log('\n=== Testing Firecrawl search ===');
  const firecrawl = new FirecrawlApp({ apiKey: FIRECRAWL_API_KEY });

  try {
    const result = await firecrawl.search('Apple investor relations SEC filings', { limit: 3 });

    if (result.success && result.data) {
      const firstResult = result.data[0];
      const format = {
        'data': 'array',
        'data[].url': typeof firstResult?.url,
        'data[].markdown': typeof firstResult?.markdown,
        'data[].metadata': typeof firstResult?.metadata,
      };

      results.push({
        api: 'Firecrawl',
        operation: 'search',
        success: true,
        format,
        sample: {
          resultCount: result.data.length,
          firstUrl: firstResult?.url,
          firstTitle: firstResult?.metadata?.title,
        },
      });

      console.log('✅ search SUCCESS');
      console.log('   Results:', result.data.length);
      console.log('   First URL:', firstResult?.url);
    } else {
      throw new Error('Search returned success: false');
    }
  } catch (error: any) {
    results.push({
      api: 'Firecrawl',
      operation: 'search',
      success: false,
      format: {},
      sample: null,
      error: error.message,
    });
    console.log('❌ search FAILED:', error.message);
  }
}

// ============= REDUCTO TESTS =============

async function testReductoParse() {
  console.log('\n=== Testing Reducto parseDocument ===');

  // Use a public SEC 10-K filing as test document
  const testPdfUrl = 'https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/aapl-20230930.htm';

  try {
    const response = await fetch('https://platform.reducto.ai/parse', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REDUCTO_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        document_url: testPdfUrl,
        options: {
          table_output_format: 'md',
          add_page_markers: true,
        },
      }),
    });

    const data = await response.json();

    if (response.ok) {
      // Handle async result (URL redirect)
      let result = data.result;
      if (result?.type === 'url') {
        console.log('   Fetching async result from URL...');
        result = await fetch(result.url).then(r => r.json());
      }

      const format = {
        'job_id': typeof data.job_id,
        'usage.num_pages': typeof data.usage?.num_pages,
        'result.chunks': Array.isArray(result?.chunks) ? 'array' : typeof result?.chunks,
        'result.chunks[].content': typeof result?.chunks?.[0]?.content,
      };

      results.push({
        api: 'Reducto',
        operation: 'parseDocument',
        success: true,
        format,
        sample: {
          jobId: data.job_id,
          numPages: data.usage?.num_pages,
          numChunks: result?.chunks?.length || 0,
          firstChunkPreview: result?.chunks?.[0]?.content?.substring(0, 200),
        },
      });

      console.log('✅ parseDocument SUCCESS');
      console.log('   Job ID:', data.job_id);
      console.log('   Pages:', data.usage?.num_pages);
      console.log('   Chunks:', result?.chunks?.length || 0);
    } else {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
    }
  } catch (error: any) {
    results.push({
      api: 'Reducto',
      operation: 'parseDocument',
      success: false,
      format: {},
      sample: null,
      error: error.message,
    });
    console.log('❌ parseDocument FAILED:', error.message);
  }
}

// ============= SUMMARY =============

function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('API FORMAT VERIFICATION SUMMARY');
  console.log('='.repeat(60));

  for (const result of results) {
    console.log(`\n${result.api} - ${result.operation}`);
    console.log(`  Status: ${result.success ? '✅ PASS' : '❌ FAIL'}`);
    if (result.success) {
      console.log('  Response Format:');
      for (const [key, type] of Object.entries(result.format)) {
        console.log(`    ${key}: ${type}`);
      }
    } else {
      console.log(`  Error: ${result.error}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('PITCHDECK ALIGNMENT CHECK');
  console.log('='.repeat(60));

  const firecrawlTests = results.filter(r => r.api === 'Firecrawl');
  const reductoTests = results.filter(r => r.api === 'Reducto');

  console.log('\nFirecrawl (IR pages, news, web search):');
  console.log(`  scrapeUrl: ${firecrawlTests.find(r => r.operation === 'scrapeUrl')?.success ? '✅' : '❌'}`);
  console.log(`  search: ${firecrawlTests.find(r => r.operation === 'search')?.success ? '✅' : '❌'}`);

  console.log('\nReducto (SEC 10-Ks, legal docs):');
  console.log(`  parseDocument: ${reductoTests.find(r => r.operation === 'parseDocument')?.success ? '✅' : '❌'}`);
  console.log(`  extractStructured: ⚠️ NOT IMPLEMENTED (pitchdeck mentions schemas)`);

  console.log('\nMongoDB (agents, findings, inquisitions, emailCampaigns):');
  console.log('  ⚠️ "findings" collection NOT IMPLEMENTED - need to add for research storage');

  console.log('\nResend (IR outreach, FOIA, SEC tips):');
  console.log('  IR outreach: ✅ (irOutreachTemplate exists)');
  console.log('  FOIA: ✅ (foiaRequestTemplate exists)');
  console.log('  SEC tips: ❌ NOT IMPLEMENTED');
  console.log('  Domain: ⚠️ Using test domain (onboarding@resend.dev)');
}

// ============= RUN TESTS =============

async function main() {
  console.log('API FORMAT VERIFICATION TEST');
  console.log('Verifying API data formats against pitchdeck goals\n');

  await testFirecrawlScrape();
  await testFirecrawlSearch();
  await testReductoParse();

  printSummary();
}

main().catch(console.error);
