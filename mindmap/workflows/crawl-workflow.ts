import { ObjectId } from 'mongodb';
import {
  findCrawlJobById,
  updateCrawlJobProgress,
  setCrawlJobError,
  dequeueNextItem,
  markQueueItemCompleted,
  markQueueItemFailed,
  getQueueStats,
  findActorById,
  updateActor,
  getActors,
} from '../lib/db';
import { resolveActor } from '../lib/resolver';
import { calculateExpansionPriority } from '../lib/expansion-priority';
import { searchWeb, searchAndScrape, scrapeUrl } from '../../api/lib/services';
import { parseDocument } from '../../api/lib/services';
import { config } from '../../api/lib/config';
import { upsertConnection, enqueueCrawlItem } from '../lib/db';
import { ConnectionCategory, ExtractedActor, ExtractedConnection } from '../lib/types';

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/**
 * Main crawl workflow: dequeue -> fetch -> extract -> store -> expand
 * Runs until queue is empty or limits are hit.
 */
export async function runCrawlWorkflow(jobId: string): Promise<void> {
  const job = await findCrawlJobById(jobId);
  if (!job) throw new Error('Crawl job not found');

  await updateCrawlJobProgress(jobId, { currentStep: 'Starting crawl' }, 'running');

  let actorsFound = 0;
  let connectionsFound = 0;
  let itemsProcessed = 0;
  const maxItems = job.maxActors * 2; // Rough limit on queue items

  try {
    while (itemsProcessed < maxItems) {
      // Dequeue next item
      const item = await dequeueNextItem(jobId);
      if (!item) {
        // Queue empty - check if we should expand
        const stats = await getQueueStats(jobId);
        if (stats.pending === 0 && stats.processing === 0) {
          break; // All done
        }
        continue;
      }

      itemsProcessed++;

      await updateCrawlJobProgress(jobId, {
        currentStep: `Processing: ${item.actorName} (${item.itemType})`,
        stepsCompleted: itemsProcessed,
        actorsFound,
        connectionsFound,
      });

      try {
        let textContent = '';

        // Step 1: Fetch content based on item type
        switch (item.itemType) {
          case 'web_search': {
            if (!item.searchQuery) break;
            const results = await searchAndScrape(item.searchQuery, 3);
            textContent = results.map(r => `Source: ${r.url}\n${r.markdown}`).join('\n\n---\n\n');
            break;
          }
          case 'web_scrape': {
            if (!item.url) break;
            const result = await scrapeUrl(item.url);
            textContent = result.markdown;
            break;
          }
          case 'pdf_parse': {
            if (!item.url) break;
            const result = await parseDocument(item.url);
            textContent = result.chunks.map(c => c.content).join('\n\n');
            break;
          }
          case 'sec_filing': {
            if (!item.url) break;
            try {
              const result = await parseDocument(item.url);
              textContent = result.chunks.map(c => c.content).join('\n\n');
            } catch {
              const result = await scrapeUrl(item.url);
              textContent = result.markdown;
            }
            break;
          }
        }

        if (!textContent || textContent.length < 50) {
          await markQueueItemCompleted(item._id!.toString());
          continue;
        }

        // Step 2: Extract actors and connections via Gemini
        const extraction = await extractWithGemini(textContent, item.actorName);

        // Step 3: Resolve and store actors
        for (const extracted of extraction.actors) {
          const result = await resolveActor({
            name: extracted.name,
            category: extracted.category as any,
            subtype: extracted.subtype as any,
            createIfNotFound: true,
            crawlDepth: (await findActorById(item.actorId))?.crawlDepth
              ? (await findActorById(item.actorId))!.crawlDepth + 1
              : 1,
          });
          if (result.created) actorsFound++;
        }

        // Step 4: Store connections
        for (const extracted of extraction.connections) {
          const source = await resolveActor({ name: extracted.sourceName, createIfNotFound: false });
          const target = await resolveActor({ name: extracted.targetName, createIfNotFound: false });

          if (source.actor && target.actor) {
            await upsertConnection({
              sourceActorId: source.actor._id!,
              targetActorId: target.actor._id!,
              category: extracted.category as ConnectionCategory,
              directed: extracted.directed,
              properties: (extracted.properties || {}) as any,
              confidence: extracted.confidence,
              evidence: [{
                url: item.url,
                sourceType: item.itemType,
                excerpt: extracted.excerpt,
                extractedAt: new Date(),
              }],
            });
            connectionsFound++;
          }
        }

        // Step 5: Mark actor as crawled
        await updateActor(item.actorId.toString(), { lastCrawledAt: new Date() });

        // Step 6: Queue expansion for newly discovered actors with high priority
        if (extraction.actors.length > 0 && itemsProcessed < maxItems / 2) {
          const actorsCol = await getActors();
          const uncrawled = await actorsCol
            .find({ lastCrawledAt: { $exists: false }, crawlDepth: { $lte: job.maxDepth } })
            .limit(5)
            .toArray();

          for (const actor of uncrawled) {
            const priority = calculateExpansionPriority(actor);
            await enqueueCrawlItem({
              jobId: new ObjectId(jobId),
              actorId: actor._id!,
              actorName: actor.canonicalName,
              itemType: 'web_search',
              searchQuery: `"${actor.canonicalName}" investors board executives portfolio`,
              priority,
            });
          }
        }

        await markQueueItemCompleted(item._id!.toString());

      } catch (err: any) {
        console.warn(`[Crawl] Failed to process item ${item._id}:`, err.message);
        await markQueueItemFailed(item._id!.toString(), err.message);
      }

      // Update progress
      if (itemsProcessed % 3 === 0) {
        await updateCrawlJobProgress(jobId, {
          currentStep: `Processed ${itemsProcessed} items`,
          stepsCompleted: itemsProcessed,
          actorsFound,
          connectionsFound,
        });
      }
    }

    // Mark complete
    await updateCrawlJobProgress(jobId, {
      currentStep: 'Complete',
      stepsCompleted: itemsProcessed,
      actorsFound,
      connectionsFound,
    }, 'completed');

  } catch (error: any) {
    await setCrawlJobError(jobId, error.message);
    throw error;
  }
}

/**
 * Extract actors and connections from text using Gemini 2.0 Flash
 */
async function extractWithGemini(
  text: string,
  focusActor: string
): Promise<{ actors: ExtractedActor[]; connections: ExtractedConnection[] }> {
  const prompt = `You are an expert at extracting structured knowledge graph data from text.
Focus on relationships involving "${focusActor}".

Extract ALL actors (people, organizations, funds) and connections (relationships between actors).

For each actor: { name, category (person/organization/fund/event), subtype, confidence (0-1) }
For each connection: { sourceName, targetName, category (invested_in/co_invested/led_round/limited_partner_of/founded/co_founded/executive_at/board_member_at/partner_at/advisor_to/employee_at/acquired/merged_with/subsidiary_of/strategic_partner/alumni_of/graduated_from/manages_fund), directed, confidence (0-1), excerpt }

Return ONLY valid JSON: { "actors": [...], "connections": [...] }

Text:
${text.slice(0, 12000)}`;

  const response = await fetch(`${GEMINI_API}?key=${config.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini extraction failed: ${response.status}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

  try {
    const parsed = JSON.parse(content);
    return {
      actors: (parsed.actors || []).map((a: any) => ({
        name: a.name || '',
        category: a.category || 'organization',
        subtype: a.subtype || 'private_company',
        confidence: a.confidence || 0.5,
      })),
      connections: (parsed.connections || []).map((c: any) => ({
        sourceName: c.sourceName || '',
        targetName: c.targetName || '',
        category: c.category || 'strategic_partner',
        directed: c.directed ?? true,
        confidence: c.confidence || 0.5,
        excerpt: c.excerpt || '',
      })),
    };
  } catch {
    return { actors: [], connections: [] };
  }
}
