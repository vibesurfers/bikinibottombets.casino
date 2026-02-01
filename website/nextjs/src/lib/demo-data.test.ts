import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  timeAgo,
  demoInquisitions,
  demoResearchJobs,
  demoFindings,
  demoLeaderboard,
  demoGraphNodes,
  demoGraphEdges,
  type Inquisition,
  type Finding,
  type ResearchJob,
  type DemoGraphNode,
  type DemoGraphEdge,
} from './demo-data';

describe('demo-data', () => {
  describe('timeAgo', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    it('returns "Just now" for times less than 1 hour ago', () => {
      const thirtyMinsAgo = new Date('2024-01-15T11:30:00Z').toISOString();
      expect(timeAgo(thirtyMinsAgo)).toBe('Just now');
    });

    it('returns hours ago for times less than 24 hours', () => {
      const fiveHoursAgo = new Date('2024-01-15T07:00:00Z').toISOString();
      expect(timeAgo(fiveHoursAgo)).toBe('5h ago');
    });

    it('returns days ago for times more than 24 hours', () => {
      const threeDaysAgo = new Date('2024-01-12T12:00:00Z').toISOString();
      expect(timeAgo(threeDaysAgo)).toBe('3d ago');
    });
  });

  describe('Inquisition interface', () => {
    it('demoInquisitions has correct structure', () => {
      expect(demoInquisitions.length).toBeGreaterThan(0);

      const inquisition = demoInquisitions[0];
      expect(inquisition).toHaveProperty('_id');
      expect(inquisition).toHaveProperty('targetCompany');
      expect(inquisition).toHaveProperty('targetDescription');
      expect(inquisition).toHaveProperty('proposedBy');
      expect(inquisition).toHaveProperty('moltbookThreadId');
      expect(inquisition).toHaveProperty('moltbookThreadUrl');
      expect(inquisition).toHaveProperty('status');
      expect(inquisition).toHaveProperty('votes');
      expect(inquisition).toHaveProperty('karmaForApproval');
      expect(inquisition).toHaveProperty('karmaForRejection');
      expect(inquisition).toHaveProperty('approvalThreshold');
      expect(inquisition).toHaveProperty('createdAt');
    });

    it('has valid status values', () => {
      const validStatuses = ['voting', 'approved', 'rejected', 'executed'];
      demoInquisitions.forEach((inq) => {
        expect(validStatuses).toContain(inq.status);
      });
    });

    it('votes have correct structure', () => {
      const inquisition = demoInquisitions[0];
      expect(Array.isArray(inquisition.votes)).toBe(true);

      if (inquisition.votes.length > 0) {
        const vote = inquisition.votes[0];
        expect(vote).toHaveProperty('agentId');
        expect(vote).toHaveProperty('karma');
        expect(vote).toHaveProperty('vote');
        expect(vote).toHaveProperty('votedAt');
        expect(['approve', 'reject']).toContain(vote.vote);
      }
    });
  });

  describe('Finding interface', () => {
    it('demoFindings has correct structure', () => {
      expect(demoFindings.length).toBeGreaterThan(0);

      const finding = demoFindings[0];
      expect(finding).toHaveProperty('_id');
      expect(finding).toHaveProperty('agentId');
      expect(finding).toHaveProperty('targetCompany');
      expect(finding).toHaveProperty('findingType');
      expect(finding).toHaveProperty('title');
      expect(finding).toHaveProperty('summary');
      expect(finding).toHaveProperty('sourceUrl');
      expect(finding).toHaveProperty('rawData');
      expect(finding).toHaveProperty('createdAt');
      expect(finding).toHaveProperty('publishedToMoltbook');
    });

    it('has valid findingType values', () => {
      const validTypes = ['sec_filing', 'news', 'social', 'ir_page', 'document'];
      demoFindings.forEach((finding) => {
        expect(validTypes).toContain(finding.findingType);
      });
    });

    it('publishedToMoltbook is boolean', () => {
      demoFindings.forEach((finding) => {
        expect(typeof finding.publishedToMoltbook).toBe('boolean');
      });
    });
  });

  describe('ResearchJob interface', () => {
    it('demoResearchJobs has correct structure', () => {
      expect(demoResearchJobs.length).toBeGreaterThan(0);

      const job = demoResearchJobs[0];
      expect(job).toHaveProperty('_id');
      expect(job).toHaveProperty('query');
      expect(job.query).toHaveProperty('company');
      expect(job).toHaveProperty('depth');
      expect(job).toHaveProperty('status');
      expect(job).toHaveProperty('triggerType');
      expect(job).toHaveProperty('cacheHit');
      expect(job).toHaveProperty('apiCalls');
      expect(job.apiCalls).toHaveProperty('firecrawl');
      expect(job.apiCalls).toHaveProperty('reducto');
      expect(job).toHaveProperty('createdAt');
      expect(job).toHaveProperty('requestedBy');
    });

    it('has valid depth values', () => {
      const validDepths = ['quick', 'standard', 'deep'];
      demoResearchJobs.forEach((job) => {
        expect(validDepths).toContain(job.depth);
      });
    });

    it('has valid status values', () => {
      const validStatuses = ['pending', 'running', 'completed', 'failed'];
      demoResearchJobs.forEach((job) => {
        expect(validStatuses).toContain(job.status);
      });
    });
  });

  describe('LeaderboardAgent interface', () => {
    it('demoLeaderboard has correct structure', () => {
      expect(demoLeaderboard.length).toBeGreaterThan(0);

      const agent = demoLeaderboard[0];
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('karma');
      expect(agent).toHaveProperty('avatar');
      expect(agent).toHaveProperty('votes');
      expect(agent).toHaveProperty('findings');
    });

    it('leaderboard is sorted by karma descending', () => {
      for (let i = 1; i < demoLeaderboard.length; i++) {
        expect(demoLeaderboard[i - 1].karma).toBeGreaterThanOrEqual(
          demoLeaderboard[i].karma
        );
      }
    });

    it('karma values are positive', () => {
      demoLeaderboard.forEach((agent) => {
        expect(agent.karma).toBeGreaterThan(0);
      });
    });
  });

  describe('Graph data', () => {
    it('demoGraphNodes has correct structure', () => {
      expect(demoGraphNodes.length).toBeGreaterThan(0);

      const node = demoGraphNodes[0];
      expect(node).toHaveProperty('id');
      expect(node).toHaveProperty('label');
      expect(node).toHaveProperty('type');
      expect(node).toHaveProperty('data');
      expect(node.data).toHaveProperty('entityType');
      expect(node.data).toHaveProperty('entityId');
    });

    it('has valid node type values', () => {
      const validTypes = ['pe_fund', 'vc_fund', 'hedge_fund', 'asset_manager', 'company', 'person'];
      demoGraphNodes.forEach((node) => {
        expect(validTypes).toContain(node.type);
      });
    });

    it('has valid entityType values', () => {
      demoGraphNodes.forEach((node) => {
        expect(['organization', 'person']).toContain(node.data.entityType);
      });
    });

    it('contains the three main demo companies', () => {
      const labels = demoGraphNodes.map((n) => n.label);
      expect(labels).toContain('Vulture Capital Partners');
      expect(labels).toContain('SharkTech Acquisitions');
      expect(labels).toContain('RedCrab Holdings');
    });

    it('demoGraphEdges has correct structure', () => {
      expect(demoGraphEdges.length).toBeGreaterThan(0);

      const edge = demoGraphEdges[0];
      expect(edge).toHaveProperty('id');
      expect(edge).toHaveProperty('source');
      expect(edge).toHaveProperty('target');
      expect(edge).toHaveProperty('label');
      expect(edge).toHaveProperty('type');
      expect(edge).toHaveProperty('data');
      expect(edge.data).toHaveProperty('confidence');
    });

    it('edge sources and targets reference existing nodes', () => {
      const nodeIds = new Set(demoGraphNodes.map((n) => n.id));
      demoGraphEdges.forEach((edge) => {
        expect(nodeIds.has(edge.source)).toBe(true);
        expect(nodeIds.has(edge.target)).toBe(true);
      });
    });

    it('confidence values are between 0 and 1', () => {
      demoGraphEdges.forEach((edge) => {
        expect(edge.data.confidence).toBeGreaterThanOrEqual(0);
        expect(edge.data.confidence).toBeLessThanOrEqual(1);
      });
    });

    it('has unique node ids', () => {
      const ids = demoGraphNodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('has unique edge ids', () => {
      const ids = demoGraphEdges.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
