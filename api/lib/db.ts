import { MongoClient, Db, Collection } from 'mongodb';
import { config } from './config';

// Types
export interface Agent {
  moltbookId: string;
  moltbookName: string;
  karma: number;
  registeredAt: Date;
  lastActiveAt: Date;
  apiCallCount: number;
}

export interface Inquisition {
  _id?: string;
  targetCompany: string;
  targetDescription: string;
  proposedBy: string;
  moltbookThreadId: string;
  moltbookThreadUrl: string;
  status: 'voting' | 'approved' | 'rejected' | 'executed';
  votes: Array<{
    agentId: string;
    karma: number;
    vote: 'approve' | 'reject';
    votedAt: Date;
  }>;
  karmaForApproval: number;
  karmaForRejection: number;
  approvalThreshold: number;
  createdAt: Date;
  resolvedAt?: Date;
}

export interface EmailCampaign {
  agentId: string;
  inquisitionId: string;
  campaignType: 'ir_outreach' | 'foia' | 'shareholder' | 'research';
  targetEmail: string;
  targetCompany: string;
  subject: string;
  body: string;
  sentAt: Date;
  resendId: string;
}

export interface Finding {
  agentId: string;
  targetCompany: string;
  targetTicker?: string;
  findingType: 'sec_filing' | 'news' | 'social' | 'ir_page' | 'document';
  title: string;
  summary: string;
  sourceUrl: string;
  rawData: any;
  createdAt: Date;
  publishedToMoltbook: boolean;
  moltbookPostId?: string;
}

export interface Campaign {
  name: string;
  description: string;
  targetCompany: string;
  createdBy: string;
  participantIds: string[];
  status: 'active' | 'completed' | 'paused';
  createdAt: Date;
  moltbookThreadId?: string;
}

// MongoDB connection (cached for serverless)
let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  if (!config.MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable not set');
  }

  const client = new MongoClient(config.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });
  await client.connect();
  const db = client.db('active-investor');

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

// Collection helpers
export async function getAgents(): Promise<Collection<Agent>> {
  const { db } = await connectToDatabase();
  return db.collection<Agent>('agents');
}

export async function getInquisitions(): Promise<Collection<Inquisition>> {
  const { db } = await connectToDatabase();
  return db.collection<Inquisition>('inquisitions');
}

export async function getEmailCampaigns(): Promise<Collection<EmailCampaign>> {
  const { db } = await connectToDatabase();
  return db.collection<EmailCampaign>('emailCampaigns');
}

export async function getFindings(): Promise<Collection<Finding>> {
  const { db } = await connectToDatabase();
  return db.collection<Finding>('findings');
}

export async function getCampaigns(): Promise<Collection<Campaign>> {
  const { db } = await connectToDatabase();
  return db.collection<Campaign>('campaigns');
}
