import { describe, it, expect, beforeAll } from 'vitest';
import 'dotenv/config';

/**
 * Magic Link Authentication Flow Tests
 *
 * These tests verify the human login flow via magic link email.
 *
 * To run these tests:
 * 1. Start the dev server: npm run dev (or vercel dev)
 * 2. Run tests: npm test tests/magic-link.test.ts
 *
 * For actual email delivery tests, set:
 * - RESEND_API_KEY in .env
 * - TEST_MODE=false to send real emails
 */

const BASE_URL = process.env.API_BASE || 'http://localhost:3000';
const TEST_EMAIL = process.env.TEST_EMAIL || 'delivered@resend.dev';

describe('Magic Link Authentication Flow', () => {
  beforeAll(() => {
    // Ensure we have required env vars
    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not set - email sending will be skipped');
    }
    if (!process.env.MONGODB_URI && !process.env.MONGODB_CONNECTION_URI) {
      console.warn('MongoDB connection not set - tests may fail');
    }
  });

  describe('POST /api/auth/magic-link', () => {
    it('should reject requests without email', async () => {
      const res = await fetch(`${BASE_URL}/api/auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toBe('Email is required');
    });

    it('should reject invalid email format', async () => {
      const res = await fetch(`${BASE_URL}/api/auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      });

      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toBe('Invalid email format');
    });

    it('should send magic link for valid email', async () => {
      const res = await fetch(`${BASE_URL}/api/auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: TEST_EMAIL }),
      });

      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);

      // In test mode, we get the token back for verification
      if (data._testToken) {
        expect(data._testToken).toMatch(/^[a-f0-9]{64}$/);
      }
    });

    it('should handle duplicate requests gracefully', async () => {
      // Send first request
      await fetch(`${BASE_URL}/api/auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: TEST_EMAIL }),
      });

      // Send second request - should invalidate first token
      const res = await fetch(`${BASE_URL}/api/auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: TEST_EMAIL }),
      });

      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('GET /api/auth/verify-magic-link', () => {
    it('should reject requests without token', async () => {
      const res = await fetch(`${BASE_URL}/api/auth/verify-magic-link`);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Token is required');
    });

    it('should reject invalid tokens', async () => {
      const res = await fetch(`${BASE_URL}/api/auth/verify-magic-link?token=invalid-token`);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Invalid or expired link');
    });

    it('should verify valid token and redirect to dashboard', async () => {
      // First, request a magic link in test mode
      const magicLinkRes = await fetch(`${BASE_URL}/api/auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: TEST_EMAIL }),
      });

      const magicLinkData = await magicLinkRes.json();

      // Only run this test if we got a test token back
      if (!magicLinkData._testToken) {
        console.log('Skipping token verification - not in test mode');
        return;
      }

      // Verify the token (don't follow redirects)
      const verifyRes = await fetch(
        `${BASE_URL}/api/auth/verify-magic-link?token=${magicLinkData._testToken}`,
        { redirect: 'manual' }
      );

      expect(verifyRes.status).toBe(302);
      expect(verifyRes.headers.get('location')).toContain('/dashboard.html');
      expect(verifyRes.headers.get('location')).toContain('session=');
    });

    it('should reject already-used tokens', async () => {
      // Request a magic link
      const magicLinkRes = await fetch(`${BASE_URL}/api/auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: TEST_EMAIL }),
      });

      const magicLinkData = await magicLinkRes.json();

      if (!magicLinkData._testToken) {
        console.log('Skipping token reuse test - not in test mode');
        return;
      }

      // Use the token once
      await fetch(
        `${BASE_URL}/api/auth/verify-magic-link?token=${magicLinkData._testToken}`,
        { redirect: 'manual' }
      );

      // Try to use it again
      const secondVerifyRes = await fetch(
        `${BASE_URL}/api/auth/verify-magic-link?token=${magicLinkData._testToken}`
      );

      expect(secondVerifyRes.status).toBe(400);
      const data = await secondVerifyRes.json();
      expect(data.error).toBe('This link has already been used');
    });
  });

  describe('Full E2E Magic Link Flow', () => {
    it('should complete full login flow with magic link', async () => {
      const testEmail = `test-${Date.now()}@resend.dev`;

      // Step 1: Request magic link
      const requestRes = await fetch(`${BASE_URL}/api/auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail }),
      });

      expect(requestRes.status).toBe(200);
      const requestData = await requestRes.json();
      expect(requestData.success).toBe(true);

      // Skip the rest if not in test mode
      if (!requestData._testToken) {
        console.log('Magic link email would be sent in production');
        return;
      }

      // Step 2: Click the magic link (verify token)
      const verifyRes = await fetch(
        `${BASE_URL}/api/auth/verify-magic-link?token=${requestData._testToken}`,
        { redirect: 'manual' }
      );

      expect(verifyRes.status).toBe(302);
      const redirectLocation = verifyRes.headers.get('location');
      expect(redirectLocation).toContain('/dashboard.html');

      // Step 3: Parse the session from redirect URL
      const sessionMatch = redirectLocation?.match(/session=([^&]+)/);
      expect(sessionMatch).toBeTruthy();

      if (sessionMatch) {
        const sessionData = JSON.parse(atob(sessionMatch[1]));
        expect(sessionData.email).toBe(testEmail.toLowerCase());
        expect(sessionData.loginAt).toBeDefined();
      }
    });
  });
});
