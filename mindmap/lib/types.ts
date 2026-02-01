import { ObjectId } from 'mongodb';

// Actor categories
export type ActorCategory = 'organization' | 'person' | 'fund' | 'event';

// Actor subtypes
export type ActorSubtype =
  | 'accelerator' | 'incubator'
  | 'vc_fund' | 'pe_fund' | 'hedge_fund' | 'asset_manager'
  | 'public_company' | 'private_company' | 'startup'
  | 'founder' | 'investor' | 'executive' | 'board_member' | 'engineer'
  | 'conference' | 'program'
  | string; // Allow custom subtypes

// Connection categories
export type ConnectionCategory =
  // Investment
  | 'invested_in' | 'co_invested' | 'led_round' | 'limited_partner_of'
  // Governance
  | 'founded' | 'co_founded' | 'executive_at' | 'board_member_at'
  | 'partner_at' | 'advisor_to' | 'employee_at'
  // Corporate
  | 'acquired' | 'merged_with' | 'subsidiary_of' | 'strategic_partner'
  // Network
  | 'alumni_of' | 'classmate_of' | 'mentor_of' | 'graduated_from'
  | 'participated_in_batch'
  // Fund
  | 'manages_fund';

// Source evidence
export interface SourceReference {
  url: string;
  type: string;
  title?: string;
  extractedAt: Date;
  confidence: number;
  excerpt?: string;
}

// Connection evidence
export interface ConnectionEvidence {
  url?: string;
  sourceType: string;
  excerpt?: string;
  extractedAt: Date;
}

// Actor entity
export interface Actor {
  _id?: ObjectId;
  canonicalName: string;
  aliases: string[];
  slug: string;
  category: ActorCategory;
  subtype: ActorSubtype;
  properties: {
    ticker?: string;
    website?: string;
    description?: string;
    headquarters?: string;
    foundedYear?: number;
    aum?: number;
    linkedInUrl?: string;
    title?: string;
    biography?: string;
    batchNumber?: string;
    [key: string]: unknown;
  };
  tags: string[];
  sources: SourceReference[];
  connectionCount: number;
  lastCrawledAt?: Date;
  crawlDepth: number;
  createdAt: Date;
  updatedAt: Date;
}

// Connection entity
export interface Connection {
  _id?: ObjectId;
  sourceActorId: ObjectId;
  targetActorId: ObjectId;
  category: ConnectionCategory;
  directed: boolean;
  properties: {
    title?: string;
    startDate?: Date;
    endDate?: Date;
    amount?: number;
    ownershipPercent?: number;
    round?: string;
    batchNumber?: string;
    [key: string]: unknown;
  };
  confidence: number;
  evidence: ConnectionEvidence[];
  firstSeen: Date;
  lastVerified: Date;
}

// Crawl job tracking
export type CrawlJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface CrawlJobProgress {
  currentStep: string;
  stepsCompleted: number;
  totalSteps: number;
  actorsFound: number;
  connectionsFound: number;
}

export interface CrawlJob {
  _id?: ObjectId;
  seedActorIds: ObjectId[];
  seedNames: string[];
  status: CrawlJobStatus;
  progress: CrawlJobProgress;
  error?: string;
  maxDepth: number;
  maxActors: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

// Crawl queue item
export type CrawlItemType = 'web_search' | 'web_scrape' | 'sec_filing' | 'pdf_parse';

export interface CrawlQueueItem {
  _id?: ObjectId;
  jobId: ObjectId;
  actorId: ObjectId;
  actorName: string;
  itemType: CrawlItemType;
  url?: string;
  searchQuery?: string;
  priority: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  createdAt: Date;
  processedAt?: Date;
}

// Graph visualization types (Cytoscape.js compatible)
export interface GraphNode {
  id: string;
  label: string;
  category: ActorCategory;
  subtype: ActorSubtype;
  connectionCount: number;
  data: {
    slug: string;
    ticker?: string;
    title?: string;
    description?: string;
    tags: string[];
    crawlDepth: number;
    hubScore?: number;
  };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  category: ConnectionCategory;
  directed: boolean;
  data: {
    confidence: number;
    amount?: number;
    round?: string;
    title?: string;
  };
}

export interface GraphStats {
  totalActors: number;
  totalConnections: number;
  topHubs: Array<{ id: string; name: string; connectionCount: number }>;
  categories: Record<string, number>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: GraphStats;
}

// Seed data types
export type SeedActorInput = Omit<Actor, '_id' | 'createdAt' | 'updatedAt' | 'sources' | 'connectionCount' | 'lastCrawledAt'>;

export interface SeedConnectionInput {
  sourceSlug: string;
  targetSlug: string;
  category: ConnectionCategory;
  directed: boolean;
  properties?: Connection['properties'];
  confidence: number;
}

// Extraction types (from Gemini)
export interface ExtractedActor {
  name: string;
  category: ActorCategory;
  subtype: ActorSubtype;
  properties?: Record<string, unknown>;
  confidence: number;
}

export interface ExtractedConnection {
  sourceName: string;
  targetName: string;
  category: ConnectionCategory;
  directed: boolean;
  properties?: Record<string, unknown>;
  confidence: number;
  excerpt?: string;
}

export interface ExtractionResult {
  actors: ExtractedActor[];
  connections: ExtractedConnection[];
  sourceUrl?: string;
  sourceType: string;
}
