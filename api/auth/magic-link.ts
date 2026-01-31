import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { randomBytes } from 'crypto';
import { connectToDatabase } from '../lib/db';
import { config, isTestMode } from '../lib/config';

interface MagicLinkToken {
  email: string;
  token: string;
  createdAt: Date;
  expiresAt: Date;
  used: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Generate secure token
    const token = randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes

    // Store token in database
    console.log('[MAGIC-LINK] Connecting to database...');
    const { db } = await connectToDatabase();
    console.log('[MAGIC-LINK] Connected to database:', db.databaseName);
    const magicLinks = db.collection<MagicLinkToken>('magicLinks');

    // Delete any existing tokens for this email
    const deleteResult = await magicLinks.deleteMany({ email: email.toLowerCase() });
    console.log('[MAGIC-LINK] Deleted existing tokens:', deleteResult.deletedCount);

    // Insert new token
    const insertResult = await magicLinks.insertOne({
      email: email.toLowerCase(),
      token,
      createdAt: now,
      expiresAt,
      used: false,
    });
    console.log('[MAGIC-LINK] Inserted token, id:', insertResult.insertedId, 'token prefix:', token.substring(0, 16));

    // Create magic link URL - use production domain
    const baseUrl = process.env.APP_URL
      || process.env.NEXT_PUBLIC_APP_URL
      || 'https://bikinibottombets.casino';
    const magicLinkUrl = `${baseUrl}/api/auth/verify-magic-link?token=${token}`;

    // Send email
    if (isTestMode()) {
      console.log(`[TEST MODE] Magic link for ${email}: ${magicLinkUrl}`);
      return res.json({
        success: true,
        message: 'Magic link sent (test mode)',
        // Only include in test mode for e2e testing
        _testToken: token,
      });
    }

    if (!config.RESEND_API_KEY) {
      return res.status(500).json({ error: 'Email service not configured' });
    }

    const resend = new Resend(config.RESEND_API_KEY);

    const { error: sendError } = await resend.emails.send({
      from: 'Bikini Bottom Bets <onboarding@resend.dev>',
      to: email,
      subject: 'Your Magic Link to Bikini Bottom Bets',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #0d0d0d; font-size: 24px; margin-bottom: 20px;">Welcome to Bikini Bottom Bets</h1>
          <p style="color: #333; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
            Click the button below to sign in to your account. This link will expire in 15 minutes.
          </p>
          <a href="${magicLinkUrl}" style="display: inline-block; background-color: #00d26a; color: #0d0d0d; font-weight: bold; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 16px;">
            Sign In to Bikini Bottom Bets
          </a>
          <p style="color: #666; font-size: 14px; margin-top: 30px; line-height: 1.5;">
            If you didn't request this email, you can safely ignore it.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="color: #999; font-size: 12px;">
            Bikini Bottom Bets - Where the Swarm Invests Together
          </p>
        </div>
      `,
    });

    if (sendError) {
      console.error('Resend error:', sendError);
      return res.status(500).json({ error: 'Failed to send email' });
    }

    return res.json({
      success: true,
      message: 'Magic link sent! Check your inbox.',
    });
  } catch (error: any) {
    console.error('Magic link error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
