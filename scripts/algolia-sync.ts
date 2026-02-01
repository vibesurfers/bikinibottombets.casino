import 'dotenv/config';
import { MongoClient } from 'mongodb';
import algoliasearch from 'algoliasearch';

const MONGODB_URI = process.env.MONGODB_CONNECTION_URI || process.env.MONGODB_URI || '';
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

async function syncToAlgolia() {
  console.log('Starting Algolia sync...');
  console.log('MongoDB URI:', MONGODB_URI ? 'Set' : 'NOT SET');
  console.log('Algolia App ID:', ALGOLIA_APP_ID);

  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI not set');
  }

  // Connect to MongoDB
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db('active-investor');
  console.log('Connected to MongoDB');

  // Initialize Algolia
  const algoliaClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY);
  const index = algoliaClient.initIndex(ALGOLIA_INDEX);
  console.log('Algolia client initialized');

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
    highlightPreTag: '<mark>',
    highlightPostTag: '</mark>',
  });
  console.log('Index settings configured');

  // Fetch all data
  const agents = await db.collection('agents').find({}).toArray();
  const findings = await db.collection('findings').find({}).toArray();
  const inquisitions = await db.collection('inquisitions').find({}).toArray();

  console.log(`Found: ${agents.length} agents, ${findings.length} findings, ${inquisitions.length} inquisitions`);

  // Build agent name lookup
  const agentMap = new Map<string, string>();
  agents.forEach((a: any) => agentMap.set(a.moltbookId, a.moltbookName));

  // Build Algolia records
  const records: AlgoliaRecord[] = [];

  // Agent join events
  agents.forEach((agent: any) => {
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
      timestampISO: new Date(agent.registeredAt).toISOString(),
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
        timestampISO: new Date(agent.lastActiveAt || agent.registeredAt).toISOString(),
      });
    }
  });

  // Finding events
  findings.forEach((finding: any) => {
    const agentName = finding.createdBy ? (agentMap.get(finding.createdBy) || finding.createdBy) : 'System';
    const timestamp = new Date(finding.createdAt).getTime();

    // Truncate description to avoid hitting Algolia's 10KB limit
    let description = finding.structuredData?.keyPoints?.join('. ') || `${finding.findingType} analysis for ${finding.company}`;
    if (description.length > 2000) {
      description = description.substring(0, 2000) + '...';
    }

    records.push({
      objectID: `finding-${finding._id}`,
      eventType: 'finding_published',
      title: (finding.title || `New ${finding.findingType} finding for ${finding.company}`).substring(0, 500),
      description,
      agentName,
      agentId: finding.createdBy,
      company: finding.company,
      ticker: finding.ticker,
      timestamp,
      timestampISO: new Date(finding.createdAt).toISOString(),
      metadata: {
        sourceUrl: finding.sourceUrl,
        findingType: finding.findingType,
        source: finding.source,
      },
    });
  });

  // Inquisition events
  inquisitions.forEach((inq: any) => {
    const agentName = agentMap.get(inq.proposedBy) || inq.proposedBy || 'Unknown Agent';
    const timestamp = new Date(inq.createdAt).getTime();

    // Research started / investigation proposed
    let inqDescription = (inq.targetDescription || '').substring(0, 2000);
    records.push({
      objectID: `inq-${inq._id}`,
      eventType: inq.status === 'approved' ? 'inquisition_approved' : 'research_started',
      title: inq.status === 'approved'
        ? `${inq.targetCompany} inquisition approved by the swarm`
        : `Investigation proposed for ${inq.targetCompany}`,
      description: inqDescription,
      agentName,
      agentId: inq.proposedBy,
      company: inq.targetCompany,
      karma: inq.karmaForApproval || 0,
      timestamp,
      timestampISO: new Date(inq.createdAt).toISOString(),
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
        timestampISO: new Date(inq.resolvedAt || inq.createdAt).toISOString(),
      });
    }

    // Vote events
    inq.votes?.forEach((vote: any) => {
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
        timestampISO: new Date(vote.votedAt).toISOString(),
      });
    });
  });

  console.log(`Prepared ${records.length} records for indexing`);

  // Clear existing index
  await index.clearObjects();
  console.log('Cleared existing index');

  // Batch save to Algolia
  const { objectIDs } = await index.saveObjects(records);
  console.log(`Indexed ${objectIDs.length} records to Algolia`);

  // Close MongoDB
  await client.close();

  console.log('Sync complete!');
  return {
    indexed: objectIDs.length,
    breakdown: {
      agents: agents.length,
      findings: findings.length,
      inquisitions: inquisitions.length,
    },
  };
}

syncToAlgolia()
  .then(result => {
    console.log('Result:', result);
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
