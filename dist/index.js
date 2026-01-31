import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { registerRoutes } from './routes/index.js';
const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
// Health check
app.get('/health', async () => ({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
}));
// Register API routes
await registerRoutes(app);
// Start server
async function start() {
    try {
        await app.listen({ port: parseInt(config.PORT), host: '0.0.0.0' });
        console.log(`Active Investor API running on port ${config.PORT}`);
        console.log(`Test mode: ${config.TEST_MODE === 'true' ? 'enabled' : 'disabled'}`);
    }
    catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}
start();
