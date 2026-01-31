// Environment configuration for Vercel
// Use getters for lazy evaluation (allows dotenv to load first)
export const config = {
  get MONGODB_URI() {
    return process.env.MONGODB_CONNECTION_URI || process.env.MONGODB_URI || '';
  },
  get FIRECRAWL_API_KEY() {
    return process.env.FIRECRAWL_API_KEY || '';
  },
  get REDUCTO_API_KEY() {
    return process.env.REDUCTO_API_KEY || '';
  },
  get RESEND_API_KEY() {
    return process.env.RESEND_API_KEY || '';
  },
};

// Test mode uses stub data instead of real Moltbook API
export const isTestMode = () => process.env.TEST_MODE === 'true' || process.env.NODE_ENV === 'test';
