import algoliasearch from 'algoliasearch';
import { connectToDatabase, Agent, Inquisition } from './db';
import { Finding as ResearchFinding } from './research-types';

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

/**
 * Sync a single inquisition to Algolia (incremental update)
 */
export async function syncInquisitionToAlgolia(inq: Inquisition, agentName?: string): Promise<void> {
  try {
    const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY);
    const index = client.initIndex(ALGOLIA_INDEX);

    const records: AlgoliaRecord[] = [];
    const timestamp = new Date(inq.createdAt).getTime();
    const resolvedAgentName = agentName || inq.proposedBy || 'Unknown Agent';

    // Main inquisition record
    records.push({
      objectID: `inq-${inq._id}`,
      eventType: inq.status === 'approved' ? 'inquisition_approved' : 'research_started',
      title: inq.status === 'approved'
        ? `${inq.targetCompany} inquisition approved by the swarm`
        : `Investigation proposed for ${inq.targetCompany}`,
      description: inq.targetDescription,
      agentName: resolvedAgentName,
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
    inq.votes?.forEach(vote => {
      const voteTimestamp = new Date(vote.votedAt).getTime();
      records.push({
        objectID: `vote-${inq._id}-${vote.agentId}`,
        eventType: 'vote_cast',
        title: `Agent voted to ${vote.vote} investigation`,
        description: `A karma-weighted vote of ${vote.karma} has been cast ${vote.vote === 'approve' ? 'in favor of' : 'against'} the ${inq.targetCompany} inquiry.`,
        agentName: vote.agentId,
        agentId: vote.agentId,
        company: inq.targetCompany,
        karma: vote.karma,
        timestamp: voteTimestamp,
        timestampISO: new Date(vote.votedAt).toISOString(),
      });
    });

    await index.saveObjects(records);
    console.log(`Synced inquisition ${inq._id} to Algolia (${records.length} records)`);
  } catch (error) {
    console.error('Failed to sync inquisition to Algolia:', error);
    // Don't throw - Algolia sync failure shouldn't break the main flow
  }
}

/**
 * Trigger Algolia sync in background (fire-and-forget)
 * Use this when you want to sync without blocking the response
 */
export function triggerAlgoliaSync(inq: Inquisition, agentName?: string): void {
  // Fire and forget - don't await
  syncInquisitionToAlgolia(inq, agentName).catch(err => {
    console.error('Background Algolia sync failed:', err);
  });
}

/**
 * Sync a single finding to Algolia (incremental update)
 */
export async function syncFindingToAlgolia(finding: ResearchFinding, agentName?: string): Promise<void> {
  try {
    const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY);
    const index = client.initIndex(ALGOLIA_INDEX);

    const timestamp = new Date(finding.createdAt).getTime();
    const resolvedAgentName = agentName || finding.createdBy || 'System';

    const record: AlgoliaRecord = {
      objectID: `finding-${finding._id}`,
      eventType: 'finding_published',
      title: truncate(finding.title || `New ${finding.findingType} finding for ${finding.company}`, 200),
      description: truncate(finding.structuredData?.keyPoints?.join('. ') || `${finding.findingType} analysis for ${finding.company}`, 1000),
      agentName: resolvedAgentName,
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
    };

    await index.saveObject(record);
    console.log(`Synced finding ${finding._id} to Algolia`);
  } catch (error) {
    console.error('Failed to sync finding to Algolia:', error);
    // Don't throw - Algolia sync failure shouldn't break the main flow
  }
}

/**
 * Trigger finding Algolia sync in background (fire-and-forget)
 */
export function triggerFindingAlgoliaSync(finding: ResearchFinding, agentName?: string): void {
  syncFindingToAlgolia(finding, agentName).catch(err => {
    console.error('Background Algolia finding sync failed:', err);
  });
}
