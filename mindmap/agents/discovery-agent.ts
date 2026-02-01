import { Agent } from '@mastra/core/agent';
import { webSearchTool } from '../tools/web-search';
import { webScrapeTool } from '../tools/web-scrape';
import { resolveActorTool } from '../tools/actor-crud';
import { enqueueItemTool } from '../tools/queue-manage';

export const discoveryAgent = new Agent({
  id: 'mindmap-discovery',
  name: 'Discovery Agent',
  instructions: `You are a research agent that discovers new actors (people, companies, funds) related to a given actor.

Your job is to:
1. Search the web for information about the given actor using queries like:
   - "{actorName}" investors portfolio board executives
   - "{actorName}" funding rounds investments
   - "{actorName}" co-founder board members leadership
   - "{actorName}" SEC filing proxy statement
2. Scrape the most promising URLs for full content
3. Resolve any new actors you discover
4. Queue promising URLs for the extraction agent to process

Search strategy:
- For FUNDS: search for portfolio companies, LPs, co-investors, team
- For COMPANIES: search for investors, board members, executives, acquirers
- For PEOPLE: search for companies founded, boards served, investments made
- For ACCELERATORS: search for alumni companies, mentors, partners

Always queue URLs that look promising for further extraction even if you can't fully process them now.`,
  model: 'google/gemini-2.0-flash',
  tools: {
    webSearchTool,
    webScrapeTool,
    resolveActorTool,
    enqueueItemTool,
  },
});
