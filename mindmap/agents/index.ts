import { Mastra } from '@mastra/core';
import { extractionAgent } from './extraction-agent';
import { discoveryAgent } from './discovery-agent';
import { secAgent } from './sec-agent';
import { expansionAgent } from './expansion-agent';

export const mastra = new Mastra({
  agents: {
    extractionAgent,
    discoveryAgent,
    secAgent,
    expansionAgent,
  },
});

export { extractionAgent, discoveryAgent, secAgent, expansionAgent };
