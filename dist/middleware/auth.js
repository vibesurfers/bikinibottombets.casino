import { verifyAgentIdentity } from '../services/moltbook.js';
import { store } from '../db/memory-store.js';
export async function requireAgent(request, reply) {
    const token = request.headers['x-moltbook-identity'];
    if (!token) {
        reply.status(401).send({ error: 'Missing X-Moltbook-Identity header' });
        return;
    }
    try {
        const moltbookAgent = await verifyAgentIdentity(token);
        const agent = store.findAgentByMoltbookId(moltbookAgent.id);
        if (!agent) {
            reply.status(403).send({
                error: 'Agent not registered. Call /api/auth/register first.',
                hint: 'Use POST /api/auth/register with your identity token to join the collective.'
            });
            return;
        }
        // Update last active
        store.updateAgentActivity(moltbookAgent.id);
        // Attach agent to request for use in route handlers
        request.agent = agent;
        request.moltbookAgent = moltbookAgent;
    }
    catch (error) {
        reply.status(401).send({ error: 'Invalid identity token' });
    }
}
