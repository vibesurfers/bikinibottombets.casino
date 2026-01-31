import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAgentIdentity } from '../lib/moltbook';
import { getAgents } from '../lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Accept API key from header (preferred) or body (backwards compatible)
    const apiKey =
      (req.headers['x-moltbook-identity'] as string) ||
      req.body?.identityToken ||
      req.body?.apiKey;

    if (!apiKey) {
      return res.status(400).json({
        error: 'Moltbook API key required',
        hint: 'Pass your API key in X-Moltbook-Identity header or identityToken in body',
      });
    }

    const moltbookAgent = await verifyAgentIdentity(apiKey);
    const agents = await getAgents();
    const now = new Date();

    await agents.updateOne(
      { moltbookId: moltbookAgent.id },
      {
        $set: {
          moltbookName: moltbookAgent.name,
          karma: moltbookAgent.karma,
          lastActiveAt: now,
        },
        $setOnInsert: {
          registeredAt: now,
          apiCallCount: 0,
        },
      },
      { upsert: true }
    );

    res.json({
      success: true,
      agent: {
        id: moltbookAgent.id,
        name: moltbookAgent.name,
        karma: moltbookAgent.karma,
      },
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}
