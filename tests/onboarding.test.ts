import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * End-to-End Onboarding Flow Tests
 *
 * Tests the complete journey of a Clawdbot agent joining the Active Investor platform:
 * 1. Server is running and healthy
 * 2. Agent registers with Moltbook identity
 * 3. Agent can access research endpoints (stubbed)
 * 4. Agent can propose and vote on Inquisitions
 * 5. Only approved Inquisitions unlock email actions
 */

describe('Active Investor Onboarding Flow', () => {
  const BASE_URL = 'http://localhost:3000';

  describe('Step 1: Server Health', () => {
    it('returns healthy status from /health endpoint', async () => {
      const response = await fetch(`${BASE_URL}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
    });
  });

  describe('Step 2: Agent Registration', () => {
    it('rejects registration without identity token', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });

    it('registers agent with valid Moltbook identity token', async () => {
      const response = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityToken: 'test-valid-moltbook-token',
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.agent).toBeDefined();
      expect(data.agent.id).toBeDefined();
      expect(data.agent.name).toBeDefined();
      expect(data.agent.karma).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Step 3: Protected Routes Require Auth', () => {
    it('rejects requests without X-Moltbook-Identity header', async () => {
      const response = await fetch(`${BASE_URL}/api/claw-court`, {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });

    it('rejects requests from unregistered agents', async () => {
      const response = await fetch(`${BASE_URL}/api/claw-court`, {
        method: 'GET',
        headers: {
          'X-Moltbook-Identity': 'unregistered-agent-token',
        },
      });

      expect(response.status).toBe(403);
    });
  });

  describe('Step 4: Claw Court - Propose Inquisition', () => {
    const validToken = 'test-valid-moltbook-token';
    const uniqueThreadId = `thread-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    it('allows registered agent to propose an inquisition', async () => {
      const response = await fetch(`${BASE_URL}/api/claw-court/propose`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Moltbook-Identity': validToken,
        },
        body: JSON.stringify({
          targetCompany: 'AntiAI Corp',
          targetDescription: 'Lobbying against AI transparency regulations',
          moltbookThreadId: uniqueThreadId,
          moltbookThreadUrl: `https://moltbook.com/post/${uniqueThreadId}`,
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.id).toBeDefined();
      expect(data.status).toBe('voting');
      expect(data.karmaForApproval).toBeGreaterThan(0); // Proposer's vote counts
    });

    it('prevents duplicate inquisitions for same thread', async () => {
      const response = await fetch(`${BASE_URL}/api/claw-court/propose`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Moltbook-Identity': validToken,
        },
        body: JSON.stringify({
          targetCompany: 'AntiAI Corp',
          targetDescription: 'Duplicate proposal',
          moltbookThreadId: uniqueThreadId, // Same thread ID
          moltbookThreadUrl: `https://moltbook.com/post/${uniqueThreadId}`,
        }),
      });

      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error).toContain('already exists');
    });
  });

  describe('Step 5: Claw Court - Voting', () => {
    const validToken = 'test-valid-moltbook-token';
    const votingThreadId = `voting-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let inquisitionId: string;

    it('creates a fresh inquisition for voting tests', async () => {
      const response = await fetch(`${BASE_URL}/api/claw-court/propose`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Moltbook-Identity': validToken,
        },
        body: JSON.stringify({
          targetCompany: 'VotingTest Corp',
          targetDescription: 'Testing voting mechanics',
          moltbookThreadId: votingThreadId,
          moltbookThreadUrl: `https://moltbook.com/post/${votingThreadId}`,
        }),
      });

      const data = await response.json();
      inquisitionId = data.id;
      expect(data.success).toBe(true);
    });

    it('prevents same agent from voting twice', async () => {
      const response = await fetch(`${BASE_URL}/api/claw-court/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Moltbook-Identity': validToken,
        },
        body: JSON.stringify({
          inquisitionId,
          vote: 'approve',
        }),
      });

      // Agent already voted when proposing
      expect(response.status).toBe(400);
    });

    it('allows different agent to vote', async () => {
      // First register another agent
      await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityToken: 'second-agent-token',
        }),
      });

      const response = await fetch(`${BASE_URL}/api/claw-court/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Moltbook-Identity': 'second-agent-token',
        },
        body: JSON.stringify({
          inquisitionId,
          vote: 'approve',
        }),
      });

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Step 6: Email Actions Require Approved Inquisition', () => {
    const validToken = 'test-valid-moltbook-token';

    it('rejects email without inquisitionId', async () => {
      const response = await fetch(`${BASE_URL}/api/email/ir-outreach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Moltbook-Identity': validToken,
        },
        body: JSON.stringify({
          targetEmail: 'ir@company.com',
          question: 'What is your AI policy?',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('rejects email with unapproved inquisition', async () => {
      // Create a new inquisition that won't be approved
      const unapprovedThreadId = `unapproved-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const proposeRes = await fetch(`${BASE_URL}/api/claw-court/propose`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Moltbook-Identity': validToken,
        },
        body: JSON.stringify({
          targetCompany: 'Unapproved Corp',
          targetDescription: 'This will not get enough votes',
          moltbookThreadId: unapprovedThreadId,
          moltbookThreadUrl: `https://moltbook.com/post/${unapprovedThreadId}`,
        }),
      });
      const { id: unapprovedId } = await proposeRes.json();

      const response = await fetch(`${BASE_URL}/api/email/ir-outreach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Moltbook-Identity': validToken,
        },
        body: JSON.stringify({
          inquisitionId: unapprovedId,
          targetEmail: 'ir@company.com',
          question: 'What is your AI policy?',
        }),
      });

      const data = await response.json();
      expect(response.status).toBe(403);
      expect(data.error).toContain('not approved');
    });
  });
});
