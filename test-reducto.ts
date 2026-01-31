// Test script for Reducto document parsing API

const API_KEY = "d361d66172987e160fdf6dc42d55664e516e46a32756b994b3e52d08533dd3b8dc7127f85adc8b5cfe537ae35e7932c1";
const API_ENDPOINT = "https://platform.reducto.ai/parse";
// Using Mozilla's sample PDF (reliable, simple, public)
const TEST_PDF_URL = "https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/basicapi.pdf";

async function testReductoAPI() {
  console.log("Testing Reducto Document Parsing API...");
  console.log(`PDF URL: ${TEST_PDF_URL}`);
  console.log(`Endpoint: ${API_ENDPOINT}`);
  console.log("---");

  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        document_url: TEST_PDF_URL,
        options: {
          table_output_format: "md",
          add_page_markers: true,
        },
      }),
    });

    console.log(`Response Status: ${response.status} ${response.statusText}`);
    console.log("---");

    const data = await response.json();

    if (response.ok) {
      console.log("SUCCESS! API call completed successfully.");
      console.log("\nResponse data:");
      console.log(JSON.stringify(data, null, 2));

      // Highlight key fields if present
      if (data.job_id) {
        console.log(`\nJob ID: ${data.job_id}`);
      }
      if (data.result?.chunks) {
        console.log(`\nNumber of chunks: ${data.result.chunks.length}`);
        if (data.result.chunks.length > 0) {
          console.log("\nFirst chunk preview:");
          console.log(data.result.chunks[0].content?.substring(0, 500) || data.result.chunks[0]);
        }
      }
    } else {
      console.log("FAILED! API returned an error.");
      console.log("\nError response:");
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.log("FAILED! Request threw an exception.");
    console.error("Error:", error);
  }
}

testReductoAPI();
