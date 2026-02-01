import { Collection, ObjectId, IndexDescription } from 'mongodb';
import { connectToDatabase } from './db';
import {
  Organization,
  Person,
  OrgRelationship,
  SpiderJob,
  OrgType,
  OrgRelationshipType,
} from './org-spider-types';

// Collection getters
export async function getOrganizations(): Promise<Collection<Organization>> {
  const { db } = await connectToDatabase();
  return db.collection<Organization>('organizations');
}

export async function getPersons(): Promise<Collection<Person>> {
  const { db } = await connectToDatabase();
  return db.collection<Person>('persons');
}

export async function getOrgRelationships(): Promise<Collection<OrgRelationship>> {
  const { db } = await connectToDatabase();
  return db.collection<OrgRelationship>('orgRelationships');
}

export async function getSpiderJobs(): Promise<Collection<SpiderJob>> {
  const { db } = await connectToDatabase();
  return db.collection<SpiderJob>('spiderJobs');
}

// Index definitions
const organizationIndexes: IndexDescription[] = [
  { key: { canonicalName: 1 }, unique: true },
  { key: { aliases: 1 } },
  { key: { ticker: 1 }, sparse: true },
  { key: { cik: 1 }, sparse: true },
  { key: { orgType: 1 } },
  { key: { canonicalName: 'text', aliases: 'text' } },
  { key: { updatedAt: -1 } },
];

const personIndexes: IndexDescription[] = [
  { key: { fullName: 1 } },
  { key: { aliases: 1 } },
  { key: { 'currentRole.organizationId': 1 } },
  { key: { fullName: 'text', aliases: 'text' } },
  { key: { updatedAt: -1 } },
];

const orgRelationshipIndexes: IndexDescription[] = [
  { key: { sourceType: 1, sourceId: 1 } },
  { key: { targetType: 1, targetId: 1 } },
  { key: { sourceId: 1, targetId: 1, relationshipType: 1 }, unique: true },
  { key: { relationshipType: 1 } },
  { key: { confidence: -1 } },
  { key: { lastVerified: -1 } },
];

const spiderJobIndexes: IndexDescription[] = [
  { key: { targetType: 1, targetId: 1 } },
  { key: { status: 1 } },
  { key: { createdAt: -1 } },
];

// Ensure indexes exist
export async function ensureOrgSpiderIndexes(): Promise<void> {
  const [orgs, persons, rels, jobs] = await Promise.all([
    getOrganizations(),
    getPersons(),
    getOrgRelationships(),
    getSpiderJobs(),
  ]);

  await Promise.all([
    orgs.createIndexes(organizationIndexes),
    persons.createIndexes(personIndexes),
    rels.createIndexes(orgRelationshipIndexes),
    jobs.createIndexes(spiderJobIndexes),
  ]);
}

// Organization CRUD helpers
export async function createOrganization(org: Omit<Organization, '_id' | 'createdAt' | 'updatedAt'>): Promise<Organization> {
  const orgs = await getOrganizations();
  const now = new Date();
  const doc: Organization = {
    ...org,
    createdAt: now,
    updatedAt: now,
  };
  const result = await orgs.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function findOrganizationById(id: ObjectId | string): Promise<Organization | null> {
  const orgs = await getOrganizations();
  const objectId = typeof id === 'string' ? new ObjectId(id) : id;
  return orgs.findOne({ _id: objectId });
}

export async function findOrganizationByName(name: string): Promise<Organization | null> {
  const orgs = await getOrganizations();
  return orgs.findOne({
    $or: [
      { canonicalName: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') } },
      { aliases: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') } },
    ],
  });
}

export async function findOrganizationByTicker(ticker: string): Promise<Organization | null> {
  const orgs = await getOrganizations();
  return orgs.findOne({ ticker: ticker.toUpperCase() });
}

export async function findOrganizationByCik(cik: string): Promise<Organization | null> {
  const orgs = await getOrganizations();
  return orgs.findOne({ cik });
}

export async function searchOrganizations(
  query: string,
  orgType?: OrgType,
  limit = 20
): Promise<Organization[]> {
  const orgs = await getOrganizations();
  const filter: any = {
    $or: [
      { canonicalName: { $regex: escapeRegex(query), $options: 'i' } },
      { aliases: { $regex: escapeRegex(query), $options: 'i' } },
      { ticker: { $regex: escapeRegex(query), $options: 'i' } },
    ],
  };
  if (orgType) {
    filter.orgType = orgType;
  }
  return orgs.find(filter).sort({ updatedAt: -1 }).limit(limit).toArray();
}

export async function updateOrganization(
  id: ObjectId | string,
  update: Partial<Organization>
): Promise<boolean> {
  const orgs = await getOrganizations();
  const objectId = typeof id === 'string' ? new ObjectId(id) : id;
  const result = await orgs.updateOne(
    { _id: objectId },
    { $set: { ...update, updatedAt: new Date() } }
  );
  return result.modifiedCount > 0;
}

// Person CRUD helpers
export async function createPerson(person: Omit<Person, '_id' | 'createdAt' | 'updatedAt'>): Promise<Person> {
  const persons = await getPersons();
  const now = new Date();
  const doc: Person = {
    ...person,
    createdAt: now,
    updatedAt: now,
  };
  const result = await persons.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function findPersonById(id: ObjectId | string): Promise<Person | null> {
  const persons = await getPersons();
  const objectId = typeof id === 'string' ? new ObjectId(id) : id;
  return persons.findOne({ _id: objectId });
}

export async function findPersonByName(name: string): Promise<Person | null> {
  const persons = await getPersons();
  const normalized = normalizeName(name);
  return persons.findOne({
    $or: [
      { fullName: { $regex: new RegExp(`^${escapeRegex(normalized)}$`, 'i') } },
      { aliases: { $regex: new RegExp(`^${escapeRegex(normalized)}$`, 'i') } },
    ],
  });
}

export async function searchPersons(
  query: string,
  organizationId?: ObjectId | string,
  limit = 20
): Promise<Person[]> {
  const persons = await getPersons();
  const filter: any = {
    $or: [
      { fullName: { $regex: escapeRegex(query), $options: 'i' } },
      { aliases: { $regex: escapeRegex(query), $options: 'i' } },
    ],
  };
  if (organizationId) {
    const objId = typeof organizationId === 'string' ? new ObjectId(organizationId) : organizationId;
    filter['currentRole.organizationId'] = objId;
  }
  return persons.find(filter).sort({ updatedAt: -1 }).limit(limit).toArray();
}

export async function updatePerson(
  id: ObjectId | string,
  update: Partial<Person>
): Promise<boolean> {
  const persons = await getPersons();
  const objectId = typeof id === 'string' ? new ObjectId(id) : id;
  const result = await persons.updateOne(
    { _id: objectId },
    { $set: { ...update, updatedAt: new Date() } }
  );
  return result.modifiedCount > 0;
}

// Relationship CRUD helpers
export async function createRelationship(
  rel: Omit<OrgRelationship, '_id' | 'firstSeen' | 'lastVerified'>
): Promise<OrgRelationship> {
  const rels = await getOrgRelationships();
  const now = new Date();
  const doc: OrgRelationship = {
    ...rel,
    firstSeen: now,
    lastVerified: now,
  };
  const result = await rels.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function findRelationship(
  sourceId: ObjectId,
  targetId: ObjectId,
  relationshipType: OrgRelationshipType
): Promise<OrgRelationship | null> {
  const rels = await getOrgRelationships();
  return rels.findOne({ sourceId, targetId, relationshipType });
}

export async function upsertRelationship(
  rel: Omit<OrgRelationship, '_id' | 'firstSeen' | 'lastVerified'>
): Promise<OrgRelationship> {
  const rels = await getOrgRelationships();
  const now = new Date();
  const existing = await findRelationship(rel.sourceId, rel.targetId, rel.relationshipType);

  if (existing) {
    // Merge evidence and update
    const mergedEvidence = [...existing.evidence, ...rel.evidence];
    await rels.updateOne(
      { _id: existing._id },
      {
        $set: {
          confidence: Math.max(existing.confidence, rel.confidence),
          metadata: { ...existing.metadata, ...rel.metadata },
          evidence: mergedEvidence,
          lastVerified: now,
        },
      }
    );
    return { ...existing, ...rel, evidence: mergedEvidence, lastVerified: now };
  }

  return createRelationship(rel);
}

export async function findRelationshipsForEntity(
  entityType: 'organization' | 'person',
  entityId: ObjectId | string,
  direction: 'outgoing' | 'incoming' | 'both' = 'both'
): Promise<OrgRelationship[]> {
  const rels = await getOrgRelationships();
  const objId = typeof entityId === 'string' ? new ObjectId(entityId) : entityId;

  const queries: any[] = [];
  if (direction === 'outgoing' || direction === 'both') {
    queries.push({ sourceType: entityType, sourceId: objId });
  }
  if (direction === 'incoming' || direction === 'both') {
    queries.push({ targetType: entityType, targetId: objId });
  }

  return rels.find({ $or: queries }).sort({ confidence: -1 }).toArray();
}

// Spider job helpers
export async function createSpiderJob(
  job: Omit<SpiderJob, '_id' | 'createdAt' | 'progress'>
): Promise<SpiderJob> {
  const jobs = await getSpiderJobs();
  const doc: SpiderJob = {
    ...job,
    progress: {
      currentStep: 'Initializing',
      stepsCompleted: 0,
      totalSteps: 0,
      organizationsFound: 0,
      personsFound: 0,
      relationshipsFound: 0,
    },
    createdAt: new Date(),
  };
  const result = await jobs.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

export async function findSpiderJobById(id: ObjectId | string): Promise<SpiderJob | null> {
  const jobs = await getSpiderJobs();
  const objectId = typeof id === 'string' ? new ObjectId(id) : id;
  return jobs.findOne({ _id: objectId });
}

export async function updateSpiderJobProgress(
  id: ObjectId | string,
  progress: Partial<SpiderJob['progress']>,
  status?: SpiderJob['status']
): Promise<boolean> {
  const jobs = await getSpiderJobs();
  const objectId = typeof id === 'string' ? new ObjectId(id) : id;

  const update: any = {};
  for (const [key, value] of Object.entries(progress)) {
    update[`progress.${key}`] = value;
  }
  if (status) {
    update.status = status;
    if (status === 'running') {
      update.startedAt = new Date();
    } else if (status === 'completed' || status === 'failed') {
      update.completedAt = new Date();
    }
  }

  const result = await jobs.updateOne({ _id: objectId }, { $set: update });
  return result.modifiedCount > 0;
}

export async function setSpiderJobError(
  id: ObjectId | string,
  error: string
): Promise<boolean> {
  const jobs = await getSpiderJobs();
  const objectId = typeof id === 'string' ? new ObjectId(id) : id;
  const result = await jobs.updateOne(
    { _id: objectId },
    { $set: { status: 'failed', error, completedAt: new Date() } }
  );
  return result.modifiedCount > 0;
}

// Utility functions
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,]/g, '')
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// PE Fund specific queries
export async function getTopPEFunds(limit = 20): Promise<Organization[]> {
  const orgs = await getOrganizations();
  return orgs
    .find({ orgType: { $in: ['pe_fund', 'asset_manager'] } })
    .sort({ aum: -1 })
    .limit(limit)
    .toArray();
}

export async function getPortfolioCompanies(fundId: ObjectId | string): Promise<Organization[]> {
  const objId = typeof fundId === 'string' ? new ObjectId(fundId) : fundId;
  const rels = await getOrgRelationships();
  const portfolioRels = await rels
    .find({
      sourceType: 'organization',
      sourceId: objId,
      relationshipType: 'portfolio_company',
    })
    .toArray();

  if (portfolioRels.length === 0) return [];

  const orgs = await getOrganizations();
  const companyIds = portfolioRels.map(r => r.targetId);
  return orgs.find({ _id: { $in: companyIds } }).toArray();
}

export async function getFundTeam(fundId: ObjectId | string): Promise<Person[]> {
  const objId = typeof fundId === 'string' ? new ObjectId(fundId) : fundId;
  const rels = await getOrgRelationships();
  const teamRels = await rels
    .find({
      targetType: 'organization',
      targetId: objId,
      sourceType: 'person',
      relationshipType: { $in: ['partner', 'managing_director', 'executive', 'advisor'] },
    })
    .toArray();

  if (teamRels.length === 0) return [];

  const persons = await getPersons();
  const personIds = teamRels.map(r => r.sourceId);
  return persons.find({ _id: { $in: personIds } }).toArray();
}

export async function getCoInvestors(fundId: ObjectId | string): Promise<Organization[]> {
  const objId = typeof fundId === 'string' ? new ObjectId(fundId) : fundId;
  const rels = await getOrgRelationships();

  // Get all portfolio companies for this fund
  const portfolioRels = await rels
    .find({
      sourceType: 'organization',
      sourceId: objId,
      relationshipType: 'portfolio_company',
    })
    .toArray();

  if (portfolioRels.length === 0) return [];

  const portfolioIds = portfolioRels.map(r => r.targetId);

  // Find other funds that also invested in these companies
  const coInvestorRels = await rels
    .find({
      sourceType: 'organization',
      sourceId: { $ne: objId },
      targetId: { $in: portfolioIds },
      relationshipType: 'portfolio_company',
    })
    .toArray();

  if (coInvestorRels.length === 0) return [];

  const orgs = await getOrganizations();
  const coInvestorIds = [...new Set(coInvestorRels.map(r => r.sourceId.toString()))].map(id => new ObjectId(id));
  return orgs.find({ _id: { $in: coInvestorIds } }).toArray();
}
