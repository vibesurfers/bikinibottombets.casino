import FirecrawlApp from '@mendable/firecrawl-js';

const API_KEY = 'fc-d7b8f22345844aaa8393505f928f1f36';

async function testFirecrawl() {
  console.log('Testing Firecrawl API integration...\n');

  const firecrawl = new FirecrawlApp({ apiKey: API_KEY });

  try {
    console.log('Scraping https://example.com...\n');

    const result = await firecrawl.scrapeUrl('https://example.com', {
      formats: ['markdown'],
    });

    if (result.success) {
      console.log('SUCCESS! Firecrawl API call succeeded.\n');
      console.log('--- Markdown Content ---');
      console.log(result.markdown);
      console.log('--- End of Content ---\n');

      console.log('Metadata:');
      console.log('- Title:', result.metadata?.title);
      console.log('- Description:', result.metadata?.description);
      console.log('- Source URL:', result.metadata?.sourceURL);
    } else {
      console.log('FAILURE: API call did not succeed.');
      console.log('Error:', result);
    }
  } catch (error) {
    console.log('ERROR: Exception thrown during API call.');
    console.error(error);
  }
}

testFirecrawl();
