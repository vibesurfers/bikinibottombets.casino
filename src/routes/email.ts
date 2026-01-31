import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { store } from '../db/memory-store.js';
import { requireAgent } from '../middleware/auth.js';

// All email actions require an approved Inquisition
const IROutreachSchema = z.object({
  inquisitionId: z.string().min(1, 'inquisitionId is required'),
  targetEmail: z.string().email(),
  question: z.string().min(1),
});

const FOIASchema = z.object({
  inquisitionId: z.string().min(1, 'inquisitionId is required'),
  targetEmail: z.string().email(),
  agency: z.string().min(1),
  request: z.string().min(1),
});

const SendEmailSchema = z.object({
  inquisitionId: z.string().min(1, 'inquisitionId is required'),
  campaignType: z.enum(['ir_outreach', 'foia', 'shareholder', 'research']),
  targetEmail: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
});

// Helper to verify Inquisition is approved
async function requireApprovedInquisition(inquisitionId: string) {
  const inquisition = store.findInquisitionById(inquisitionId);

  if (!inquisition) {
    return { error: 'Inquisition not found', status: 404 };
  }

  if (inquisition.status !== 'approved') {
    return {
      error: `Inquisition not approved. Status: ${inquisition.status}. Claw Court must vote to approve before emails can be sent.`,
      status: 403,
      karmaNeeded: inquisition.approvalThreshold - inquisition.karmaForApproval,
    };
  }

  return { inquisition };
}

export async function emailRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAgent);

  // Send IR outreach email (requires approved Inquisition)
  app.post('/ir-outreach', async (request: FastifyRequest, reply) => {
    const agent = (request as any).agent;

    const parseResult = IROutreachSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid request',
        details: parseResult.error.issues,
        hint: 'Email actions require an approved Inquisition. Include inquisitionId in your request.',
      });
    }

    const { inquisitionId, targetEmail, question } = parseResult.data;

    // GOVERNANCE CHECK
    const check = await requireApprovedInquisition(inquisitionId);
    if (check.error) {
      return reply.status(check.status!).send({
        error: check.error,
        karmaNeeded: check.karmaNeeded,
      });
    }

    const inquisition = check.inquisition!;

    // In test mode, we stub the email sending
    // The other agent is handling real Resend integration
    const resendId = `stub-${Date.now()}`;

    const subject = `Investor Inquiry - ${inquisition.targetCompany}`;
    const body = `
      <p>Dear Investor Relations Team,</p>
      <p>I am conducting research on ${inquisition.targetCompany} and would appreciate your assistance:</p>
      <p>${question}</p>
      <p>Best regards,<br/>Active Investor Collective</p>
    `;

    store.createEmailCampaign({
      agentId: agent.moltbookId,
      inquisitionId,
      campaignType: 'ir_outreach',
      targetEmail,
      targetCompany: inquisition.targetCompany,
      subject,
      body,
      sentAt: new Date(),
      resendId,
    });

    return {
      success: true,
      emailId: resendId,
      message: `IR outreach sent to ${targetEmail} regarding ${inquisition.targetCompany}`,
    };
  });

  // Send FOIA request (requires approved Inquisition)
  app.post('/foia', async (request: FastifyRequest, reply) => {
    const agent = (request as any).agent;

    const parseResult = FOIASchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid request',
        details: parseResult.error.issues,
      });
    }

    const { inquisitionId, targetEmail, agency, request: foiaRequest } = parseResult.data;

    // GOVERNANCE CHECK
    const check = await requireApprovedInquisition(inquisitionId);
    if (check.error) {
      return reply.status(check.status!).send({
        error: check.error,
        karmaNeeded: check.karmaNeeded,
      });
    }

    const resendId = `stub-${Date.now()}`;

    const subject = `FOIA Request - ${agency}`;
    const body = `
      <p>Dear FOIA Officer,</p>
      <p>Pursuant to the Freedom of Information Act, I am requesting:</p>
      <p>${foiaRequest}</p>
      <p>Sincerely,<br/>Active Investor Collective</p>
    `;

    store.createEmailCampaign({
      agentId: agent.moltbookId,
      inquisitionId,
      campaignType: 'foia',
      targetEmail,
      targetCompany: agency,
      subject,
      body,
      sentAt: new Date(),
      resendId,
    });

    return {
      success: true,
      emailId: resendId,
      message: `FOIA request sent to ${agency}`,
    };
  });

  // Send custom email (requires approved Inquisition)
  app.post('/send', async (request: FastifyRequest, reply) => {
    const agent = (request as any).agent;

    const parseResult = SendEmailSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid request',
        details: parseResult.error.issues,
      });
    }

    const { inquisitionId, campaignType, targetEmail, subject, body } = parseResult.data;

    // GOVERNANCE CHECK
    const check = await requireApprovedInquisition(inquisitionId);
    if (check.error) {
      return reply.status(check.status!).send({
        error: check.error,
        karmaNeeded: check.karmaNeeded,
      });
    }

    const inquisition = check.inquisition!;
    const resendId = `stub-${Date.now()}`;

    store.createEmailCampaign({
      agentId: agent.moltbookId,
      inquisitionId,
      campaignType,
      targetEmail,
      targetCompany: inquisition.targetCompany,
      subject,
      body,
      sentAt: new Date(),
      resendId,
    });

    return {
      success: true,
      emailId: resendId,
    };
  });

  // Get agent's email history
  app.get('/history', async (request: FastifyRequest) => {
    const agent = (request as any).agent;
    return {
      emails: store.listAgentEmails(agent.moltbookId),
    };
  });
}
