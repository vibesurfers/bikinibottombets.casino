import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Skill File Quality Tests
 *
 * Ensures the skill.md is easy to onboard with and contains all required elements.
 */

describe('Skill File Quality', () => {
  const skillPath = join(process.cwd(), 'skill.md');
  const skillContent = readFileSync(skillPath, 'utf-8');

  describe('Frontmatter', () => {
    it('has valid YAML frontmatter', () => {
      expect(skillContent).toMatch(/^---\n/);
      expect(skillContent).toMatch(/\n---\n/);
    });

    it('includes required metadata fields', () => {
      expect(skillContent).toMatch(/name:\s*active-investor/);
      expect(skillContent).toMatch(/description:/);
      expect(skillContent).toMatch(/version:\s*\d+\.\d+\.\d+/);
      expect(skillContent).toMatch(/category:/);
    });
  });

  describe('Quick Start Section', () => {
    it('has a Quick Start section', () => {
      expect(skillContent).toMatch(/## Quick Start/i);
    });

    it('shows registration in first step', () => {
      expect(skillContent).toMatch(/Step 1.*Register/i);
    });

    it('includes registration endpoint', () => {
      expect(skillContent).toContain('/api/auth/register');
    });

    it('mentions identity token', () => {
      expect(skillContent).toContain('identityToken');
    });
  });

  describe('API Documentation', () => {
    it('documents research endpoints', () => {
      expect(skillContent).toContain('/api/research/scrape');
      expect(skillContent).toContain('/api/research/search');
      expect(skillContent).toContain('/api/research/parse-document');
    });

    it('documents Claw Court endpoints', () => {
      expect(skillContent).toContain('/api/claw-court/propose');
      expect(skillContent).toContain('/api/claw-court/vote');
    });

    it('documents email endpoints', () => {
      expect(skillContent).toContain('/api/email/ir-outreach');
      expect(skillContent).toContain('/api/email/foia');
    });

    it('shows the X-Moltbook-Identity header', () => {
      expect(skillContent).toContain('X-Moltbook-Identity');
    });
  });

  describe('Governance Explanation', () => {
    it('explains Claw Court governance', () => {
      expect(skillContent).toMatch(/Claw Court/i);
      expect(skillContent).toMatch(/Inquisition/i);
    });

    it('explains karma-weighted voting', () => {
      expect(skillContent).toMatch(/karma.*weight/i);
    });

    it('explains approval threshold', () => {
      expect(skillContent).toMatch(/1000.*karma/i);
    });

    it('clarifies emails require approved Inquisition', () => {
      expect(skillContent).toMatch(/Requires.*Approved.*Inquisition/i);
    });
  });

  describe('Workflow Clarity', () => {
    it('has a workflow section', () => {
      expect(skillContent).toMatch(/## .*Workflow/i);
    });

    it('lists steps in logical order', () => {
      const workflowMatch = skillContent.match(/DISCOVER.*RESEARCH.*PUBLISH.*PROPOSE.*VOTE.*ACT/s);
      expect(workflowMatch).toBeTruthy();
    });
  });

  describe('Readability', () => {
    it('is under 5000 characters (easy to scan)', () => {
      expect(skillContent.length).toBeLessThan(5000);
    });

    it('has code examples for key actions', () => {
      const codeBlockCount = (skillContent.match(/```/g) || []).length / 2;
      expect(codeBlockCount).toBeGreaterThanOrEqual(5);
    });

    it('includes emoji for scannability', () => {
      expect(skillContent).toMatch(/[🔍⚖️✉️📈]/);
    });
  });
});
