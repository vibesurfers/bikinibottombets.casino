import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('3000'),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/active-investor'),
  // External service keys - optional for testing with stubs
  FIRECRAWL_API_KEY: z.string().optional(),
  REDUCTO_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  MOLTBOOK_APP_KEY: z.string().optional(),
  // Test mode - uses stubs instead of real APIs
  TEST_MODE: z.string().default('false'),
});

export const config = envSchema.parse(process.env);

export const isTestMode = config.TEST_MODE === 'true' || !config.MOLTBOOK_APP_KEY;
