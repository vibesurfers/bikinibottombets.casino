/**
 * Org Spider - Main Orchestration
 *
 * Deep research on PE funds and their networks - tracking organizations,
 * people, investments, co-investors, and role changes.
 */

import { ObjectId } from 'mongodb';
import {
  Organization,
  Person,
  OrgRelationship,
  SpiderJob,
  SpiderDepth,
  GraphData,
  GraphNode,
  GraphEdge,
  OrgType,
  RelationshipEvidence,
} from './org-spider-types';
import {
  getOrganizations,
  getPersons,
  getOrgRelationships,
  createOrganization,
  createPerson,
  findOrganizationById,
  findPersonById,
  findRelationshipsForEntity,
  upsertRelationship,
  createSpiderJob,
  findSpiderJobById,
  updateSpiderJobProgress,
  setSpiderJobError,
  getPortfolioCompanies,
  getFundTeam,
  getCoInvestors,
} from './org-spider-db';
import {
  resolveOrganization,
  resolveOrCreatePerson,
} from './org-resolver';
import {
  extractFromDEF14A,
  extractFrom13DG,
  getInstitutionalHolders,
  getCompanyLeadership,
} from './sec-extractors';
import {
  extractFundTeam,
  extractPortfolioCompanies,
  extractFundData,
  knownPEFundWebsites,
} from './web-extractors';
import { lookupCIK } from './sec-edgar';

// Spider depth configurations
const depthConfig: Record<SpiderDepth, { maxHops: number; maxEntities: number }> = {
  shallow: { maxHops: 1, maxEntities: 50 },
  standard: { maxHops: 2, maxEntities: 200 },
  deep: { maxHops: 3, maxEntities: 500 },
};

/**
 * Start a spider job for a PE fund
 */
export async function spiderPEFund(
  fundName: string,
  options: {
    ticker?: string;
    website?: string;
    depth?: SpiderDepth;
  } = {}
): Promise<SpiderJob> {
  const depth = options.depth || 'standard';
  const { maxHops, maxEntities } = depthConfig[depth];

  // Resolve or create the fund organization
  const fundResult = await resolveOrganization({
    name: fundName,
    ticker: options.ticker,
    orgType: 'pe_fund',
    createIfNotFound: true,
    additionalData: {
      website: options.website || knownPEFundWebsites[fundName]?.website,
    },
  });

  const fund = fundResult.entity!;

  // Create spider job
  const job = await createSpiderJob({
    targetType: 'organization',
    targetId: fund._id!,
    targetName: fundName,
    depth,
    maxHops,
    status: 'running',
  });

  // Run spider asynchronously
  runPEFundSpider(job._id!, fund, options.website, maxHops, maxEntities).catch(error => {
    console.error('[Org Spider] Spider failed:', error);
    setSpiderJobError(job._id!, error.message);
  });

  return job;
}

/**
 * Run the PE fund spider
 */
async function runPEFundSpider(
  jobId: ObjectId,
  fund: Organization,
  website: string | undefined,
  maxHops: number,
  maxEntities: number
): Promise<void> {
  let orgsFound = 0;
  let personsFound = 0;
  let relsFound = 0;

  const fundId = fund._id!;
  const fundName = fund.canonicalName;

  try {
    // Step 1: Extract team from website
    await updateSpiderJobProgress(jobId, {
      currentStep: 'Extracting team from website',
      stepsCompleted: 1,
      totalSteps: 6,
    });

    const fundWebsite = website || fund.website || knownPEFundWebsites[fundName]?.website;
    if (fundWebsite) {
      const knownUrls = knownPEFundWebsites[fundName];
      const teamPageUrl = knownUrls?.teamPage || `${fundWebsite}/team`;

      const teamData = await extractFundTeam(fundName, teamPageUrl);
      if (teamData) {
        for (const member of teamData.teamMembers) {
          const personResult = await resolveOrCreatePerson({
            name: member.name,
            organizationId: fundId,
            title: member.title,
            createIfNotFound: true,
            additionalData: {
              linkedInUrl: member.linkedIn,
              biography: member.biography,
            },
          });

          if (personResult.created) personsFound++;

          // Create relationship
          await upsertRelationship({
            sourceType: 'person',
            sourceId: personResult.entity!._id!,
            targetType: 'organization',
            targetId: fundId,
            relationshipType: mapRoleToRelationType(member.role),
            confidence: 0.9,
            metadata: { title: member.title },
            evidence: [{
              sourceType: 'website',
              sourceUrl: teamPageUrl,
              extractedAt: new Date(),
            }],
          });
          relsFound++;
        }
      }
    }

    // Step 2: Extract portfolio companies from website
    await updateSpiderJobProgress(jobId, {
      currentStep: 'Extracting portfolio companies',
      stepsCompleted: 2,
      organizationsFound: orgsFound,
      personsFound,
      relationshipsFound: relsFound,
    });

    if (fundWebsite) {
      const knownUrls = knownPEFundWebsites[fundName];
      const portfolioPageUrl = knownUrls?.portfolioPage || `${fundWebsite}/portfolio`;

      const portfolioData = await extractPortfolioCompanies(fundName, portfolioPageUrl);
      if (portfolioData) {
        for (const company of portfolioData.portfolioCompanies) {
          const companyResult = await resolveOrganization({
            name: company.name,
            orgType: 'portfolio_company',
            createIfNotFound: true,
            additionalData: {
              website: company.website,
              description: company.description,
              investmentFocus: company.sector ? [company.sector] : undefined,
            },
          });

          if (companyResult.created) orgsFound++;

          // Create portfolio relationship
          await upsertRelationship({
            sourceType: 'organization',
            sourceId: fundId,
            targetType: 'organization',
            targetId: companyResult.entity!._id!,
            relationshipType: 'portfolio_company',
            confidence: 0.95,
            metadata: {
              dealType: company.investmentType,
              exitType: company.status === 'exited' ? company.exitType : undefined,
            },
            evidence: [{
              sourceType: 'website',
              sourceUrl: portfolioPageUrl,
              extractedAt: new Date(),
            }],
          });
          relsFound++;
        }
      }
    }

    // Step 3: If fund is public, get SEC data
    await updateSpiderJobProgress(jobId, {
      currentStep: 'Extracting SEC filings data',
      stepsCompleted: 3,
      organizationsFound: orgsFound,
      personsFound,
      relationshipsFound: relsFound,
    });

    if (fund.ticker) {
      const leadership = await getCompanyLeadership(fund.ticker);

      // Add executives
      for (const exec of leadership.executives) {
        const personResult = await resolveOrCreatePerson({
          name: exec.name,
          organizationId: fundId,
          title: exec.title,
          createIfNotFound: true,
          additionalData: {
            biography: exec.biography,
          },
        });

        if (personResult.created) personsFound++;

        await upsertRelationship({
          sourceType: 'person',
          sourceId: personResult.entity!._id!,
          targetType: 'organization',
          targetId: fundId,
          relationshipType: 'executive',
          confidence: 0.95,
          metadata: { title: exec.title },
          evidence: [{
            sourceType: 'sec_filing',
            filingType: 'DEF 14A',
            extractedAt: new Date(),
          }],
        });
        relsFound++;
      }

      // Add board members
      for (const board of leadership.boardMembers) {
        const personResult = await resolveOrCreatePerson({
          name: board.name,
          organizationId: fundId,
          title: board.title || 'Board Member',
          createIfNotFound: true,
          additionalData: {
            biography: board.biography,
          },
        });

        if (personResult.created) personsFound++;

        await upsertRelationship({
          sourceType: 'person',
          sourceId: personResult.entity!._id!,
          targetType: 'organization',
          targetId: fundId,
          relationshipType: 'board_member',
          confidence: 0.95,
          metadata: { title: board.title },
          evidence: [{
            sourceType: 'sec_filing',
            filingType: 'DEF 14A',
            extractedAt: new Date(),
          }],
        });
        relsFound++;
      }

      // Add institutional holders as shareholders
      for (const holder of leadership.topInstitutionalHolders) {
        const holderResult = await resolveOrganization({
          name: holder.institutionName,
          cik: holder.cik,
          orgType: 'asset_manager',
          createIfNotFound: true,
        });

        if (holderResult.created) orgsFound++;

        await upsertRelationship({
          sourceType: 'organization',
          sourceId: holderResult.entity!._id!,
          targetType: 'organization',
          targetId: fundId,
          relationshipType: 'co_investor', // They invest in the fund
          confidence: 0.85,
          metadata: {
            ownershipPercent: holder.percentOfPortfolio,
            investmentAmount: holder.value,
          },
          evidence: [{
            sourceType: 'sec_filing',
            filingType: '13F',
            filingDate: holder.reportDate,
            extractedAt: new Date(),
          }],
        });
        relsFound++;
      }
    }

    // Step 4: Discover co-investors from portfolio overlap
    await updateSpiderJobProgress(jobId, {
      currentStep: 'Discovering co-investors',
      stepsCompleted: 4,
      organizationsFound: orgsFound,
      personsFound,
      relationshipsFound: relsFound,
    });

    // Get portfolio companies and look for co-investors
    const portfolioCompanies = await getPortfolioCompanies(fundId);
    for (const company of portfolioCompanies.slice(0, 10)) { // Limit for performance
      if (company.ticker) {
        // Get 13D/13G filings for major shareholders
        const activists = await extractFrom13DG(company.ticker);
        for (const activist of activists) {
          if (activist.percentOwnership >= 5) {
            const investorResult = await resolveOrganization({
              name: activist.filerName,
              orgType: activist.filerType === 'institution' ? 'asset_manager' : 'private_company',
              createIfNotFound: true,
            });

            if (investorResult.created) orgsFound++;

            // Check if this is a different fund (co-investor)
            if (!investorResult.entity!._id!.equals(fundId)) {
              await upsertRelationship({
                sourceType: 'organization',
                sourceId: fundId,
                targetType: 'organization',
                targetId: investorResult.entity!._id!,
                relationshipType: 'co_investor',
                confidence: 0.8,
                metadata: {},
                evidence: [{
                  sourceType: 'sec_filing',
                  filingType: '13D/13G',
                  excerpt: `Both invested in ${company.canonicalName}`,
                  extractedAt: new Date(),
                }],
              });
              relsFound++;
            }
          }
        }
      }
    }

    // Step 5: Multi-hop expansion (if depth allows)
    if (maxHops >= 2) {
      await updateSpiderJobProgress(jobId, {
        currentStep: 'Expanding network (hop 2)',
        stepsCompleted: 5,
        organizationsFound: orgsFound,
        personsFound,
        relationshipsFound: relsFound,
      });

      // Get all related organizations and spider them shallowly
      const relatedOrgs = await getPortfolioCompanies(fundId);
      const coInvestors = await getCoInvestors(fundId);

      // Spider top 5 portfolio companies for their relationships
      for (const company of relatedOrgs.slice(0, 5)) {
        if (company.ticker) {
          const companyLeadership = await getCompanyLeadership(company.ticker).catch(() => null);
          if (companyLeadership) {
            // Add executives to the network
            for (const exec of companyLeadership.executives.slice(0, 3)) {
              const personResult = await resolveOrCreatePerson({
                name: exec.name,
                organizationId: company._id!,
                title: exec.title,
                createIfNotFound: true,
              });

              if (personResult.created) personsFound++;

              await upsertRelationship({
                sourceType: 'person',
                sourceId: personResult.entity!._id!,
                targetType: 'organization',
                targetId: company._id!,
                relationshipType: 'executive',
                confidence: 0.9,
                metadata: { title: exec.title },
                evidence: [{
                  sourceType: 'sec_filing',
                  filingType: 'DEF 14A',
                  extractedAt: new Date(),
                }],
              });
              relsFound++;
            }
          }
        }

        // Check if we've hit max entities
        if (orgsFound + personsFound >= maxEntities) break;
      }
    }

    // Step 6: Final summary
    await updateSpiderJobProgress(
      jobId,
      {
        currentStep: 'Complete',
        stepsCompleted: 6,
        organizationsFound: orgsFound,
        personsFound,
        relationshipsFound: relsFound,
      },
      'completed'
    );

  } catch (error: any) {
    await setSpiderJobError(jobId, error.message);
    throw error;
  }
}

/**
 * Spider a person to find their organizational connections
 */
export async function spiderPerson(
  personName: string,
  options: {
    currentOrganizationId?: string;
    linkedInUrl?: string;
    depth?: SpiderDepth;
  } = {}
): Promise<SpiderJob> {
  const depth = options.depth || 'shallow';
  const { maxHops } = depthConfig[depth];

  // Resolve or create the person
  const personResult = await resolveOrCreatePerson({
    name: personName,
    organizationId: options.currentOrganizationId ? new ObjectId(options.currentOrganizationId) : undefined,
    createIfNotFound: true,
    additionalData: {
      linkedInUrl: options.linkedInUrl,
    },
  });

  const person = personResult.entity!;

  // Create spider job
  const job = await createSpiderJob({
    targetType: 'person',
    targetId: person._id!,
    targetName: personName,
    depth,
    maxHops,
    status: 'running',
  });

  // Run spider asynchronously
  runPersonSpider(job._id!, person).catch(error => {
    console.error('[Org Spider] Person spider failed:', error);
    setSpiderJobError(job._id!, error.message);
  });

  return job;
}

/**
 * Run the person spider
 */
async function runPersonSpider(jobId: ObjectId, person: Person): Promise<void> {
  let orgsFound = 0;
  let personsFound = 0;
  let relsFound = 0;

  try {
    await updateSpiderJobProgress(jobId, {
      currentStep: 'Finding organizational connections',
      stepsCompleted: 1,
      totalSteps: 2,
    });

    // Find all relationships for this person
    const relationships = await findRelationshipsForEntity('person', person._id!);

    // For each organization they're connected to, find colleagues
    for (const rel of relationships.slice(0, 5)) {
      if (rel.targetType === 'organization') {
        const team = await getFundTeam(rel.targetId);
        for (const colleague of team) {
          // Check if this creates a colleague relationship
          const existingRels = await findRelationshipsForEntity('person', colleague._id!);
          const isColleague = existingRels.some(r =>
            r.targetType === 'organization' && r.targetId.equals(rel.targetId)
          );

          if (isColleague && !colleague._id!.equals(person._id!)) {
            await upsertRelationship({
              sourceType: 'person',
              sourceId: person._id!,
              targetType: 'person',
              targetId: colleague._id!,
              relationshipType: 'colleague',
              confidence: 0.8,
              metadata: {},
              evidence: [{
                sourceType: 'manual',
                excerpt: 'Both work at same organization',
                extractedAt: new Date(),
              }],
            });
            relsFound++;
          }
        }
      }
    }

    await updateSpiderJobProgress(
      jobId,
      {
        currentStep: 'Complete',
        stepsCompleted: 2,
        organizationsFound: orgsFound,
        personsFound,
        relationshipsFound: relsFound,
      },
      'completed'
    );

  } catch (error: any) {
    await setSpiderJobError(jobId, error.message);
    throw error;
  }
}

/**
 * Get graph data for visualization
 */
export async function getGraphData(
  entityType: 'organization' | 'person',
  entityId: string,
  maxDepth = 2
): Promise<GraphData> {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seenNodes = new Set<string>();
  const seenEdges = new Set<string>();

  const objId = new ObjectId(entityId);

  // Add the root entity
  if (entityType === 'organization') {
    const org = await findOrganizationById(objId);
    if (org) {
      const nodeId = `org-${org._id!.toString()}`;
      nodes.push({
        id: nodeId,
        label: org.canonicalName,
        type: org.orgType === 'pe_fund' || org.orgType === 'vc_fund' ? org.orgType :
              org.orgType === 'hedge_fund' ? 'hedge_fund' :
              org.orgType === 'asset_manager' ? 'asset_manager' : 'company',
        data: {
          entityType: 'organization',
          entityId: org._id!.toString(),
          orgType: org.orgType,
          ticker: org.ticker,
          aum: org.aum,
        },
      });
      seenNodes.add(nodeId);
    }
  } else {
    const person = await findPersonById(objId);
    if (person) {
      const nodeId = `person-${person._id!.toString()}`;
      nodes.push({
        id: nodeId,
        label: person.fullName,
        type: 'person',
        data: {
          entityType: 'person',
          entityId: person._id!.toString(),
          title: person.currentRole?.title,
        },
      });
      seenNodes.add(nodeId);
    }
  }

  // BFS to expand the graph
  const queue: Array<{ id: ObjectId; type: 'organization' | 'person'; depth: number }> = [
    { id: objId, type: entityType, depth: 0 },
  ];

  while (queue.length > 0) {
    const { id, type, depth } = queue.shift()!;

    if (depth >= maxDepth) continue;

    const relationships = await findRelationshipsForEntity(type, id);

    for (const rel of relationships) {
      // Determine the other entity
      let otherType: 'organization' | 'person';
      let otherId: ObjectId;

      if (rel.sourceId.equals(id)) {
        otherType = rel.targetType;
        otherId = rel.targetId;
      } else {
        otherType = rel.sourceType;
        otherId = rel.sourceId;
      }

      const otherNodeId = `${otherType === 'organization' ? 'org' : 'person'}-${otherId.toString()}`;

      // Add node if not seen
      if (!seenNodes.has(otherNodeId)) {
        seenNodes.add(otherNodeId);

        if (otherType === 'organization') {
          const org = await findOrganizationById(otherId);
          if (org) {
            nodes.push({
              id: otherNodeId,
              label: org.canonicalName,
              type: org.orgType === 'pe_fund' || org.orgType === 'vc_fund' ? org.orgType :
                    org.orgType === 'hedge_fund' ? 'hedge_fund' :
                    org.orgType === 'asset_manager' ? 'asset_manager' : 'company',
              data: {
                entityType: 'organization',
                entityId: org._id!.toString(),
                orgType: org.orgType,
                ticker: org.ticker,
                aum: org.aum,
              },
            });

            // Add to queue for further expansion
            queue.push({ id: otherId, type: 'organization', depth: depth + 1 });
          }
        } else {
          const person = await findPersonById(otherId);
          if (person) {
            nodes.push({
              id: otherNodeId,
              label: person.fullName,
              type: 'person',
              data: {
                entityType: 'person',
                entityId: person._id!.toString(),
                title: person.currentRole?.title,
              },
            });

            queue.push({ id: otherId, type: 'person', depth: depth + 1 });
          }
        }
      }

      // Add edge if not seen
      const sourceNodeId = `${rel.sourceType === 'organization' ? 'org' : 'person'}-${rel.sourceId.toString()}`;
      const targetNodeId = `${rel.targetType === 'organization' ? 'org' : 'person'}-${rel.targetId.toString()}`;
      const edgeId = `${sourceNodeId}-${rel.relationshipType}-${targetNodeId}`;

      if (!seenEdges.has(edgeId)) {
        seenEdges.add(edgeId);

        edges.push({
          id: edgeId,
          source: sourceNodeId,
          target: targetNodeId,
          label: formatRelationshipLabel(rel.relationshipType),
          type: rel.relationshipType,
          data: {
            confidence: rel.confidence,
            startDate: rel.metadata.startDate,
            endDate: rel.metadata.endDate,
            ownershipPercent: rel.metadata.ownershipPercent,
          },
        });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Map team member role to relationship type
 */
function mapRoleToRelationType(role: string): 'partner' | 'managing_director' | 'executive' | 'advisor' | 'employee' {
  switch (role) {
    case 'partner':
      return 'partner';
    case 'managing_director':
      return 'managing_director';
    case 'principal':
    case 'vice_president':
      return 'executive';
    case 'advisor':
      return 'advisor';
    default:
      return 'employee';
  }
}

/**
 * Format relationship type for display
 */
function formatRelationshipLabel(type: string): string {
  return type.split('_').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

/**
 * Get spider job status
 */
export async function getSpiderJobStatus(jobId: string): Promise<SpiderJob | null> {
  return findSpiderJobById(jobId);
}
