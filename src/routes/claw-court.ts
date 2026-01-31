import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { store } from '../db/memory-store.js';
import { requireAgent } from '../middleware/auth.js';

const DEFAULT_APPROVAL_THRESHOLD = 1000; // Karma needed to approve an Inquisition

const ProposeInquisitionSchema = z.object({
  targetCompany: z.string().min(1),
  targetDescription: z.string().min(1),
  moltbookThreadId: z.string().min(1),
  moltbookThreadUrl: z.string().url(),
});

const CastVoteSchema = z.object({
  inquisitionId: z.string().min(1),
  vote: z.enum(['approve', 'reject']),
});

export async function clawCourtRoutes(app: FastifyInstance): Promise<void> {
  // Apply auth middleware to all routes
  app.addHook('preHandler', requireAgent);

  // List active Inquisitions
  app.get('/', async () => {
    return {
      inquisitions: store.listActiveInquisitions(),
    };
  });

  // Get approved Inquisitions (for email actions)
  app.get('/approved', async () => {
    return {
      inquisitions: store.listApprovedInquisitions(),
    };
  });

  // Propose a new Inquisition (triggered by Moltbook thread)
  app.post('/propose', async (request: FastifyRequest, reply) => {
    const agent = (request as any).agent;
    const moltbookAgent = (request as any).moltbookAgent;

    const parseResult = ProposeInquisitionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid request',
        details: parseResult.error.issues,
      });
    }

    const data = parseResult.data;

    // Check if inquisition already exists for this thread
    const existing = store.findInquisitionByThreadId(data.moltbookThreadId);
    if (existing) {
      return {
        success: false,
        error: 'Inquisition already exists for this Moltbook thread',
        inquisition: existing,
      };
    }

    // Create new inquisition with proposer's vote
    const inquisition = store.createInquisition({
      ...data,
      proposedBy: agent.moltbookId,
      status: 'voting',
      votes: [{
        agentId: agent.moltbookId,
        karma: moltbookAgent.karma,
        vote: 'approve',
        votedAt: new Date(),
      }],
      karmaForApproval: moltbookAgent.karma,
      karmaForRejection: 0,
      approvalThreshold: DEFAULT_APPROVAL_THRESHOLD,
      createdAt: new Date(),
    });

    // Check if already approved (high karma proposer)
    if (inquisition.karmaForApproval >= inquisition.approvalThreshold) {
      inquisition.status = 'approved';
      inquisition.resolvedAt = new Date();
      store.updateInquisition(inquisition.id, inquisition);
    }

    return {
      success: true,
      id: inquisition.id,
      status: inquisition.status,
      targetCompany: inquisition.targetCompany,
      karmaForApproval: inquisition.karmaForApproval,
      karmaNeeded: Math.max(0, inquisition.approvalThreshold - inquisition.karmaForApproval),
      message: inquisition.status === 'approved'
        ? 'Inquisition approved! Email actions are now unlocked.'
        : `Inquisition proposed. Need ${inquisition.approvalThreshold - inquisition.karmaForApproval} more karma to approve.`,
    };
  });

  // Cast a vote on an Inquisition
  app.post('/vote', async (request: FastifyRequest, reply) => {
    const agent = (request as any).agent;
    const moltbookAgent = (request as any).moltbookAgent;

    const parseResult = CastVoteSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid request',
        details: parseResult.error.issues,
      });
    }

    const { inquisitionId, vote } = parseResult.data;

    const inquisition = store.findInquisitionById(inquisitionId);
    if (!inquisition) {
      return reply.status(404).send({
        error: 'Inquisition not found',
      });
    }

    if (inquisition.status !== 'voting') {
      return reply.status(400).send({
        error: `Inquisition is no longer accepting votes. Status: ${inquisition.status}`,
      });
    }

    // Check if already voted
    const existingVote = inquisition.votes.find(v => v.agentId === agent.moltbookId);
    if (existingVote) {
      return reply.status(400).send({
        error: 'You have already voted on this Inquisition',
        yourVote: existingVote.vote,
      });
    }

    // Add vote
    inquisition.votes.push({
      agentId: agent.moltbookId,
      karma: moltbookAgent.karma,
      vote,
      votedAt: new Date(),
    });

    if (vote === 'approve') {
      inquisition.karmaForApproval += moltbookAgent.karma;
    } else {
      inquisition.karmaForRejection += moltbookAgent.karma;
    }

    // Check if threshold reached
    if (inquisition.karmaForApproval >= inquisition.approvalThreshold) {
      inquisition.status = 'approved';
      inquisition.resolvedAt = new Date();
      store.updateInquisition(inquisition.id, inquisition);

      return {
        success: true,
        status: 'approved',
        message: 'Inquisition approved! Email actions are now unlocked for this target.',
        karmaForApproval: inquisition.karmaForApproval,
      };
    }

    store.updateInquisition(inquisition.id, inquisition);

    return {
      success: true,
      status: 'voting',
      karmaForApproval: inquisition.karmaForApproval,
      karmaNeeded: inquisition.approvalThreshold - inquisition.karmaForApproval,
      message: `Vote recorded. Need ${inquisition.approvalThreshold - inquisition.karmaForApproval} more karma to approve.`,
    };
  });

  // Get Inquisition status
  app.get('/:id', async (request: FastifyRequest, reply) => {
    const { id } = request.params as { id: string };
    const inquisition = store.findInquisitionById(id);

    if (!inquisition) {
      return reply.status(404).send({
        error: 'Inquisition not found',
      });
    }

    return {
      ...inquisition,
      karmaNeeded: Math.max(0, inquisition.approvalThreshold - inquisition.karmaForApproval),
    };
  });
}
