import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../lib/db';

interface MagicLinkToken {
  email: string;
  token: string;
  createdAt: Date;
  expiresAt: Date;
  used: boolean;
}

interface HumanUser {
  email: string;
  createdAt: Date;
  lastLoginAt: Date;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token is required' });
    }

    console.log('[VERIFY] Token received, prefix:', token.substring(0, 16));
    const { db } = await connectToDatabase();
    console.log('[VERIFY] Connected to database:', db.databaseName);
    const magicLinks = db.collection<MagicLinkToken>('magicLinks');

    // Debug: count all tokens
    const totalTokens = await magicLinks.countDocuments({});
    console.log('[VERIFY] Total tokens in collection:', totalTokens);

    // Find the token
    const magicLink = await magicLinks.findOne({ token });
    console.log('[VERIFY] Token lookup result:', magicLink ? 'FOUND' : 'NOT FOUND');

    if (!magicLink) {
      // Debug: list recent tokens
      const recentTokens = await magicLinks.find({}).sort({ createdAt: -1 }).limit(3).toArray();
      console.log('[VERIFY] Recent tokens:', recentTokens.map(t => ({
        prefix: t.token.substring(0, 16),
        email: t.email,
        created: t.createdAt
      })));
      return res.status(400).json({ error: 'Invalid or expired link' });
    }

    // Check if already used
    if (magicLink.used) {
      return res.status(400).json({ error: 'This link has already been used' });
    }

    // Check if expired
    if (new Date() > magicLink.expiresAt) {
      await magicLinks.deleteOne({ token });
      return res.status(400).json({ error: 'This link has expired' });
    }

    // Mark token as used
    await magicLinks.updateOne({ token }, { $set: { used: true } });

    // Create or update human user
    const humans = db.collection<HumanUser>('humans');
    const now = new Date();

    await humans.updateOne(
      { email: magicLink.email },
      {
        $set: { lastLoginAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );

    // Redirect to dashboard with session token
    // In a real app, you'd set a secure cookie here
    const baseUrl = process.env.APP_URL
      || process.env.NEXT_PUBLIC_APP_URL
      || 'https://bikinibottombets.casino';
    const dashboardUrl = `${baseUrl}/dashboard.html`;

    // Create a simple session token (in production, use JWT)
    const sessionData = Buffer.from(
      JSON.stringify({ email: magicLink.email, loginAt: now.toISOString() })
    ).toString('base64');

    // Redirect to dashboard with session data in URL
    // The frontend will store this in localStorage
    return res.redirect(302, `${dashboardUrl}?session=${sessionData}`);
  } catch (error: any) {
    console.error('Verify magic link error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
