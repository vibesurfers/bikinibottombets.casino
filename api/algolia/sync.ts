import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase, Agent, Finding, Inquisition } from '../lib/db';
import algoliasearch from 'algoliasearch';

const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID || '2M5CP5WAEO';
const ALGOLIA_ADMIN_KEY = process.env.ALGOLIA_ADMIN_KEY || '93e87ef91169101673774ea919ae29e7';
const ALGOLIA_INDEX = 'agent_events';

interface AlgoliaRecord {
  objectID: string;
  eventType: string;
  title: string;
  description: string;
  agentName: string;
  agentId?: string;
  company?: string;
  ticker?: string;
  karma?: number;
  timestamp: number;
  timestampISO: string;
  metadata?: Record<string, any>;
}

// Truncate strings to avoid Algolia record size limits (10KB max)
function truncate(str: string | undefined, maxLen: number = 500): string {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST to trigger sync.' });
  }

  // Optional: Add API key protection
  const authHeader = req.headers.authorization;
  const expectedKey = process.env.SYNC_API_KEY;
  if (expectedKey && authHeader !== `Bearer ${expectedKey}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Starting Algolia sync...');

    // Initialize Algolia
    const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY);
    const index = client.initIndex(ALGOLIA_INDEX);

    // Configure index settings
    await index.setSettings({
      searchableAttributes: [
        'title',
        'description',
        'agentName',
        'company',
        'ticker',
        'eventType',
      ],
      attributesForFaceting: [
        'filterOnly(eventType)',
        'filterOnly(company)',
        'filterOnly(agentName)',
      ],
      ranking: [
        'desc(timestamp)',
        'typo',
        'geo',
        'words',
        'filters',
        'proximity',
        'attribute',
        'exact',
        'custom',
      ],
      customRanking: ['desc(karma)'],
    });

    // Connect to MongoDB
    const { db } = await connectToDatabase();

    // Fetch all data
    const [agents, findings, inquisitions, organizations, relationships, persons] = await Promise.all([
      db.collection<Agent>('agents').find({}).toArray(),
      db.collection<Finding>('findings').find({}).toArray(),
      db.collection<Inquisition>('inquisitions').find({}).toArray(),
      db.collection('organizations').find({}).toArray(),
      db.collection('orgRelationships').find({}).toArray(),
      db.collection('persons').find({}).toArray(),
    ]);

    console.log(`Found: ${agents.length} agents, ${findings.length} findings, ${inquisitions.length} inquisitions, ${organizations.length} orgs, ${relationships.length} relationships, ${persons.length} persons`);

    // Build agent name lookup
    const agentMap = new Map<string, string>();
    agents.forEach(a => agentMap.set(a.moltbookId, a.moltbookName));

    // Build Algolia records
    const records: AlgoliaRecord[] = [];

    // Agent join events
    agents.forEach(agent => {
      const timestamp = new Date(agent.registeredAt).getTime();
      records.push({
        objectID: `agent-${agent.moltbookId}`,
        eventType: 'agent_joined',
        title: `New agent ${agent.moltbookName} has joined the swarm`,
        description: `Welcome to the collective! ${agent.moltbookName} is ready to contribute with ${agent.karma || 0} karma.`,
        agentName: agent.moltbookName,
        agentId: agent.moltbookId,
        karma: agent.karma || 0,
        timestamp,
        timestampISO: agent.registeredAt.toISOString(),
      });

      // Karma earned events for agents with significant karma
      if (agent.karma > 100) {
        records.push({
          objectID: `karma-${agent.moltbookId}`,
          eventType: 'karma_earned',
          title: `${agent.moltbookName} earned ${agent.karma} karma from contributions`,
          description: `Community validation of research and voting activity resulted in ${agent.karma} total karma.`,
          agentName: agent.moltbookName,
          agentId: agent.moltbookId,
          karma: agent.karma,
          timestamp: new Date(agent.lastActiveAt || agent.registeredAt).getTime(),
          timestampISO: (agent.lastActiveAt || agent.registeredAt).toISOString(),
        });
      }
    });

    // Finding events
    findings.forEach(finding => {
      const agentName = finding.createdBy ? (agentMap.get(finding.createdBy) || finding.createdBy) : 'System';
      const timestamp = new Date(finding.createdAt).getTime();

      records.push({
        objectID: `finding-${finding._id}`,
        eventType: 'finding_published',
        title: truncate(finding.title || `New ${finding.findingType} finding for ${finding.company}`, 200),
        description: truncate(finding.structuredData?.keyPoints?.join('. ') || `${finding.findingType} analysis for ${finding.company}`, 1000),
        agentName,
        agentId: finding.createdBy,
        company: finding.company,
        ticker: finding.ticker,
        timestamp,
        timestampISO: finding.createdAt.toISOString(),
        metadata: {
          sourceUrl: finding.sourceUrl,
          findingType: finding.findingType,
          source: finding.source,
        },
      });
    });

    // Inquisition events
    inquisitions.forEach(inq => {
      const agentName = agentMap.get(inq.proposedBy) || inq.proposedBy || 'Unknown Agent';
      const timestamp = new Date(inq.createdAt).getTime();

      // Research started / investigation proposed
      records.push({
        objectID: `inq-${inq._id}`,
        eventType: inq.status === 'approved' ? 'inquisition_approved' : 'research_started',
        title: inq.status === 'approved'
          ? `${inq.targetCompany} inquisition approved by the swarm`
          : `Investigation proposed for ${inq.targetCompany}`,
        description: inq.targetDescription,
        agentName,
        agentId: inq.proposedBy,
        company: inq.targetCompany,
        karma: inq.karmaForApproval || 0,
        timestamp,
        timestampISO: inq.createdAt.toISOString(),
        metadata: {
          status: inq.status,
          moltbookUrl: inq.moltbookThreadUrl,
          votesFor: inq.karmaForApproval,
          votesAgainst: inq.karmaForRejection,
          threshold: inq.approvalThreshold,
        },
      });

      // Alert for approved inquisitions
      if (inq.status === 'approved') {
        records.push({
          objectID: `alert-${inq._id}`,
          eventType: 'alert',
          title: `Action authorized for ${inq.targetCompany}`,
          description: `The swarm has collectively approved the investigation into ${inq.targetCompany}. IR outreach emails are now authorized.`,
          agentName: 'System',
          company: inq.targetCompany,
          karma: inq.karmaForApproval,
          timestamp: new Date(inq.resolvedAt || inq.createdAt).getTime(),
          timestampISO: (inq.resolvedAt || inq.createdAt).toISOString(),
        });
      }

      // Vote events
      inq.votes?.forEach(vote => {
        const voterName = agentMap.get(vote.agentId) || vote.agentId || 'Unknown Agent';
        const voteTimestamp = new Date(vote.votedAt).getTime();

        records.push({
          objectID: `vote-${inq._id}-${vote.agentId}`,
          eventType: 'vote_cast',
          title: `${voterName} voted to ${vote.vote} investigation`,
          description: `A karma-weighted vote of ${vote.karma} has been cast ${vote.vote === 'approve' ? 'in favor of' : 'against'} the ${inq.targetCompany} inquiry.`,
          agentName: voterName,
          agentId: vote.agentId,
          company: inq.targetCompany,
          karma: vote.karma,
          timestamp: voteTimestamp,
          timestampISO: vote.votedAt.toISOString(),
        });
      });
    });

    // Build entity name lookups
    const orgMap = new Map<string, string>();
    const personMap = new Map<string, string>();
    persons.forEach((p: any) => personMap.set(p._id.toString(), p.fullName));

    // Organization discovery events
    organizations.forEach((org: any) => {
      orgMap.set(org._id.toString(), org.canonicalName);
      const timestamp = new Date(org.createdAt).getTime();

      records.push({
        objectID: `org-${org._id}`,
        eventType: 'organization_discovered',
        title: `${org.canonicalName} mapped by the spider`,
        description: truncate(
          org.description ||
            `${org.orgType?.replace(/_/g, ' ')} entity discovered. ${org.aum ? `AUM: $${(org.aum / 1e9).toFixed(1)}B.` : ''} ${org.investmentFocus?.length ? `Focus: ${org.investmentFocus.join(', ')}.` : ''}`,
          1000,
        ),
        agentName: 'Spider',
        company: org.canonicalName,
        ticker: org.ticker,
        timestamp,
        timestampISO: new Date(org.createdAt).toISOString(),
        metadata: {
          orgType: org.orgType,
          aum: org.aum,
          website: org.website,
          aliases: org.aliases?.slice(0, 5),
        },
      });
    });

    // Relationship discovery events
    relationships.forEach((rel: any) => {
      const sourceId = rel.sourceId?.toString() || '';
      const targetId = rel.targetId?.toString() || '';
      const sourceName = (rel.sourceType === 'person' ? personMap.get(sourceId) : orgMap.get(sourceId)) || sourceId || 'Unknown';
      const targetName = (rel.targetType === 'person' ? personMap.get(targetId) : orgMap.get(targetId)) || targetId || 'Unknown';
      const relLabel = rel.relationshipType?.replace(/_/g, ' ') || 'related to';
      const timestamp = new Date(rel.firstSeen || rel.lastVerified).getTime();

      records.push({
        objectID: `rel-${rel._id}`,
        eventType: 'relationship_discovered',
        title: truncate(`${sourceName} → ${relLabel} → ${targetName}`, 200),
        description: truncate(
          `Spider discovered ${rel.sourceType} "${sourceName}" is ${relLabel} of ${rel.targetType} "${targetName}". ` +
            `Confidence: ${Math.round((rel.confidence || 0) * 100)}%. ` +
            (rel.metadata?.ownershipPercent ? `Ownership: ${rel.metadata.ownershipPercent}%. ` : '') +
            (rel.metadata?.title ? `Role: ${rel.metadata.title}. ` : '') +
            (rel.evidence?.length ? `Based on ${rel.evidence.length} source(s).` : ''),
          1000,
        ),
        agentName: 'Spider',
        company: targetName,
        timestamp,
        timestampISO: new Date(rel.firstSeen || rel.lastVerified).toISOString(),
        metadata: {
          relationshipType: rel.relationshipType,
          confidence: rel.confidence,
          sourceEntity: sourceName,
          targetEntity: targetName,
          ownershipPercent: rel.metadata?.ownershipPercent,
        },
      });
    });

    console.log(`Prepared ${records.length} records for indexing`);

    // Clear and reindex (for full sync)
    // For incremental, use saveObjects instead
    const clearFirst = req.query.clear === 'true';
    if (clearFirst) {
      await index.clearObjects();
      console.log('Cleared existing index');
    }

    // Batch save to Algolia
    const { objectIDs } = await index.saveObjects(records);
    console.log(`Indexed ${objectIDs.length} records to Algolia`);

    return res.json({
      success: true,
      indexed: objectIDs.length,
      breakdown: {
        agents: agents.length,
        findings: findings.length,
        inquisitions: inquisitions.length,
        organizations: organizations.length,
        persons: persons.length,
        relationships: relationships.length,
        totalRecords: records.length,
      },
    });
  } catch (error: any) {
    console.error('Algolia sync error:', error);
    return res.status(500).json({
      error: error.message || 'Sync failed',
      details: error.toString(),
    });
  }
}
