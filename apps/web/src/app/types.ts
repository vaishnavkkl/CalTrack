export interface User {
  id: number;
  username: string;
  email: string;
  displayName: string;
  role: 'super_admin' | 'sourcing_user';
}

export interface Opportunity {
  id: string;
  solicitationNumber: string;
  solicitationType: string;
  title: string;
  agency: string;
  department?: string;
  description: string;
  category: string;
  publishedAt?: string;
  closesAt?: string;
  location: string;
  contactName?: string;
  contactEmail?: string;
  sourcePortal: string;
  sourceGroup: 'caleprocure' | 'priority';
  sourceUrl?: string;
  attachments: Array<{
    name: string;
    url: string;
  }>;
  status: 'Not reviewed' | 'Qualified' | 'Not qualified' | 'Submitted' | 'Not submitted';
  relevanceScore: number;
  reviewed: boolean;
  saved: boolean;
  archived: boolean;
  notes: string;
  ownerName: string;
  priority: 'Low' | 'Normal' | 'High' | 'Critical';
  resourcePreparationSelected: boolean;
  nextAction: string;
  nextActionDueAt?: string;
  tags: string[];
  firstCollectedAt: string;
  lastCheckedAt: string;
  lastUpdatedAt: string;
  sourceStatus: string;
}

export interface Portal {
  id: string;
  name: string;
  portalType: string;
  baseUrl: string;
  connectorKey: string;
  provider: string;
  organizationName: string;
  accountScope: string;
  opportunityGroup: 'caleprocure' | 'priority';
  authMode: string;
  enabled: boolean;
  isPrimary: boolean;
  cadence: string;
  status: string;
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
}

export interface ResourceRequirement {
  id: string;
  title: string;
  count: number;
  minimumYears: number;
  skills: string[];
  qualifications: string;
}

export interface DocumentationItem {
  id: string;
  label: string;
  required: boolean;
  status: 'Missing' | 'In progress' | 'Ready';
  owner: string;
}

export interface BidWorkflow {
  opportunityId: string;
  decision: 'Not reviewed' | 'Qualified' | 'Not qualified';
  decisionReason: string;
  decisionNotes: string;
  requiredResources: ResourceRequirement[];
  uAndARequired: '' | 'Yes' | 'No';
  candidatesRequired: number | null;
  candidatesProvided: number | null;
  contractTerm: string;
  budget: string;
  contractMode: string;
  sourcingBrief: string;
  sourcingStatus: 'Not published' | 'Open' | 'Sourcing complete';
  documentationItems: DocumentationItem[];
  documentationNotes: string;
  responseStatus: 'Not started' | 'In progress' | 'Ready for review' | 'Changes requested' | 'Submitted' | 'Not submitted';
  responseReviewNotes: string;
  decidedBy: string;
  reviewedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BidRecord {
  opportunity: Opportunity;
  workflow: BidWorkflow;
  candidateCount: number;
  shortlistedCount: number;
  responseFileCount: number;
  pendingFileCount: number;
}

export interface Candidate {
  id: string;
  opportunityId: string;
  resourceRequirementId: string;
  fullName: string;
  currentTitle: string;
  location: string;
  yearsExperience: number;
  availability: string;
  skills: string[];
  qualificationSummary: string;
  profileReference: string;
  resume?: { fileName: string; sizeBytes: number; downloadUrl: string } | null;
  submittedBy: number;
  submittedByName: string;
  reviewStatus: 'New' | 'Reviewing' | 'Shortlisted' | 'Rejected';
  reviewNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResponseFile {
  id: string;
  opportunityId: string;
  documentationItemId: string;
  fileName: string;
  category: string;
  description: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
  uploadedBy: number;
  uploadedByName: string;
  reviewStatus: 'Pending review' | 'Approved' | 'Changes requested';
  reviewNotes: string;
  reviewedBy?: number;
  reviewedByName: string;
  createdAt: string;
  updatedAt: string;
  downloadUrl: string;
}

export interface CollectionJob {
  id: string;
  portalId: string;
  portalName: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  foundCount: number;
  newCount: number;
  updatedCount: number;
  duplicateCount: number;
  progressStage: string;
  progressCurrent: number;
  progressTotal: number;
  warnings: string[];
  errorMessage?: string;
}

export interface Settings {
  includedKeywords: string[];
  excludedKeywords: string[];
  preferredAgencies: string[];
  collectionFrequency: string;
  emailDigest: boolean;
  deadlineAlerts: boolean;
}
