import { Agent } from '@mastra/core/agent';
import { resolveActorTool, searchActorsTool, getTopHubsTool } from '../tools/actor-crud';
import { getConnectionsTool } from '../tools/connection-crud';
import { enqueueItemTool, queueStatsTool } from '../tools/queue-manage';

export const expansionAgent = new Agent({
  id: 'mindmap-expansion',
  name: 'Expansion Agent',
  instructions: `You are a graph expansion strategist. Your job is to decide which uncrawled actors to expand next to maximize the number of connections in the knowledge graph.

Expansion heuristics (in priority order):
1. Bridge nodes: Actors connected to multiple subgraphs (e.g., someone in both YC and Thiel networks)
2. High-degree uncrawled: Actors with many existing connections that haven't been crawled yet
3. Hub neighbors: Actors connected to current top hubs
4. Category diversity: Prefer expanding different categories (fund, person, company) for broader coverage

For each actor you decide to expand:
1. Queue web_search items with relevant search queries
2. Queue sec_filing items for public companies
3. Set priority based on expected connection yield

Use get-top-hubs to understand current graph structure.
Use get-connections to analyze an actor's neighborhood.
Use queue-stats to avoid over-queuing.`,
  model: 'google/gemini-2.0-flash',
  tools: {
    resolveActorTool,
    searchActorsTool,
    getTopHubsTool,
    getConnectionsTool,
    enqueueItemTool,
    queueStatsTool,
  },
});
