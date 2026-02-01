import { Actor } from './types';

/**
 * Calculate expansion priority score for an actor.
 * Higher score = should be expanded sooner.
 *
 * Scoring:
 * +100 max: connectionCount * 10 (hub potential, capped at 100)
 * +50: never-crawled actors
 * +30: low crawlDepth (closer to seeds)
 * +30: funds/accelerators (high-connection subtypes)
 * +20: investors/founders (high-connection person subtypes)
 * +25: tagged paypal-mafia or yc-connected (crossover boost)
 */
export function calculateExpansionPriority(actor: Actor): number {
  let score = 0;

  // Hub potential (capped at 100)
  score += Math.min(actor.connectionCount * 10, 100);

  // Never-crawled bonus
  if (!actor.lastCrawledAt) {
    score += 50;
  }

  // Proximity to seed (lower crawlDepth = closer = higher priority)
  if (actor.crawlDepth <= 1) {
    score += 30;
  } else if (actor.crawlDepth === 2) {
    score += 15;
  }

  // High-connection subtypes
  const highConnSubtypes = ['vc_fund', 'pe_fund', 'accelerator', 'asset_manager', 'hedge_fund'];
  if (highConnSubtypes.includes(actor.subtype)) {
    score += 30;
  }

  // High-connection person subtypes
  const highConnPersonSubtypes = ['investor', 'founder', 'executive'];
  if (highConnPersonSubtypes.includes(actor.subtype)) {
    score += 20;
  }

  // Crossover tags boost
  const crossoverTags = ['paypal-mafia', 'yc-connected', 'thiel-network'];
  const hasCrossoverTag = actor.tags.some(t => crossoverTags.includes(t));
  if (hasCrossoverTag) {
    score += 25;
  }

  return score;
}

/**
 * Rank actors by expansion priority
 */
export function rankByExpansionPriority(actors: Actor[]): Array<Actor & { priority: number }> {
  return actors
    .map(actor => ({ ...actor, priority: calculateExpansionPriority(actor) }))
    .sort((a, b) => b.priority - a.priority);
}
