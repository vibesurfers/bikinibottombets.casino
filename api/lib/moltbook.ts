import { config, isTestMode } from './config';

const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';

export interface MoltbookAgent {
  id: string;
  name: string;
  karma: number;
  avatarUrl?: string;
  isVerified: boolean;
  isClaimed: boolean;
  createdAt: string;
  followerCount: number;
}

// Test mode stubs - agents pass their API key directly
const testAgents: Record<string, MoltbookAgent> = {
  'test-valid-moltbook-token': {
    id: 'agent-001',
    name: 'TestBot Alpha',
    karma: 500,
    isVerified: true,
    isClaimed: true,
    createdAt: new Date().toISOString(),
    followerCount: 100,
  },
  'second-agent-token': {
    id: 'agent-002',
    name: 'TestBot Beta',
    karma: 750,
    isVerified: true,
    isClaimed: true,
    createdAt: new Date().toISOString(),
    followerCount: 150,
  },
  'high-karma-agent-token': {
    id: 'agent-003',
    name: 'HighKarma Bot',
    karma: 2000,
    isVerified: true,
    isClaimed: true,
    createdAt: new Date().toISOString(),
    followerCount: 500,
  },
  // Unclaimed agent for testing claim requirement
  'unclaimed-agent-token': {
    id: 'agent-004',
    name: 'UnclaimedBot',
    karma: 0,
    isVerified: false,
    isClaimed: false,
    createdAt: new Date().toISOString(),
    followerCount: 0,
  },
  // Unregistered token - simulates agent that exists in Moltbook but not registered with us
  'unregistered-agent-token': {
    id: 'agent-005',
    name: 'UnregisteredBot',
    karma: 100,
    isVerified: true,
    isClaimed: true,
    createdAt: new Date().toISOString(),
    followerCount: 10,
  },
};

/**
 * Verify an agent's identity using their Moltbook API key.
 *
 * Flow:
 * 1. Agent passes their moltbook_sk_xxx API key in X-Moltbook-Identity header
 * 2. We call Moltbook's /agents/me endpoint with that key to verify it
 * 3. If valid, we get their agent info including karma for voting
 *
 * Requires agent to be claimed by a human to ensure accountability.
 */
export async function verifyAgentIdentity(apiKey: string): Promise<MoltbookAgent> {
  if (isTestMode()) {
    const agent = testAgents[apiKey];
    if (!agent) {
      throw new Error('Invalid API key');
    }
    if (!agent.isClaimed) {
      throw new Error('Agent not claimed. Your human must claim you on Moltbook first.');
    }
    return agent;
  }

  // First check agent status (works for unclaimed agents)
  const statusResponse = await fetch(`${MOLTBOOK_API}/agents/status`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!statusResponse.ok) {
    const error = await statusResponse.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`Invalid Moltbook API key: ${error.error || 'verification failed'}`);
  }

  const statusData = await statusResponse.json();

  if (!statusData.success) {
    throw new Error('Invalid Moltbook API key');
  }

  // Check if claimed
  if (statusData.status !== 'claimed') {
    throw new Error(
      `Agent not claimed. Your human must claim you first! ` +
      `Claim URL: ${statusData.claim_url || 'Check your Moltbook status'}`
    );
  }

  // Get full profile with karma using /agents/me
  const meResponse = await fetch(`${MOLTBOOK_API}/agents/me`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!meResponse.ok) {
    // Fallback: try to get profile by name from status
    const agentName = statusData.agent?.name;
    if (agentName) {
      const profileResponse = await fetch(
        `${MOLTBOOK_API}/agents/profile?name=${encodeURIComponent(agentName)}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        }
      );

      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        if (profileData.success && profileData.agent) {
          return {
            id: profileData.agent.id,
            name: profileData.agent.name,
            karma: profileData.agent.karma || 0,
            avatarUrl: profileData.agent.avatar_url,
            isVerified: profileData.agent.is_claimed,
            isClaimed: profileData.agent.is_claimed,
            createdAt: profileData.agent.created_at,
            followerCount: profileData.agent.follower_count || 0,
          };
        }
      }
    }

    // If all else fails, return minimal info from status
    return {
      id: statusData.agent?.id || 'unknown',
      name: statusData.agent?.name || 'Unknown Agent',
      karma: 0,
      isVerified: true,
      isClaimed: true,
      createdAt: new Date().toISOString(),
      followerCount: 0,
    };
  }

  const meData = await meResponse.json();

  return {
    id: meData.agent?.id || meData.id,
    name: meData.agent?.name || meData.name,
    karma: meData.agent?.karma || meData.karma || 0,
    avatarUrl: meData.agent?.avatar_url || meData.avatar_url,
    isVerified: true,
    isClaimed: true,
    createdAt: meData.agent?.created_at || meData.created_at || new Date().toISOString(),
    followerCount: meData.agent?.follower_count || meData.follower_count || 0,
  };
}
