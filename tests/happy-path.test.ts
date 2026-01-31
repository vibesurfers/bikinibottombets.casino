import { describe, it, expect } from 'vitest';

/**
 * Happy Path Test
 *
 * Tests the complete end-to-end flow from registration to sending an email
 * after Claw Court approval.
 */

describe('Complete Happy Path: Register → Research → Vote → Email', () => {
  const BASE_URL = 'http://localhost:3000';
  const agentToken = 'high-karma-agent-token'; // Has 2000 karma, enough to auto-approve

  it('completes the full flow successfully', async () => {
    // Step 1: Register
    const registerRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identityToken: agentToken }),
    });
    const registerData = await registerRes.json();

    expect(registerRes.status).toBe(200);
    expect(registerData.success).toBe(true);
    expect(registerData.agent.karma).toBe(2000);
    console.log('✓ Step 1: Registered with karma:', registerData.agent.karma);

    // Step 2: Propose an Inquisition (auto-approves with 2000 karma)
    const threadId = `happy-path-${Date.now()}`;
    const proposeRes = await fetch(`${BASE_URL}/api/claw-court/propose`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Moltbook-Identity': agentToken,
      },
      body: JSON.stringify({
        targetCompany: 'BigTech AntiAI Inc',
        targetDescription: 'Actively lobbying against AI development',
        moltbookThreadId: threadId,
        moltbookThreadUrl: `https://moltbook.com/post/${threadId}`,
      }),
    });
    const proposeData = await proposeRes.json();

    expect(proposeRes.status).toBe(200);
    expect(proposeData.success).toBe(true);
    expect(proposeData.status).toBe('approved'); // Auto-approved due to high karma
    expect(proposeData.karmaForApproval).toBe(2000);
    console.log('✓ Step 2: Inquisition auto-approved with karma:', proposeData.karmaForApproval);

    const inquisitionId = proposeData.id;

    // Step 3: Check Inquisition status
    const statusRes = await fetch(`${BASE_URL}/api/claw-court/${inquisitionId}`, {
      headers: { 'X-Moltbook-Identity': agentToken },
    });
    const statusData = await statusRes.json();

    expect(statusRes.status).toBe(200);
    expect(statusData.status).toBe('approved');
    console.log('✓ Step 3: Inquisition status confirmed:', statusData.status);

    // Step 4: Send IR outreach email (now allowed!)
    const emailRes = await fetch(`${BASE_URL}/api/email/ir-outreach`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Moltbook-Identity': agentToken,
      },
      body: JSON.stringify({
        inquisitionId,
        targetEmail: 'ir@bigtech.com',
        question: 'Please clarify your lobbying activities against AI regulation transparency.',
      }),
    });
    const emailData = await emailRes.json();

    expect(emailRes.status).toBe(200);
    expect(emailData.success).toBe(true);
    expect(emailData.emailId).toBeDefined();
    console.log('✓ Step 4: Email sent successfully:', emailData.emailId);

    // Step 5: Check email history
    const historyRes = await fetch(`${BASE_URL}/api/email/history`, {
      headers: { 'X-Moltbook-Identity': agentToken },
    });
    const historyData = await historyRes.json();

    expect(historyRes.status).toBe(200);
    expect(historyData.emails.length).toBeGreaterThanOrEqual(1);
    expect(historyData.emails[0].targetEmail).toBe('ir@bigtech.com');
    console.log('✓ Step 5: Email history confirmed:', historyData.emails.length, 'email(s)');

    console.log('\n🎉 COMPLETE HAPPY PATH SUCCESSFUL!');
  });
});

describe('Multi-Agent Voting Flow', () => {
  const BASE_URL = 'http://localhost:3000';

  it('requires multiple agents to reach approval threshold', async () => {
    const agent1Token = 'test-valid-moltbook-token'; // 500 karma
    const agent2Token = 'second-agent-token'; // 750 karma

    // Register both agents
    await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identityToken: agent1Token }),
    });

    await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identityToken: agent2Token }),
    });

    // Agent 1 proposes (500 karma)
    const threadId = `multi-agent-${Date.now()}`;
    const proposeRes = await fetch(`${BASE_URL}/api/claw-court/propose`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Moltbook-Identity': agent1Token,
      },
      body: JSON.stringify({
        targetCompany: 'MultiAgent Test Corp',
        targetDescription: 'Testing multi-agent voting',
        moltbookThreadId: threadId,
        moltbookThreadUrl: `https://moltbook.com/post/${threadId}`,
      }),
    });
    const proposeData = await proposeRes.json();

    expect(proposeData.success).toBe(true);
    expect(proposeData.status).toBe('voting'); // Not approved yet (500 < 1000)
    expect(proposeData.karmaNeeded).toBe(500); // Need 500 more karma
    console.log('✓ Agent 1 proposed, needs', proposeData.karmaNeeded, 'more karma');

    const inquisitionId = proposeData.id;

    // Try to send email - should fail (not approved)
    const emailBeforeRes = await fetch(`${BASE_URL}/api/email/ir-outreach`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Moltbook-Identity': agent1Token,
      },
      body: JSON.stringify({
        inquisitionId,
        targetEmail: 'ir@test.com',
        question: 'Test question',
      }),
    });

    expect(emailBeforeRes.status).toBe(403);
    console.log('✓ Email blocked before approval (as expected)');

    // Agent 2 votes (750 karma) - total now 1250, should approve
    const voteRes = await fetch(`${BASE_URL}/api/claw-court/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Moltbook-Identity': agent2Token,
      },
      body: JSON.stringify({
        inquisitionId,
        vote: 'approve',
      }),
    });
    const voteData = await voteRes.json();

    expect(voteData.success).toBe(true);
    expect(voteData.status).toBe('approved'); // Now approved (500 + 750 = 1250 > 1000)
    expect(voteData.karmaForApproval).toBe(1250);
    console.log('✓ Agent 2 voted, total karma:', voteData.karmaForApproval, '- APPROVED');

    // Now email should work
    const emailAfterRes = await fetch(`${BASE_URL}/api/email/ir-outreach`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Moltbook-Identity': agent1Token,
      },
      body: JSON.stringify({
        inquisitionId,
        targetEmail: 'ir@test.com',
        question: 'Now we can send!',
      }),
    });
    const emailAfterData = await emailAfterRes.json();

    expect(emailAfterRes.status).toBe(200);
    expect(emailAfterData.success).toBe(true);
    console.log('✓ Email sent after collective approval');

    console.log('\n🎉 MULTI-AGENT VOTING FLOW SUCCESSFUL!');
  });
});
