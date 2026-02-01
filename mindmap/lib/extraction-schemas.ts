import { z } from 'zod';

/**
 * Zod schemas for validating Gemini extraction output.
 * Used to enforce structure on the LLM's JSON responses.
 */

export const extractedActorSchema = z.object({
  name: z.string().min(1),
  category: z.enum(['person', 'organization', 'fund', 'event']),
  subtype: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const extractedConnectionSchema = z.object({
  sourceName: z.string().min(1),
  targetName: z.string().min(1),
  category: z.enum([
    'invested_in', 'co_invested', 'led_round', 'limited_partner_of',
    'founded', 'co_founded', 'executive_at', 'board_member_at',
    'partner_at', 'advisor_to', 'employee_at',
    'acquired', 'merged_with', 'subsidiary_of', 'strategic_partner',
    'alumni_of', 'classmate_of', 'mentor_of', 'graduated_from',
    'participated_in_batch', 'manages_fund',
  ]),
  directed: z.boolean(),
  confidence: z.number().min(0).max(1),
  excerpt: z.string().optional(),
});

export const extractionResultSchema = z.object({
  actors: z.array(extractedActorSchema),
  connections: z.array(extractedConnectionSchema),
});

/**
 * Validate and sanitize raw Gemini extraction output.
 * Returns only valid actors and connections, silently dropping malformed entries.
 */
export function validateExtractionResult(raw: unknown): {
  actors: z.infer<typeof extractedActorSchema>[];
  connections: z.infer<typeof extractedConnectionSchema>[];
} {
  if (!raw || typeof raw !== 'object') {
    return { actors: [], connections: [] };
  }

  const obj = raw as Record<string, unknown>;

  const actors: z.infer<typeof extractedActorSchema>[] = [];
  const connections: z.infer<typeof extractedConnectionSchema>[] = [];

  // Validate each actor individually (don't fail the whole batch on one bad entry)
  if (Array.isArray(obj.actors)) {
    for (const actor of obj.actors) {
      const result = extractedActorSchema.safeParse(actor);
      if (result.success) {
        actors.push(result.data);
      }
    }
  }

  // Validate each connection individually
  if (Array.isArray(obj.connections)) {
    for (const conn of obj.connections) {
      const result = extractedConnectionSchema.safeParse(conn);
      if (result.success) {
        connections.push(result.data);
      }
    }
  }

  return { actors, connections };
}

// Connection category display labels
export const connectionCategoryLabels: Record<string, string> = {
  invested_in: 'Invested In',
  co_invested: 'Co-Invested',
  led_round: 'Led Round',
  limited_partner_of: 'LP Of',
  founded: 'Founded',
  co_founded: 'Co-Founded',
  executive_at: 'Executive At',
  board_member_at: 'Board Member',
  partner_at: 'Partner At',
  advisor_to: 'Advisor To',
  employee_at: 'Employee At',
  acquired: 'Acquired',
  merged_with: 'Merged With',
  subsidiary_of: 'Subsidiary Of',
  strategic_partner: 'Strategic Partner',
  alumni_of: 'Alumni Of',
  classmate_of: 'Classmate Of',
  mentor_of: 'Mentor Of',
  graduated_from: 'Graduated From',
  participated_in_batch: 'Batch Participant',
  manages_fund: 'Manages Fund',
};

// Actor category → suggested subtypes
export const categorySubtypes: Record<string, string[]> = {
  organization: ['public_company', 'private_company', 'startup', 'accelerator', 'incubator'],
  person: ['founder', 'investor', 'executive', 'board_member', 'engineer'],
  fund: ['vc_fund', 'pe_fund', 'hedge_fund', 'asset_manager'],
  event: ['conference', 'program'],
};
