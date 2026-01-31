import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { verifyAgentIdentity } from '../services/moltbook.js';
import { store } from '../db/memory-store.js';

const RegisterSchema = z.object({
  identityToken: z.string().min(1, 'Identity token is required'),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // Register a new agent with the platform
  app.post('/register', async (request: FastifyRequest, reply) => {
    const parseResult = RegisterSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid request',
        details: parseResult.error.issues,
      });
    }

    const { identityToken } = parseResult.data;

    try {
      // Verify identity with Moltbook
      const moltbookAgent = await verifyAgentIdentity(identityToken);

      // Check if already registered
      const existing = store.findAgentByMoltbookId(moltbookAgent.id);
      const now = new Date();

      if (existing) {
        // Update existing agent
        existing.moltbookName = moltbookAgent.name;
        existing.karma = moltbookAgent.karma;
        existing.lastActiveAt = now;
        store.upsertAgent(existing);
      } else {
        // Create new agent
        store.upsertAgent({
          moltbookId: moltbookAgent.id,
          moltbookName: moltbookAgent.name,
          karma: moltbookAgent.karma,
          registeredAt: now,
          lastActiveAt: now,
          apiCallCount: 0,
        });
      }

      return {
        success: true,
        agent: {
          id: moltbookAgent.id,
          name: moltbookAgent.name,
          karma: moltbookAgent.karma,
        },
        message: existing
          ? 'Welcome back to the collective!'
          : 'Welcome to the Active Investor collective! You are now registered.',
      };
    } catch (error) {
      return reply.status(401).send({
        error: 'Failed to verify Moltbook identity',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Verify agent is registered
  app.get('/verify', async (request: FastifyRequest, reply) => {
    const token = request.headers['x-moltbook-identity'] as string;

    if (!token) {
      return reply.status(401).send({
        error: 'Missing X-Moltbook-Identity header',
      });
    }

    try {
      const moltbookAgent = await verifyAgentIdentity(token);
      const agent = store.findAgentByMoltbookId(moltbookAgent.id);

      if (!agent) {
        return reply.status(403).send({
          valid: false,
          error: 'Agent not registered with Active Investor',
        });
      }

      return {
        valid: true,
        agent: {
          id: agent.moltbookId,
          name: agent.moltbookName,
          karma: agent.karma,
          registeredAt: agent.registeredAt,
          apiCallCount: agent.apiCallCount,
        },
      };
    } catch (error) {
      return reply.status(401).send({
        error: 'Invalid identity token',
      });
    }
  });
}
