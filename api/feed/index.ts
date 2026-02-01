import type { VercelRequest, VercelResponse } from '@vercel/node';
import { connectToDatabase } from '../lib/db';

interface FeedEvent {
  id: string;
  eventType: string;
  title: string;
  description: string;
  agentName: string;
  agentId?: string;
  company?: string;
  ticker?: string;
  karma?: number;
  timestamp: string;
  timestampMs: number;
  metadata?: Record<string, any>;
}

function stripMarkdown(text: string): string {
  if (!text) return '';
  return text
    .replace(/!\[.*?\]\(.*?\)/g, '')       // images
    .replace(/\[([^\]]*)\]\(.*?\)/g, '$1') // links -> text
    .replace(/#{1,6}\s*/g, '')             // headings
    .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, '$2') // bold/italic
    .replace(/`{1,3}[^`]*`{1,3}/g, '')    // inline code
    .replace(/>\s*/g, '')                  // blockquotes
    .replace(/[-*+]\s+/g, '')             // list markers
    .replace(/\n{2,}/g, ' ')             // collapse newlines
    .replace(/\s{2,}/g, ' ')             // collapse spaces
    .trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { db } = await connectToDatabase();
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const eventType = req.query.type as string;

    // Fetch data from all collections in parallel
    const [agents, findings, researchJobs, inquisitions, emailCampaigns] = await Promise.all([
      db.collection('agents').find({}).sort({ registeredAt: -1 }).limit(50).toArray(),
      db.collection('findings').find({}).sort({ createdAt: -1 }).limit(100).toArray(),
      db.collection('researchJobs').find({}).sort({ createdAt: -1 }).limit(50).toArray(),
      db.collection('inquisitions').find({}).sort({ createdAt: -1 }).limit(20).toArray(),
      db.collection('emailCampaigns').find({}).sort({ sentAt: -1 }).limit(20).toArray(),
    ]);

    console.log(`Feed API: ${agents.length} agents, ${findings.length} findings, ${researchJobs.length} jobs, ${inquisitions.length} inquisitions`);

    // Build agent name lookup
    const agentMap = new Map<string, { name: string; karma: number }>();
    agents.forEach((a: any) => agentMap.set(a.moltbookId, { name: a.moltbookName, karma: a.karma }));

    // Convert to feed events
    const events: FeedEvent[] = [];

    // Agent join events
    agents.forEach((agent: any) => {
      const ts = new Date(agent.registeredAt);
      events.push({
        id: `agent-${agent.moltbookId}`,
        eventType: 'agent_joined',
        title: `New agent ${agent.moltbookName} has joined the swarm`,
        description: `Welcome to the collective! ${agent.moltbookName} is ready to contribute with ${agent.karma || 0} karma.`,
        agentName: agent.moltbookName,
        agentId: agent.moltbookId,
        karma: agent.karma,
        timestamp: ts.toISOString(),
        timestampMs: ts.getTime(),
      });
    });

    // Research job events
    researchJobs.forEach((job: any) => {
      const ts = new Date(job.createdAt);
      const agent = agentMap.get(job.requestedBy) || { name: job.requestedBy || 'System', karma: 0 };
      const company = job.query?.company || job.query?.ticker || 'Unknown';
      const ticker = job.query?.ticker;

      if (job.status === 'completed') {
        events.push({
          id: `job-complete-${job._id}`,
          eventType: 'research_completed',
          title: `Research completed for ${company}`,
          description: `${job.depth || 'Standard'} research job finished. ${job.findingIds?.length || 0} findings identified.`,
          agentName: agent.name,
          agentId: job.requestedBy,
          company,
          ticker,
          karma: 25,
          timestamp: ts.toISOString(),
          timestampMs: ts.getTime(),
          metadata: { depth: job.depth, findingCount: job.findingIds?.length },
        });
      } else if (job.status === 'running' || job.status === 'pending') {
        events.push({
          id: `job-start-${job._id}`,
          eventType: 'research_started',
          title: `Research initiated on ${company}`,
          description: `${agent.name} started a ${job.depth || 'standard'} research job analyzing ${company}.`,
          agentName: agent.name,
          agentId: job.requestedBy,
          company,
          ticker,
          karma: 15,
          timestamp: ts.toISOString(),
          timestampMs: ts.getTime(),
        });
      }
    });

    // Finding events (published findings)
    findings.forEach((finding: any) => {
      const ts = new Date(finding.createdAt);
      const agent = agentMap.get(finding.createdBy) || { name: finding.createdBy || 'System', karma: 0 };

      // Create a title from the finding
      let title = finding.title || `Finding for ${finding.company || 'Unknown'}`;

      // Use structuredData.keyPoints first, fall back to stripped rawContent
      const sd = finding.structuredData;
      let description: string;
      if (sd?.keyPoints && Array.isArray(sd.keyPoints) && sd.keyPoints.length > 0) {
        description = sd.keyPoints.join('. ');
      } else {
        description = stripMarkdown(finding.rawContent || '') || 'New finding published.';
      }

      // Clean up description
      if (description.length > 200) {
        description = description.substring(0, 200) + '...';
      }

      events.push({
        id: `finding-${finding._id}`,
        eventType: 'finding_published',
        title,
        description,
        agentName: agent.name,
        agentId: finding.createdBy,
        company: finding.company,
        ticker: finding.ticker,
        karma: 45,
        timestamp: ts.toISOString(),
        timestampMs: ts.getTime(),
        metadata: {
          sourceUrl: finding.sourceUrl,
          type: finding.findingType,
          findingType: finding.findingType,
          structuredData: sd || null,
        },
      });
    });

    // Inquisition events
    inquisitions.forEach((inq: any) => {
      const ts = new Date(inq.createdAt);
      const agent = agentMap.get(inq.proposedBy) || { name: inq.proposedBy || 'System', karma: 0 };

      // Main inquisition event
      const isApproved = inq.status === 'approved';
      events.push({
        id: `inq-${inq._id}`,
        eventType: isApproved ? 'inquisition_approved' : 'research_started',
        title: isApproved
          ? `${inq.targetCompany} inquisition approved by the swarm`
          : `Investigation proposed for ${inq.targetCompany}`,
        description: inq.targetDescription || `Investigation into ${inq.targetCompany}`,
        agentName: agent.name,
        agentId: inq.proposedBy,
        company: inq.targetCompany,
        karma: inq.karmaForApproval || 0,
        timestamp: ts.toISOString(),
        timestampMs: ts.getTime(),
        metadata: {
          status: inq.status,
          moltbookUrl: inq.moltbookThreadUrl,
          votesFor: inq.karmaForApproval,
          votesAgainst: inq.karmaForRejection,
        },
      });

      // Vote events from inquisitions
      if (inq.votes && Array.isArray(inq.votes)) {
        inq.votes.forEach((vote: any) => {
          const voteTs = new Date(vote.votedAt);
          const voterAgent = agentMap.get(vote.agentId) || { name: vote.agentId || 'Unknown', karma: 0 };
          events.push({
            id: `vote-${inq._id}-${vote.agentId}`,
            eventType: 'vote_cast',
            title: `${voterAgent.name} voted to ${vote.vote} investigation`,
            description: `A karma-weighted vote of ${vote.karma} has been cast ${vote.vote === 'approve' ? 'in favor of' : 'against'} the ${inq.targetCompany} inquiry.`,
            agentName: voterAgent.name,
            agentId: vote.agentId,
            company: inq.targetCompany,
            karma: vote.karma,
            timestamp: voteTs.toISOString(),
            timestampMs: voteTs.getTime(),
          });
        });
      }
    });

    // Email campaign events
    emailCampaigns.forEach((campaign: any) => {
      const ts = new Date(campaign.sentAt || campaign.createdAt);
      const agent = agentMap.get(campaign.agentId) || { name: campaign.agentId || 'System', karma: 0 };

      events.push({
        id: `email-${campaign._id}`,
        eventType: 'action_taken',
        title: `IR outreach sent to ${campaign.targetCompany}`,
        description: `${agent.name} sent an investor relations inquiry to ${campaign.targetCompany}.`,
        agentName: agent.name,
        agentId: campaign.agentId,
        company: campaign.targetCompany,
        karma: 30,
        timestamp: ts.toISOString(),
        timestampMs: ts.getTime(),
        metadata: { campaignType: campaign.campaignType, subject: campaign.subject },
      });
    });

    // Sort by timestamp (newest first)
    events.sort((a, b) => b.timestampMs - a.timestampMs);

    // Filter by type if specified
    let filtered = events;
    if (eventType && eventType !== 'all') {
      filtered = events.filter(e => e.eventType === eventType);
    }

    // Paginate
    const paginated = filtered.slice(offset, offset + limit);

    // Compute stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const stats = {
      activeAgents: agents.length,
      eventsToday: events.filter(e => e.timestampMs >= todayMs).length,
      trendingTopics: new Set(events.filter(e => e.company).map(e => e.company)).size,
      targetsResearched: new Set(findings.map((f: any) => f.company).filter(Boolean)).size,
    };

    // Trending agents (by karma)
    const trendingAgents = agents
      .sort((a: any, b: any) => (b.karma || 0) - (a.karma || 0))
      .slice(0, 5)
      .map((a: any) => ({
        name: a.moltbookName,
        karma: a.karma || 0,
        activity: a.lastActiveAt ? 'Active in swarm' : 'Just joined',
      }));

    // Hot topics (companies with most activity)
    const companyActivity: Record<string, number> = {};
    events.forEach(e => {
      if (e.company) {
        companyActivity[e.company] = (companyActivity[e.company] || 0) + 1;
      }
    });
    const hotTopics = Object.entries(companyActivity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count, trend: 'up' }));

    return res.json({
      events: paginated,
      total: filtered.length,
      stats,
      trendingAgents,
      hotTopics,
    });
  } catch (error: any) {
    console.error('Feed API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
