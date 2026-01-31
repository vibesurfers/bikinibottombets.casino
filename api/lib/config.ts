// Environment configuration for Vercel
const MONGODB_URI = process.env.MONGODB_CONNECTION_URI ? process.env.MONGODB_CONNECTION_URI : (process.env.MONGODB_URI ? process.env.MONGODB_URI : '');
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY ? process.env.FIRECRAWL_API_KEY : '';
const REDUCTO_API_KEY = process.env.REDUCTO_API_KEY ? process.env.REDUCTO_API_KEY : '';
const RESEND_API_KEY = process.env.RESEND_API_KEY ? process.env.RESEND_API_KEY : '';

export const config = {
  MONGODB_URI,
  FIRECRAWL_API_KEY,
  REDUCTO_API_KEY,
  RESEND_API_KEY,
};

// Test mode uses stub data instead of real Moltbook API
export const isTestMode = process.env.TEST_MODE === 'true' || process.env.NODE_ENV === 'test';
