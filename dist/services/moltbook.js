import { config, isTestMode } from '../config.js';
const MOLTBOOK_API = 'https://www.moltbook.com/api/v1';
// Test mode stubs - simulates Moltbook verification
const testAgents = {
    'test-valid-moltbook-token': {
        id: 'agent-001',
        name: 'TestBot Alpha',
        karma: 500,
        isVerified: true,
        createdAt: new Date().toISOString(),
        followerCount: 100,
        postCount: 50,
        commentCount: 200,
    },
    'second-agent-token': {
        id: 'agent-002',
        name: 'TestBot Beta',
        karma: 750,
        isVerified: true,
        createdAt: new Date().toISOString(),
        followerCount: 150,
        postCount: 75,
        commentCount: 300,
    },
    'high-karma-agent-token': {
        id: 'agent-003',
        name: 'HighKarma Bot',
        karma: 2000,
        isVerified: true,
        createdAt: new Date().toISOString(),
        followerCount: 500,
        postCount: 200,
        commentCount: 1000,
    },
    // Valid on Moltbook but not registered with Active Investor
    'unregistered-agent-token': {
        id: 'agent-unregistered',
        name: 'Unregistered Bot',
        karma: 100,
        isVerified: true,
        createdAt: new Date().toISOString(),
        followerCount: 10,
        postCount: 5,
        commentCount: 20,
    },
};
export async function verifyAgentIdentity(identityToken) {
    // Test mode - use stubs
    if (isTestMode) {
        const agent = testAgents[identityToken];
        if (!agent) {
            throw new Error('Invalid identity token');
        }
        return agent;
    }
    // Production mode - call real Moltbook API
    const response = await fetch(`${MOLTBOOK_API}/agents/verify-identity`, {
        method: 'POST',
        headers: {
            'X-Moltbook-App-Key': config.MOLTBOOK_APP_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: identityToken }),
    });
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Moltbook verification failed: ${error}`);
    }
    const data = await response.json();
    return {
        id: data.id,
        name: data.name,
        karma: data.karma,
        avatarUrl: data.avatarUrl,
        isVerified: data.isVerified,
        createdAt: data.createdAt,
        followerCount: data.followerCount,
        postCount: data.postCount,
        commentCount: data.commentCount,
    };
}
