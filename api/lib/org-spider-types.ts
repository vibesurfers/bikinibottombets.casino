import { ObjectId } from 'mongodb';

// Organization types
export type OrgType =
  | 'pe_fund'
  | 'vc_fund'
  | 'hedge_fund'
  | 'asset_manager'
  | 'portfolio_company'
  | 'public_company'
  | 'private_company';

export interface Organization {
  _id?: ObjectId;
  canonicalName: string;
  aliases: string[];
  ticker?: string;
  cik?: string;
  orgType: OrgType;
  aum?: number; // Assets Under Management in USD
  investmentFocus?: string[];
  headquarters?: {
    city?: string;
    state?: string;
    country: string;
  };
  website?: string;
  description?: string;
  foundedYear?: number;
  createdAt: Date;
  updatedAt: Date;
}

// Person types
export interface Person {
  _id?: ObjectId;
  fullName: string;
  aliases: string[];
  linkedInUrl?: string;
  currentRole?: {
    organizationId: ObjectId;
    title: string;
    startDate?: Date;
  };
  biography?: string;
  education?: Array<{
    institution: string;
    degree?: string;
    year?: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

// Relationship types
export type OrgRelationshipType =
  // Org-to-Org relationships
  | 'portfolio_company'
  | 'co_investor'
  | 'subsidiary'
  | 'strategic_partner'
  | 'customer'
  | 'supplier'
  | 'competitor'
  | 'fund_manager' // Fund managed by asset manager
  // Person-to-Org relationships
  | 'executive'
  | 'board_member'
  | 'partner'
  | 'managing_director'
  | 'founder'
  | 'advisor'
  | 'employee'
  // Person-to-Person relationships
  | 'colleague'
  | 'co_founder'
  | 'board_colleague';

export interface RelationshipEvidence {
  sourceType: 'sec_filing' | 'website' | 'news' | 'press_release' | 'manual';
  sourceUrl?: string;
  filingType?: string; // e.g., 'DEF 14A', '13D', '13F'
  filingDate?: Date;
  excerpt?: string;
  extractedAt: Date;
}

export interface OrgRelationship {
  _id?: ObjectId;
  sourceType: 'organization' | 'person';
  sourceId: ObjectId;
  targetType: 'organization' | 'person';
  targetId: ObjectId;
  relationshipType: OrgRelationshipType;
  confidence: number; // 0-1
  metadata: {
    title?: string; // For person roles
    startDate?: Date;
    endDate?: Date;
    ownershipPercent?: number;
    investmentAmount?: number;
    fundName?: string;
    dealType?: string; // e.g., 'buyout', 'growth', 'venture'
    exitType?: string; // e.g., 'ipo', 'sale', 'merger'
  };
  evidence: RelationshipEvidence[];
  firstSeen: Date;
  lastVerified: Date;
}

// Spider job types
export type SpiderDepth = 'shallow' | 'standard' | 'deep';
export type SpiderJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface SpiderJobProgress {
  currentStep: string;
  stepsCompleted: number;
  totalSteps: number;
  organizationsFound: number;
  personsFound: number;
  relationshipsFound: number;
}

export interface SpiderJob {
  _id?: ObjectId;
  targetType: 'organization' | 'person';
  targetId: ObjectId;
  targetName: string;
  depth: SpiderDepth;
  maxHops: number;
  status: SpiderJobStatus;
  progress: SpiderJobProgress;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

// Graph visualization types
export interface GraphNode {
  id: string;
  label: string;
  type: 'pe_fund' | 'vc_fund' | 'hedge_fund' | 'asset_manager' | 'company' | 'person';
  data: {
    entityType: 'organization' | 'person';
    entityId: string;
    orgType?: OrgType;
    ticker?: string;
    title?: string; // For persons
    aum?: number;
  };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  type: OrgRelationshipType;
  data: {
    confidence: number;
    startDate?: Date;
    endDate?: Date;
    ownershipPercent?: number;
  };
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// API request/response types
export interface SpiderResearchRequest {
  targetType: 'organization' | 'person';
  targetName: string;
  targetId?: string; // If already known
  depth?: SpiderDepth;
  maxHops?: number;
}

export interface SpiderResearchResponse {
  jobId: string;
  status: SpiderJobStatus;
  targetName: string;
  message: string;
}

export interface OrganizationSearchRequest {
  query: string;
  orgType?: OrgType;
  limit?: number;
}

export interface PersonSearchRequest {
  query: string;
  organizationId?: string;
  limit?: number;
}

// Top PE fund summary
export interface PEFundSummary {
  id: string;
  name: string;
  ticker?: string;
  aum?: number;
  portfolioCount: number;
  teamCount: number;
  coInvestorCount: number;
}

// SEC extraction types
export interface ExtractedExecutive {
  name: string;
  title: string;
  compensation?: {
    salary?: number;
    bonus?: number;
    stockAwards?: number;
    total?: number;
  };
  biography?: string;
}

export interface ExtractedBoardMember {
  name: string;
  title?: string;
  committees?: string[];
  independentDirector?: boolean;
  biography?: string;
}

export interface DEF14AExtraction {
  executives: ExtractedExecutive[];
  boardMembers: ExtractedBoardMember[];
  companyName: string;
  filingDate: Date;
}

export interface Filing13DGExtraction {
  filerName: string;
  filerType: 'individual' | 'institution';
  targetCompany: string;
  sharesOwned: number;
  percentOwnership: number;
  purpose: string;
  filingDate: Date;
}

export interface InstitutionalHolder {
  institutionName: string;
  cik?: string;
  sharesHeld: number;
  value: number; // In USD
  percentOfPortfolio: number;
  reportDate: Date;
}
