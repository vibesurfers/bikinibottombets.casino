import { config } from '../../api/lib/config';
import { ExtractedActor, ExtractedConnection, ExtractionResult } from './types';

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const EXTRACTION_SYSTEM_PROMPT = `You are an expert at extracting structured knowledge graph data from text.

Given the following text, extract ALL actors (people, organizations, funds) and connections (relationships between actors).

For each actor, provide:
- name: canonical full name
- category: "person", "organization", "fund", or "event"
- subtype: specific subtype (e.g., "vc_fund", "founder", "public_company", "accelerator")
- confidence: 0-1 how confident you are this entity exists

For each connection, provide:
- sourceName: name of the source actor
- targetName: name of the target actor
- category: one of: invested_in, co_invested, led_round, limited_partner_of, founded, co_founded, executive_at, board_member_at, partner_at, advisor_to, employee_at, acquired, merged_with, subsidiary_of, strategic_partner, alumni_of, classmate_of, mentor_of, graduated_from, participated_in_batch, manages_fund
- directed: true if the relationship has a clear direction (A invested in B), false if symmetric
- confidence: 0-1
- excerpt: the text snippet that supports this connection

Return ONLY valid JSON in this format:
{
  "actors": [...],
  "connections": [...]
}`;

/**
 * Call Gemini 2.0 Flash to extract actors and connections from text.
 */
export async function extractWithGemini(
  text: string,
  focusActor?: string
): Promise<ExtractionResult> {
  const prompt = focusActor
    ? `${EXTRACTION_SYSTEM_PROMPT}\n\nFocus especially on relationships involving "${focusActor}".\n\nText:\n${text.slice(0, 12000)}`
    : `${EXTRACTION_SYSTEM_PROMPT}\n\nText:\n${text.slice(0, 12000)}`;

  const response = await fetch(`${GEMINI_API}?key=${config.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        topP: 0.8,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`Gemini extraction failed: ${response.status} ${err}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

  try {
    const parsed = JSON.parse(content);
    return {
      actors: (parsed.actors || []).map((a: any): ExtractedActor => ({
        name: a.name || '',
        category: a.category || 'organization',
        subtype: a.subtype || 'private_company',
        confidence: a.confidence || 0.5,
      })),
      connections: (parsed.connections || []).map((c: any): ExtractedConnection => ({
        sourceName: c.sourceName || '',
        targetName: c.targetName || '',
        category: c.category || 'strategic_partner',
        directed: c.directed ?? true,
        confidence: c.confidence || 0.5,
        excerpt: c.excerpt || '',
      })),
      sourceType: 'gemini',
    };
  } catch {
    return { actors: [], connections: [], sourceType: 'gemini' };
  }
}
