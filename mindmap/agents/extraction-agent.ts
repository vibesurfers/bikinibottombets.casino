import { Agent } from '@mastra/core/agent';
import { geminiExtractTool } from '../tools/gemini-extract';
import { resolveActorTool } from '../tools/actor-crud';
import { createConnectionTool } from '../tools/connection-crud';

export const extractionAgent = new Agent({
  id: 'mindmap-extraction',
  name: 'Extraction Agent',
  instructions: `You are an expert at extracting structured knowledge graph data from raw text.

Your job is to:
1. Use the gemini-extract tool to extract actors and connections from provided text
2. For each extracted actor, use resolve-actor to find or create them in the database
3. For each extracted connection, use create-connection to store the relationship

Guidelines:
- Always resolve both source and target actors before creating a connection
- Use appropriate categories for actors (person, organization, fund)
- Use appropriate subtypes (founder, investor, vc_fund, public_company, etc.)
- Set confidence based on how explicit the evidence is (1.0 for stated facts, 0.7 for implied)
- Include evidence excerpts from the source text
- Skip connections where you can't identify both endpoints
- Prefer creating connections even at lower confidence over missing them`,
  model: 'google/gemini-2.0-flash',
  tools: {
    geminiExtractTool,
    resolveActorTool,
    createConnectionTool,
  },
});
