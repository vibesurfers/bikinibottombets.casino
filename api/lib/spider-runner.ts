import { ObjectId } from 'mongodb';
import {
  findSpiderJobById,
  updateSpiderJobProgress,
  setSpiderJobError,
  createOrganization,
  createRelationship,
  upsertRelationship,
  findOrganizationByName,
  getOrganizations,
  getOrgRelationships,
} from './org-spider-db';
import { resolveOrganization, resolveOrCreatePerson } from './org-resolver';
import { searchWeb, scrapeUrl } from './services';
import { getFindings } from './db';
import { triggerFindingAlgoliaSync } from './algolia';
import { SpiderJob, Organization, OrgRelationshipType } from './org-spider-types';

interface DiscoveredEntity {
  name: string;
  type: 'organization' | 'person';
  relationship: OrgRelationshipType;
  confidence: number;
  source: string;
  excerpt?: string;
}

/**
 * Run a spider job to discover relationships for an organization
 */
export async function runSpiderJob(jobId: string): Promise<void> {
  const job = await findSpiderJobById(jobId);
  if (!job) throw new Error('Spider job not found');

  await updateSpiderJobProgress(jobId, { currentStep: 'Starting spider' }, 'running');

  try {
    const orgs = await getOrganizations();
    const targetOrg = await orgs.findOne({ _id: job.targetId });
    if (!targetOrg) throw new Error('Target organization not found');

    const discoveries: DiscoveredEntity[] = [];
    let stepsCompleted = 0;
    const totalSteps = job.depth === 'deep' ? 5 : job.depth === 'standard' ? 4 : 3;

    // Step 1: Search for SEC filings and news
    await updateSpiderJobProgress(jobId, {
      currentStep: 'Searching SEC filings and news',
      stepsCompleted: ++stepsCompleted,
      totalSteps,
    });

    const searchResults = await searchWeb(
      `"${targetOrg.canonicalName}" SEC filing 13F 13D executive board`,
      10
    );

    // Extract entities from search results
    for (const result of searchResults || []) {
      const entities = extractEntitiesFromText(result.markdown || '', targetOrg.canonicalName);
      discoveries.push(...entities.map(e => ({
        ...e,
        source: result.url,
      })));
    }

    // Step 2: Scrape company website if available
    if (targetOrg.website) {
      await updateSpiderJobProgress(jobId, {
        currentStep: 'Scraping company website',
        stepsCompleted: ++stepsCompleted,
        totalSteps,
      });

      try {
        const websiteData = await scrapeUrl(targetOrg.website);
        if (websiteData?.markdown) {
          const entities = extractEntitiesFromText(websiteData.markdown, targetOrg.canonicalName);
          discoveries.push(...entities.map(e => ({
            ...e,
            source: targetOrg.website!,
          })));
        }
      } catch (err) {
        console.warn('Failed to scrape website:', err);
      }
    }

    // Step 3: Search for portfolio companies (for PE/VC funds)
    if (['pe_fund', 'vc_fund', 'asset_manager'].includes(targetOrg.orgType)) {
      await updateSpiderJobProgress(jobId, {
        currentStep: 'Searching for portfolio companies',
        stepsCompleted: ++stepsCompleted,
        totalSteps,
      });

      const portfolioResults = await searchWeb(
        `"${targetOrg.canonicalName}" portfolio company investment acquisition`,
        10
      );

      for (const result of portfolioResults || []) {
        const portfolioCompanies = extractPortfolioCompanies(result.markdown || '');
        discoveries.push(...portfolioCompanies.map(name => ({
          name,
          type: 'organization' as const,
          relationship: 'portfolio_company' as const,
          confidence: 0.7,
          source: result.url,
        })));
      }
    }

    // Step 4: Resolve and store discovered entities
    await updateSpiderJobProgress(jobId, {
      currentStep: 'Storing discovered relationships',
      stepsCompleted: ++stepsCompleted,
      totalSteps,
    });

    let orgsFound = 0;
    let personsFound = 0;
    let relsFound = 0;

    for (const discovery of discoveries) {
      try {
        if (discovery.type === 'organization') {
          const resolved = await resolveOrganization({
            name: discovery.name,
            createIfNotFound: true,
          });

          if (resolved.entity && resolved.entity._id!.toString() !== targetOrg._id!.toString()) {
            orgsFound++;
            await upsertRelationship({
              sourceType: 'organization',
              sourceId: targetOrg._id!,
              targetType: 'organization',
              targetId: resolved.entity._id!,
              relationshipType: discovery.relationship,
              confidence: discovery.confidence,
              metadata: {},
              evidence: [{
                sourceType: 'website',
                sourceUrl: discovery.source,
                excerpt: discovery.excerpt,
                extractedAt: new Date(),
              }],
            });
            relsFound++;
          }
        } else if (discovery.type === 'person') {
          const resolved = await resolveOrCreatePerson({
            name: discovery.name,
            createIfNotFound: true,
            organizationId: targetOrg._id!,
          });

          if (resolved.entity) {
            personsFound++;
            await upsertRelationship({
              sourceType: 'person',
              sourceId: resolved.entity._id!,
              targetType: 'organization',
              targetId: targetOrg._id!,
              relationshipType: discovery.relationship,
              confidence: discovery.confidence,
              metadata: {},
              evidence: [{
                sourceType: 'website',
                sourceUrl: discovery.source,
                excerpt: discovery.excerpt,
                extractedAt: new Date(),
              }],
            });
            relsFound++;
          }
        }
      } catch (err) {
        console.warn('Failed to store discovery:', err);
      }
    }

    // Step 5: Save findings to MongoDB and sync to Algolia
    await updateSpiderJobProgress(jobId, {
      currentStep: 'Indexing findings',
      stepsCompleted: totalSteps,
      totalSteps,
      organizationsFound: orgsFound,
      personsFound: personsFound,
      relationshipsFound: relsFound,
    });

    // Create a finding for this spider crawl
    const findings = await getFindings();
    const finding = {
      agentId: 'spider',
      createdBy: 'spider',
      targetCompany: targetOrg.canonicalName,
      company: targetOrg.canonicalName,
      ticker: targetOrg.ticker,
      findingType: 'social' as const,
      title: `Spider crawl: ${targetOrg.canonicalName}`,
      summary: `Discovered ${orgsFound} organizations, ${personsFound} persons, ${relsFound} relationships`,
      sourceUrl: targetOrg.website || '',
      rawData: { discoveries: discoveries.slice(0, 50) }, // Limit stored data
      structuredData: {
        keyPoints: [
          `Found ${orgsFound} related organizations`,
          `Found ${personsFound} related persons`,
          `Created ${relsFound} relationship records`,
        ],
      },
      createdAt: new Date(),
      publishedToMoltbook: false,
      source: 'spider',
    };

    const insertResult = await findings.insertOne(finding);
    triggerFindingAlgoliaSync({ ...finding, _id: insertResult.insertedId } as any, 'Spider');

    // Mark job complete
    await updateSpiderJobProgress(jobId, {
      currentStep: 'Complete',
      stepsCompleted: totalSteps,
      totalSteps,
      organizationsFound: orgsFound,
      personsFound: personsFound,
      relationshipsFound: relsFound,
    }, 'completed');

  } catch (error: any) {
    await setSpiderJobError(jobId, error.message);
    throw error;
  }
}

/**
 * Extract entities (people and organizations) from text
 */
function extractEntitiesFromText(text: string, targetCompany: string): DiscoveredEntity[] {
  const entities: DiscoveredEntity[] = [];

  // Executive/board member patterns
  const executivePatterns = [
    /(?:CEO|Chief Executive Officer|President)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
    /(?:CFO|Chief Financial Officer)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
    /(?:COO|Chief Operating Officer)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
    /(?:Chairman|Chair)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+),?\s+(?:CEO|CFO|COO|President|Chairman)/gi,
  ];

  for (const pattern of executivePatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1]?.trim();
      if (name && name.length > 4 && name.split(' ').length >= 2) {
        entities.push({
          name,
          type: 'person',
          relationship: 'executive',
          confidence: 0.8,
          source: '',
          excerpt: match[0],
        });
      }
    }
  }

  // Board member patterns
  const boardPatterns = [
    /(?:Director|Board Member)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+),?\s+(?:Independent Director|Board Member|Director)/gi,
  ];

  for (const pattern of boardPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1]?.trim();
      if (name && name.length > 4 && name.split(' ').length >= 2) {
        entities.push({
          name,
          type: 'person',
          relationship: 'board_member',
          confidence: 0.7,
          source: '',
          excerpt: match[0],
        });
      }
    }
  }

  // Co-investor patterns
  const coInvestorPatterns = [
    /(?:alongside|with|co-invested with|led by)\s+([A-Z][A-Za-z\s&]+(?:Capital|Partners|Management|Advisors|Group|Holdings))/gi,
  ];

  for (const pattern of coInvestorPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1]?.trim();
      if (name && name.length > 3 && name !== targetCompany) {
        entities.push({
          name,
          type: 'organization',
          relationship: 'co_investor',
          confidence: 0.6,
          source: '',
          excerpt: match[0],
        });
      }
    }
  }

  return entities;
}

/**
 * Extract portfolio company names from text
 */
function extractPortfolioCompanies(text: string): string[] {
  const companies: string[] = [];

  // Portfolio company patterns
  const patterns = [
    /(?:acquired|invested in|portfolio company|bought)\s+([A-Z][A-Za-z\s]+(?:Inc\.?|Corp\.?|LLC|Ltd\.?)?)/gi,
    /([A-Z][A-Za-z\s]+(?:Inc\.?|Corp\.?|LLC|Ltd\.?))\s+(?:was acquired|was bought|received investment)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1]?.trim();
      if (name && name.length > 3 && name.split(' ').length <= 5) {
        companies.push(name);
      }
    }
  }

  return [...new Set(companies)];
}
