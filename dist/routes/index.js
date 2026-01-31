import { authRoutes } from './auth.js';
import { researchRoutes } from './research.js';
import { clawCourtRoutes } from './claw-court.js';
import { emailRoutes } from './email.js';
import { campaignRoutes } from './campaigns.js';
export async function registerRoutes(app) {
    await app.register(authRoutes, { prefix: '/api/auth' });
    await app.register(researchRoutes, { prefix: '/api/research' });
    await app.register(clawCourtRoutes, { prefix: '/api/claw-court' });
    await app.register(emailRoutes, { prefix: '/api/email' });
    await app.register(campaignRoutes, { prefix: '/api/campaigns' });
}
