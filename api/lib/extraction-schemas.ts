import { z } from 'zod';

// Schema for extracting executives from DEF 14A proxy statements
export const executiveExtractionSchema = z.object({
  executives: z.array(z.object({
    name: z.string().describe('Full name of the executive'),
    title: z.string().describe('Official title/position'),
    compensation: z.object({
      salary: z.number().optional().describe('Base salary in USD'),
      bonus: z.number().optional().describe('Annual bonus in USD'),
      stockAwards: z.number().optional().describe('Stock awards value in USD'),
      total: z.number().optional().describe('Total compensation in USD'),
    }).optional(),
    biography: z.string().optional().describe('Brief bio or background'),
    startDate: z.string().optional().describe('When they started in this role (YYYY-MM-DD)'),
  })).describe('List of named executive officers'),
});

// Schema for extracting board members from DEF 14A
export const boardMemberExtractionSchema = z.object({
  boardMembers: z.array(z.object({
    name: z.string().describe('Full name of the board member'),
    title: z.string().optional().describe('Title on board (e.g., Chairman, Lead Independent Director)'),
    committees: z.array(z.string()).optional().describe('Board committees they serve on'),
    independentDirector: z.boolean().optional().describe('Whether they are classified as independent'),
    biography: z.string().optional().describe('Brief bio or background'),
    appointedDate: z.string().optional().describe('When they joined the board (YYYY-MM-DD)'),
    termExpires: z.string().optional().describe('When their term expires (YYYY-MM-DD)'),
  })).describe('List of board directors'),
});

// Combined DEF 14A extraction schema
export const def14aExtractionSchema = z.object({
  companyName: z.string().describe('Name of the company filing the proxy'),
  filingDate: z.string().describe('Date of the filing (YYYY-MM-DD)'),
  annualMeetingDate: z.string().optional().describe('Date of annual meeting (YYYY-MM-DD)'),
  executives: executiveExtractionSchema.shape.executives,
  boardMembers: boardMemberExtractionSchema.shape.boardMembers,
  shareholderProposals: z.array(z.object({
    title: z.string(),
    proposedBy: z.string().optional(),
    recommendation: z.enum(['for', 'against', 'abstain']).optional(),
  })).optional().describe('Any shareholder proposals'),
});

// Schema for 13D/13G activist investor filings
export const filing13DGExtractionSchema = z.object({
  filerName: z.string().describe('Name of the reporting person/entity'),
  filerType: z.enum(['individual', 'institution']).describe('Whether filer is individual or institution'),
  filerAddress: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
  }).optional(),
  targetCompany: z.string().describe('Name of the company whose shares are being reported'),
  targetTicker: z.string().optional().describe('Ticker symbol of target company'),
  targetCusip: z.string().optional().describe('CUSIP of the securities'),
  sharesOwned: z.number().describe('Number of shares beneficially owned'),
  percentOwnership: z.number().describe('Percentage of outstanding shares owned'),
  acquiredDate: z.string().optional().describe('Date of acquisition (YYYY-MM-DD)'),
  purpose: z.string().describe('Purpose of the acquisition (investment, influence, control)'),
  sourceOfFunds: z.string().optional().describe('Source of funds used for acquisition'),
  sharedVotingPower: z.number().optional(),
  soleVotingPower: z.number().optional(),
  sharedDispositivePower: z.number().optional(),
  soleDispositivePower: z.number().optional(),
  groupMembers: z.array(z.string()).optional().describe('Names of other group members'),
});

// Schema for 13F institutional holdings
export const filing13FHoldingSchema = z.object({
  issuerName: z.string().describe('Name of the issuer'),
  titleOfClass: z.string().describe('Title of class of securities'),
  cusip: z.string().describe('CUSIP number'),
  value: z.number().describe('Fair market value in thousands of dollars'),
  shares: z.number().describe('Number of shares or principal amount'),
  sharesPrn: z.enum(['SH', 'PRN']).describe('SH=shares, PRN=principal amount'),
  investmentDiscretion: z.enum(['SOLE', 'SHARED', 'NONE']).optional(),
  votingAuthority: z.object({
    sole: z.number().optional(),
    shared: z.number().optional(),
    none: z.number().optional(),
  }).optional(),
});

export const filing13FExtractionSchema = z.object({
  filerName: z.string().describe('Name of the institutional investment manager'),
  filerCik: z.string().optional().describe('CIK of the filer'),
  reportDate: z.string().describe('Report date (YYYY-MM-DD)'),
  filingDate: z.string().describe('Filing date (YYYY-MM-DD)'),
  totalValue: z.number().describe('Total value of holdings in thousands'),
  holdingsCount: z.number().describe('Number of holdings in this filing'),
  holdings: z.array(filing13FHoldingSchema),
});

// Schema for extracting PE fund team from website
export const fundTeamExtractionSchema = z.object({
  fundName: z.string().describe('Name of the PE/VC fund'),
  teamMembers: z.array(z.object({
    name: z.string().describe('Full name'),
    title: z.string().describe('Job title'),
    role: z.enum(['partner', 'managing_director', 'principal', 'vice_president', 'associate', 'analyst', 'advisor', 'other']),
    biography: z.string().optional().describe('Bio or background'),
    linkedIn: z.string().optional().describe('LinkedIn profile URL'),
    email: z.string().optional().describe('Email address'),
    focus: z.array(z.string()).optional().describe('Investment focus areas'),
    imageUrl: z.string().optional(),
  })),
});

// Schema for extracting portfolio companies from website
export const portfolioExtractionSchema = z.object({
  fundName: z.string().describe('Name of the PE/VC fund'),
  portfolioCompanies: z.array(z.object({
    name: z.string().describe('Company name'),
    description: z.string().optional().describe('Brief description'),
    sector: z.string().optional().describe('Industry sector'),
    website: z.string().optional().describe('Company website URL'),
    investmentDate: z.string().optional().describe('Date of investment (YYYY-MM-DD)'),
    investmentType: z.enum(['buyout', 'growth', 'venture', 'other']).optional(),
    status: z.enum(['active', 'exited', 'unknown']).optional(),
    exitDate: z.string().optional().describe('Exit date if applicable (YYYY-MM-DD)'),
    exitType: z.enum(['ipo', 'sale', 'merger', 'other']).optional(),
  })),
});

// Schema for extracting co-investor relationships
export const coInvestorExtractionSchema = z.object({
  dealName: z.string().describe('Name of the deal/transaction'),
  targetCompany: z.string().describe('Company being invested in'),
  leadInvestor: z.string().optional().describe('Lead investor name'),
  coInvestors: z.array(z.object({
    name: z.string().describe('Co-investor name'),
    investmentAmount: z.number().optional().describe('Amount invested in USD'),
    role: z.enum(['lead', 'co-lead', 'participant', 'unknown']).optional(),
  })),
  totalDealSize: z.number().optional().describe('Total deal size in USD'),
  dealDate: z.string().optional().describe('Date of deal (YYYY-MM-DD)'),
  dealType: z.enum(['buyout', 'growth', 'venture', 'recap', 'other']).optional(),
});

// Prompt templates for LLM extraction
export const extractionPrompts = {
  def14a: `Extract executive and board member information from this DEF 14A proxy statement.
Focus on:
1. Named Executive Officers (NEOs) with their titles and compensation
2. Board of Directors members with their committee assignments
3. Any shareholder proposals

Return data in the specified JSON format.`,

  filing13DG: `Extract beneficial ownership information from this Schedule 13D or 13G filing.
Focus on:
1. Who is filing (filer name and type)
2. What company's shares they own
3. How many shares and what percentage
4. The stated purpose of the investment

Return data in the specified JSON format.`,

  fundTeam: `Extract team member information from this PE/VC fund's team page.
Focus on:
1. Names and titles of all team members
2. Their roles (partner, MD, VP, associate, etc.)
3. Their biographies and investment focus areas
4. LinkedIn profiles if available

Return data in the specified JSON format.`,

  portfolio: `Extract portfolio company information from this PE/VC fund's portfolio page.
Focus on:
1. Names of all portfolio companies
2. Descriptions and sectors
3. Investment dates if available
4. Current status (active or exited)
5. Exit details if applicable

Return data in the specified JSON format.`,
};

// Type exports
export type ExecutiveExtraction = z.infer<typeof executiveExtractionSchema>;
export type BoardMemberExtraction = z.infer<typeof boardMemberExtractionSchema>;
export type DEF14AExtraction = z.infer<typeof def14aExtractionSchema>;
export type Filing13DGExtraction = z.infer<typeof filing13DGExtractionSchema>;
export type Filing13FExtraction = z.infer<typeof filing13FExtractionSchema>;
export type Filing13FHolding = z.infer<typeof filing13FHoldingSchema>;
export type FundTeamExtraction = z.infer<typeof fundTeamExtractionSchema>;
export type PortfolioExtraction = z.infer<typeof portfolioExtractionSchema>;
export type CoInvestorExtraction = z.infer<typeof coInvestorExtractionSchema>;
