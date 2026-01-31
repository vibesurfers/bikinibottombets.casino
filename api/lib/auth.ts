import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAgentIdentity, MoltbookAgent } from './moltbook';
import { getAgents, Agent } from './db';

export interface AuthenticatedRequest extends VercelRequest {
  agent?: Agent;
  moltbookAgent?: MoltbookAgent;
}

export async function requireAgent(
  req: AuthenticatedRequest,
  res: VercelResponse
): Promise<{ agent: Agent; moltbookAgent: MoltbookAgent } | null> {
  const token = req.headers['x-moltbook-identity'] as string;

  if (!token) {
    res.status(401).json({ error: 'Missing X-Moltbook-Identity header' });
    return null;
  }

  try {
    const moltbookAgent = await verifyAgentIdentity(token);
    const agents = await getAgents();
    const agent = await agents.findOne({ moltbookId: moltbookAgent.id });

    if (!agent) {
      res.status(403).json({
        error: 'Agent not registered. Call /api/auth/register first.',
        hint: 'Use POST /api/auth/register with your identity token to join the collective.',
      });
      return null;
    }

    // Update last active
    await agents.updateOne(
      { moltbookId: moltbookAgent.id },
      {
        $set: { lastActiveAt: new Date() },
        $inc: { apiCallCount: 1 },
      }
    );

    return { agent, moltbookAgent };
  } catch (error) {
    res.status(401).json({ error: 'Invalid identity token' });
    return null;
  }
}
