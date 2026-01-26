/**
 * Route Schemas
 *
 * Zod schemas for request body validation across all routes.
 * Organized by batch for the P2 Input Validation Sprint.
 */

import { z } from 'zod';

// =============================================================================
// BATCH 1: Financial Routes
// =============================================================================

// ===== Capital Call Schemas =====

export const CreateCapitalCallSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  totalAmount: z.coerce.number().positive('Total amount must be positive'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Due date must be YYYY-MM-DD format'),
  description: z.string().optional(),
  wireInstructions: z.string().optional(),
  purpose: z.string().optional()
});

export const UpdateCapitalCallSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  totalAmount: z.coerce.number().positive().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
  wireInstructions: z.string().optional(),
  purpose: z.string().optional()
});

export const MarkWireInitiatedSchema = z.object({
  wireReference: z.string().optional()
});

export const UploadWireProofSchema = z.object({
  documentId: z.string().uuid('Document ID must be a valid UUID'),
  wireReference: z.string().optional()
});

export const MarkFundedSchema = z.object({
  fundedAmount: z.coerce.number().positive().optional(),
  confirmationRef: z.string().optional(),
  expectedVersion: z.coerce.number().int().optional()
});

// ===== Distribution Schemas =====

export const CreateDistributionSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  totalAmount: z.coerce.number().positive('Total amount must be positive'),
  distributionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD format'),
  description: z.string().optional(),
  period: z.string().optional(),
  type: z.enum(['CASH_DISTRIBUTION', 'RETURN_OF_CAPITAL', 'DIVIDEND']).optional(),
  useWaterfall: z.boolean().optional()
});

export const MarkDistributionPaidSchema = z.object({
  confirmationRef: z.string().optional()
});

// ===== Investor Update Schemas =====

export const CreateInvestorUpdateSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  updateType: z.string().optional(),
  period: z.string().optional(),
  headline: z.string().optional(),
  whatChanged: z.any().optional(),  // JSON object
  metrics: z.any().optional(),
  planVsActual: z.any().optional(),
  risksAndMitigations: z.any().optional(),
  nextQuarterPriorities: z.any().optional(),
  attachmentIds: z.array(z.string().uuid()).optional()
});

// ===== Share Class Schemas =====
// Note: preferredReturn, managementFee, carryPercent use 0-1 range (e.g., 0.08 for 8%)

export const CreateShareClassSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().min(1).max(10, 'Code must be alphanumeric and 1-10 characters').regex(/^[A-Za-z0-9]+$/, 'Code must be alphanumeric'),
  description: z.string().optional(),
  preferredReturn: z.coerce.number().min(0).max(1, 'preferredReturn must be between 0 and 1 (e.g., 0.08 for 8%)').optional().nullable(),
  managementFee: z.coerce.number().min(0).max(1, 'managementFee must be between 0 and 1 (e.g., 0.02 for 2%)').optional().nullable(),
  carryPercent: z.coerce.number().min(0).max(1, 'carryPercent must be between 0 and 1 (e.g., 0.20 for 20%)').optional().nullable(),
  votingRights: z.boolean().optional(),
  priority: z.coerce.number().int().min(1, 'priority must be a positive integer (1 = highest)').optional().nullable()
});

// =============================================================================
// BATCH 2: Authentication Routes
// =============================================================================

export const SignupSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required'),
  organizationId: z.string().uuid().optional(),
  organizationName: z.string().optional(),
  role: z.enum(['GP', 'GP Analyst', 'Broker', 'Admin']).optional(),
  brokerLicenseNo: z.string().optional(),
  brokerLicenseState: z.string().optional(),
  brokerageName: z.string().optional()
}).refine(data => {
  // If role is Broker, license fields are required
  if (data.role === 'Broker') {
    return data.brokerLicenseNo && data.brokerLicenseState;
  }
  return true;
}, { message: 'Broker role requires brokerLicenseNo and brokerLicenseState' });

export const CreateMagicLinkSchema = z.object({
  dealId: z.string().uuid('Deal ID must be a valid UUID'),
  recipientEmail: z.string().email('Invalid email format'),
  recipientRole: z.enum(['LENDER', 'COUNSEL'], {
    errorMap: () => ({ message: 'Role must be LENDER or COUNSEL' })
  }),
  recipientName: z.string().optional(),
  actionType: z.string().default('view_deal'),
  expiresInDays: z.coerce.number().int().min(1).max(30).default(7)
});

export const GrantConsentSchema = z.object({
  allowDealParsing: z.boolean().default(true),
  allowChatAssistant: z.boolean().default(true),
  allowDocumentAnalysis: z.boolean().default(true),
  allowInsights: z.boolean().default(true)
});

// =============================================================================
// BATCH 3: LP Routes
// =============================================================================

export const GenerateLPMagicLinkSchema = z.object({
  lpActorId: z.string().uuid('LP Actor ID must be a valid UUID')
});

export const UploadLPDocumentSchema = z.object({
  dealId: z.string().uuid('Deal ID must be a valid UUID'),
  filename: z.string().min(1, 'Filename is required'),
  documentType: z.string().min(1, 'Document type is required'),
  category: z.enum([
    'TAX', 'LEGAL', 'FINANCIAL', 'PRESENTATION', 'CLOSING'
  ]),
  year: z.coerce.number().int().min(2000).max(2100).optional().nullable(),
  quarter: z.enum(['Q1', 'Q2', 'Q3', 'Q4']).optional().nullable(),
  visibility: z.enum(['ALL_LPS', 'SPECIFIC_LPS']).default('ALL_LPS'),
  storageKey: z.string().optional(),
  mimeType: z.string().default('application/pdf'),
  sizeBytes: z.coerce.number().int().min(0).optional(),
  lpActorIds: z.array(z.string().uuid()).optional()
});

export const CreateLPTransferSchema = z.object({
  fromLpActorId: z.string().uuid('From LP ID must be a valid UUID'),
  toLpActorId: z.string().uuid('To LP ID must be a valid UUID'),
  transferAmount: z.coerce.number().positive('Transfer amount must be positive'),
  transferPct: z.coerce.number().min(0.01).max(100, 'Transfer percentage must be 0.01-100'),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD format'),
  reason: z.string().optional(),
  documentId: z.string().uuid().optional()
}).refine(data => data.fromLpActorId !== data.toLpActorId, {
  message: 'Cannot transfer to the same LP'
});

export const LenderApproveSchema = z.object({
  comment: z.string().optional()
});

// =============================================================================
// BATCH 5: Deal Intake & DD Checklist Routes
// =============================================================================

// ===== Deal Intake Schemas =====

export const CreateDraftSchema = z.object({
  ingestSource: z.enum(['MANUAL', 'EMAIL', 'PDF', 'PASTE', 'OM'], {
    errorMap: () => ({ message: 'ingestSource must be MANUAL, EMAIL, PDF, PASTE, or OM' })
  }),
  sourceData: z.any().optional(),
  seller: z.object({
    email: z.string().email().optional(),
    name: z.string().optional()
  }).optional(),
  brokerFirm: z.string().optional()
});

export const PasteTextSchema = z.object({
  text: z.string().min(1, 'Text content is required'),
  sourceName: z.string().optional().default('Pasted Text')
});

export const UploadDocumentsSchema = z.object({
  documents: z.array(z.object({
    name: z.string().min(1),
    type: z.string().optional(),
    url: z.string().optional(),
    size: z.number().optional()
  })).min(1, 'At least one document required')
});

export const AddBrokerSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().min(1, 'Broker name is required'),
  userId: z.string().optional(),
  firmName: z.string().optional()
});

export const SetSellerSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().min(1, 'Seller name is required'),
  userId: z.string().optional(),
  entityName: z.string().optional(),
  hasDirectAccess: z.boolean().optional(),
  receiveNotifications: z.boolean().optional(),
  requiresOMApproval: z.boolean().optional(),
  requiresBuyerApproval: z.boolean().optional(),
  sellerSeesBuyerIdentity: z.boolean().optional()
});

export const VerifyClaimSchema = z.object({
  action: z.enum(['confirm', 'reject'], {
    errorMap: () => ({ message: 'action must be "confirm" or "reject"' })
  }),
  correctedValue: z.any().optional(),
  rejectionReason: z.string().optional()
});

export const ResolveConflictSchema = z.object({
  method: z.enum(['CHOSE_CLAIM_A', 'CHOSE_CLAIM_B', 'MANUAL_OVERRIDE', 'AVERAGED'], {
    errorMap: () => ({ message: 'method must be CHOSE_CLAIM_A, CHOSE_CLAIM_B, MANUAL_OVERRIDE, or AVERAGED' })
  }),
  resolvedClaimId: z.string().optional(),
  resolvedValue: z.any().optional()
});

export const AdvanceStatusSchema = z.object({
  status: z.string().min(1, 'Status is required')
});

export const ConvertToDealSchema = z.object({
  winningBuyerUserId: z.string().min(1, 'winningBuyerUserId is required'),
  notes: z.string().optional()
});

export const UpdateDraftSchema = z.object({
  status: z.string().optional(),
  listingType: z.string().optional(),
  askingPrice: z.coerce.number().positive().optional(),
  propertyName: z.string().optional(),
  propertyAddress: z.string().optional(),
  propertyCity: z.string().optional(),
  propertyState: z.string().optional(),
  propertyZip: z.string().optional()
});

export const CreateListingSchema = z.object({
  pricingType: z.enum(['fixed', 'range']).optional(),
  askingPrice: z.coerce.number().positive().optional(),
  priceMin: z.coerce.number().positive().optional(),
  priceMax: z.coerce.number().positive().optional(),
  listingType: z.enum(['public', 'private']).optional(),
  broker: z.object({
    email: z.string().email(),
    name: z.string().optional(),
    firmName: z.string().optional()
  }).optional()
}).refine(data => {
  if (data.pricingType === 'range') {
    return data.priceMin !== undefined && data.priceMax !== undefined;
  }
  return true;
}, { message: 'priceMin and priceMax required for range pricing' }).refine(data => {
  if (data.priceMin !== undefined && data.priceMax !== undefined) {
    return data.priceMax > data.priceMin;
  }
  return true;
}, { message: 'priceMax must be greater than priceMin' });

export const CounterOfferSchema = z.object({
  commissionType: z.enum(['PERCENTAGE', 'FLAT', 'HYBRID'], {
    errorMap: () => ({ message: 'commissionType is required' })
  }),
  commissionRate: z.coerce.number().min(0).max(100).optional(),
  commissionAmount: z.coerce.number().positive().optional(),
  notes: z.string().optional()
});

export const CreateListingConfigSchema = z.object({
  visibility: z.enum(['PLATFORM', 'INVITE_ONLY', 'PUBLIC']).optional().default('PLATFORM'),
  targetBuyerTypes: z.array(z.string()).optional(),
  targetInvestmentMin: z.coerce.number().positive().optional().nullable(),
  targetInvestmentMax: z.coerce.number().positive().optional().nullable(),
  targetGeographies: z.array(z.string()).optional(),
  enableOM: z.boolean().optional().default(true),
  enableFlyers: z.boolean().optional().default(false),
  enablePropertyWebsite: z.boolean().optional().default(false),
  offerDeadline: z.string().datetime().optional().nullable(),
  listingDuration: z.coerce.number().int().positive().optional().nullable(),
  openHouseDates: z.array(z.string()).optional()
});

export const ConfirmAgreementSchema = z.object({
  agreementId: z.string().min(1, 'agreementId is required'),
  role: z.enum(['SELLER', 'BROKER']).optional()
});

// ===== DD Checklist Schemas =====

export const InitializeChecklistSchema = z.object({
  psaEffectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD').optional(),
  ddExpirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD').optional(),
  targetClosingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD').optional()
});

export const UpdateDDItemSchema = z.object({
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'BLOCKED', 'COMPLETE', 'N/A'], {
    errorMap: () => ({ message: 'Invalid status' })
  }),
  notes: z.string().optional()
});

export const AssignDDItemSchema = z.object({
  assigneeUserId: z.string().min(1, 'assigneeUserId is required'),
  assigneeName: z.string().min(1, 'assigneeName is required')
});

export const LinkDocumentSchema = z.object({
  documentId: z.string().min(1, 'documentId is required')
});

export const VerifyDDItemSchema = z.object({
  notes: z.string().optional()
});

export const MarkNASchema = z.object({
  reason: z.string().min(1, 'reason is required')
});

export const AddCustomDDItemSchema = z.object({
  title: z.string().min(1, 'title is required'),
  categoryCode: z.string().optional(),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD').optional(),
  notes: z.string().optional()
});

export const ProcessDocumentSchema = z.object({
  documentId: z.string().min(1, 'documentId is required'),
  options: z.record(z.any()).optional()
});

export const ApproveMatchSchema = z.object({
  notes: z.string().optional()
});

export const RejectMatchSchema = z.object({
  reason: z.string().min(1, 'reason is required')
});

// ===== Deal Assignments Schemas =====

export const AssignAnalystSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  userName: z.string().optional(),
  role: z.string().optional().default('analyst')
});

export const BulkAssignAnalystSchema = z.object({
  dealIds: z.array(z.string()).min(1, 'dealIds array is required'),
  userId: z.string().min(1, 'userId is required'),
  userName: z.string().optional(),
  role: z.string().optional().default('analyst')
});

// ===== Review Requests Schemas =====

export const CreateReviewRequestSchema = z.object({
  message: z.string().optional()
});

export const RespondToReviewSchema = z.object({
  action: z.enum(['approve', 'reject', 'feedback'], {
    errorMap: () => ({ message: 'action must be approve, reject, or feedback' })
  }),
  message: z.string().optional()
});

// ===== Deal State Schemas =====

export const TransitionStateSchema = z.object({
  toState: z.string().min(1, 'toState is required'),
  reason: z.string().optional(),
  approvals: z.array(z.string()).optional(),
  force: z.boolean().optional()
});

// ===== Deal Submissions Schemas =====

export const SubmitDealSchema = z.object({
  recipientEmail: z.string().email('Invalid email'),
  recipientName: z.string().optional(),
  recipientRole: z.string().optional(),
  message: z.string().optional()
});

// =============================================================================
// BATCH 6: Admin Routes
// =============================================================================

export const RejectVerificationSchema = z.object({
  note: z.string().optional()
});

export const UpdateUserRoleSchema = z.object({
  role: z.enum(['GP', 'GP Analyst', 'Lender', 'Counsel', 'Regulator', 'Auditor', 'LP', 'Admin', 'Broker'], {
    errorMap: () => ({ message: 'Invalid role' })
  })
});

export const UpdateUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED'], {
    errorMap: () => ({ message: 'Status must be ACTIVE or SUSPENDED' })
  })
});

export const BulkApproveVerificationSchema = z.object({
  requestIds: z.array(z.string()).min(1, 'requestIds array is required')
});

export const BulkRejectVerificationSchema = z.object({
  requestIds: z.array(z.string()).min(1, 'requestIds array is required'),
  note: z.string().optional()
});

export const ActionPayloadSchema = z.object({
  payload: z.record(z.any()).optional()
});

// Legacy schemas (kept for compatibility)
export const CreateDealSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  propertyType: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  askingPrice: z.coerce.number().positive().optional()
});

export const UpdateDealSchema = z.object({
  name: z.string().min(1).optional(),
  propertyType: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  askingPrice: z.coerce.number().positive().optional(),
  status: z.string().optional()
});

export const CreateUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().min(1, 'Name is required'),
  role: z.enum(['GP', 'GP Analyst', 'LP', 'Admin', 'Broker']),
  organizationId: z.string().uuid().optional()
});

export const UpdateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['GP', 'GP Analyst', 'LP', 'Admin', 'Broker']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional()
});

// =============================================================================
// BATCH 7: Permission Gate & Content Routes
// =============================================================================

export const AuthorizeBuyerSchema = z.object({
  accessLevel: z.enum(['TEASER', 'STANDARD', 'FULL', 'VDR_ACCESS']).optional()
});

export const DeclineBuyerSchema = z.object({
  reason: z.string().min(1, 'Reason is required when declining a buyer')
});

export const RevokeBuyerSchema = z.object({
  reason: z.string().min(1, 'Reason is required when revoking access')
});

export const RecordNDASignedSchema = z.object({
  ndaDocumentId: z.string().uuid().optional()
});

export const BulkAuthorizeBuyersSchema = z.object({
  buyerUserIds: z.array(z.string()).min(1, 'buyerUserIds array is required')
});

export const BulkDeclineBuyersSchema = z.object({
  buyerUserIds: z.array(z.string()).min(1, 'buyerUserIds array is required'),
  reason: z.string().optional().default('Not a fit')
});

export const GrantDataRoomAccessSchema = z.object({
  accessLevel: z.enum(['TEASER', 'STANDARD', 'FULL', 'VDR_ACCESS']).optional().default('STANDARD')
});

export const NewsAskSchema = z.object({
  insightId: z.string().min(1, 'insightId is required'),
  question: z.string().min(1, 'question is required')
});

export const ProvenanceUpdateSchema = z.object({
  fieldPath: z.string().min(1, 'fieldPath is required'),
  artifactId: z.string().optional()
});

// =============================================================================
// BATCH 8: AI Assistant & Notifications Routes
// =============================================================================

// ===== AI Assistant Schemas =====

export const AskAISchema = z.object({
  question: z.string().min(1, 'question is required'),
  conversationId: z.string().optional(),
  dealId: z.string().uuid().optional()
});

export const ExtractDocumentSchema = z.object({
  documentId: z.string().uuid('documentId must be a valid UUID'),
  extractionType: z.string().optional(),
  options: z.record(z.any()).optional()
});

export const SynthesizeDocumentsSchema = z.object({
  documentIds: z.array(z.string().uuid()).min(1, 'At least one documentId required'),
  synthesisType: z.string().optional(),
  options: z.record(z.any()).optional()
});

export const AIResolveConflictSchema = z.object({
  resolvedValue: z.any(),
  reason: z.string().optional()
});

export const DismissConflictSchema = z.object({
  reason: z.string().optional()
});

export const VerifyFieldSchema = z.object({
  notes: z.string().optional()
});

export const MarkNeedsReviewSchema = z.object({
  reason: z.string().optional()
});

export const TrackLineageSchema = z.object({
  fieldPath: z.string().min(1, 'fieldPath is required'),
  sourceDocumentId: z.string().uuid().optional(),
  sourceLocation: z.object({
    pageNumber: z.number().int().positive().optional(),
    coordinates: z.any().optional()
  }).optional(),
  extractionMethod: z.string().optional()
});

export const BulkVerifySchema = z.object({
  fieldIds: z.array(z.string()).min(1, 'fieldIds array is required'),
  verificationNotes: z.string().optional()
});

export const CreateAssumptionSnapshotSchema = z.object({
  snapshotType: z.string().min(1, 'snapshotType is required'),
  assumptions: z.record(z.any()),
  metrics: z.record(z.any()).optional(),
  notes: z.string().optional()
});

export const CompareAssumptionsSchema = z.object({
  period: z.string().min(1, 'period is required')
});

export const GetAssumptionSuggestionsSchema = z.object({
  proposedAssumptions: z.record(z.any()),
  dealContext: z.record(z.any()).optional()
});

export const SmartParseSchema = z.object({
  artifactId: z.string().min(1, 'artifactId is required'),
  filename: z.string().optional(),
  targetFields: z.array(z.string()).optional()
});

export const SmartParseApplySchema = z.object({
  artifactId: z.string().min(1, 'artifactId is required'),
  fields: z.record(z.any())
});

// ===== Notifications Schemas =====

export const CreateTaskSchema = z.object({
  title: z.string().min(1, 'title is required'),
  description: z.string().optional(),
  assigneeId: z.string().optional(),
  assigneeName: z.string().optional(),
  dealId: z.string().uuid().optional(),
  conversationId: z.string().optional(),
  sourceMessageId: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional().default('MEDIUM'),
  dueDate: z.string().optional()
});

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assigneeId: z.string().optional(),
  assigneeName: z.string().optional(),
  dueDate: z.string().optional().nullable()
});

export const SnoozeNotificationSchema = z.object({
  duration: z.enum(['1h', '3h', '1d', '3d', '1w', 'custom']).optional(),
  until: z.string().optional()
}).refine(data => data.duration || data.until, {
  message: 'Either duration or until is required'
});

export const DismissNotificationSchema = z.object({
  reason: z.enum(['completed', 'not_relevant', 'other']).optional()
});

export const UpdateNotificationPreferencesSchema = z.object({
  emailEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  reminderDays: z.array(z.coerce.number().int().min(1).max(30)).optional(),
  escalateAfterDays: z.coerce.number().int().min(1).max(30).optional(),
  quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM format').optional().nullable(),
  quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM format').optional().nullable()
});

// =============================================================================
// BATCH 9: Broker & Contact Routes
// =============================================================================

// ===== Brokerage Schemas =====

export const CreateBrokerageSchema = z.object({
  name: z.string().min(1, 'Brokerage name is required'),
  domain: z.string().optional()
});

export const InviteBrokerSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().optional()
});

// ===== Contact Schemas =====

export const CreateContactSchema = z.object({
  name: z.string().min(1, 'name is required'),
  contactType: z.enum([
    'BROKER', 'LENDER', 'ATTORNEY', 'TITLE_COMPANY', 'APPRAISER',
    'INSPECTOR', 'ENVIRONMENTAL', 'PROPERTY_MANAGER', 'ESCROW_AGENT',
    'INSURANCE_AGENT', 'TAX_ADVISOR', 'CONTRACTOR', 'INVESTOR', 'OTHER'
  ], { errorMap: () => ({ message: 'Invalid contactType' }) }),
  isPerson: z.boolean().optional().default(true),
  companyName: z.string().optional(),
  title: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  phoneAlt: z.string().optional(),
  website: z.string().url().optional(),
  notes: z.string().optional(),
  preferredMethod: z.enum(['EMAIL', 'PHONE', 'TEXT']).optional(),
  isOrgPreferred: z.boolean().optional().default(false),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional()
  }).optional(),
  tags: z.array(z.string()).optional()
});

export const UpdateContactSchema = z.object({
  name: z.string().min(1).optional(),
  companyName: z.string().optional(),
  title: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  phoneAlt: z.string().optional(),
  website: z.string().url().optional(),
  notes: z.string().optional(),
  preferredMethod: z.enum(['EMAIL', 'PHONE', 'TEXT']).optional(),
  isPerson: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
  address: z.any().optional(),
  tags: z.array(z.string()).optional(),
  isOrgPreferred: z.boolean().optional()
});

export const AddCredentialSchema = z.object({
  credentialType: z.enum(['LICENSE', 'CERTIFICATION', 'INSURANCE', 'BOND'], {
    errorMap: () => ({ message: 'Invalid credentialType' })
  }),
  credentialName: z.string().min(1, 'credentialName is required'),
  issuingAuthority: z.string().optional(),
  credentialNumber: z.string().optional(),
  state: z.string().optional(),
  jurisdiction: z.string().optional(),
  issuedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD').optional(),
  expirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD').optional(),
  documentId: z.string().uuid().optional()
});

export const UpdateCredentialSchema = z.object({
  credentialName: z.string().optional(),
  issuingAuthority: z.string().optional(),
  credentialNumber: z.string().optional(),
  state: z.string().optional(),
  jurisdiction: z.string().optional(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'EXPIRING_SOON', 'PENDING']).optional(),
  issuedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional().nullable(),
  expirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional().nullable(),
  documentId: z.string().uuid().optional(),
  verified: z.boolean().optional()
});

export const LogActivitySchema = z.object({
  activityType: z.enum([
    'EMAIL_SENT', 'EMAIL_RECEIVED', 'CALL', 'MEETING',
    'NOTE', 'DOCUMENT_SHARED', 'PORTAL_ACCESS', 'DEAL_ASSIGNED'
  ], { errorMap: () => ({ message: 'Invalid activityType' }) }),
  summary: z.string().min(1, 'summary is required'),
  dealId: z.string().uuid().optional(),
  direction: z.enum(['INBOUND', 'OUTBOUND']).optional(),
  subject: z.string().optional(),
  occurredAt: z.string().optional(),
  attachmentIds: z.array(z.string().uuid()).optional()
});

export const AddRatingSchema = z.object({
  overallRating: z.coerce.number().int().min(1).max(5, 'Rating must be between 1 and 5'),
  dealId: z.string().uuid().optional(),
  qualityRating: z.coerce.number().int().min(1).max(5).optional(),
  timelinessRating: z.coerce.number().int().min(1).max(5).optional(),
  communicationRating: z.coerce.number().int().min(1).max(5).optional(),
  valueRating: z.coerce.number().int().min(1).max(5).optional(),
  comments: z.string().optional(),
  wouldRecommend: z.boolean().optional().default(true)
});

export const AssignContactToDealSchema = z.object({
  contactId: z.string().min(1, 'contactId is required'),
  role: z.string().min(1, 'role is required'),
  dealType: z.enum(['DRAFT', 'KERNEL']).optional().default('DRAFT'),
  isPrimary: z.boolean().optional().default(false),
  feeType: z.enum(['FLAT', 'PERCENTAGE', 'HOURLY']).optional(),
  estimatedFee: z.coerce.number().positive().optional(),
  feeNotes: z.string().optional()
});

export const UpdateDealContactSchema = z.object({
  isPrimary: z.boolean().optional(),
  feeType: z.enum(['FLAT', 'PERCENTAGE', 'HOURLY']).optional(),
  estimatedFee: z.coerce.number().positive().optional(),
  actualFee: z.coerce.number().positive().optional(),
  feeNotes: z.string().optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']).optional()
});

// ===== Listing Agreement Schemas =====

export const CreateListingAgreementSchema = z.object({
  dealDraftId: z.string().min(1, 'dealDraftId is required'),
  agreementType: z.enum(['EXCLUSIVE_RIGHT_TO_SELL', 'EXCLUSIVE_AGENCY', 'OPEN'], {
    errorMap: () => ({ message: 'Valid agreement type is required' })
  }),
  sellerUserId: z.string().optional(),
  sellerEntityName: z.string().optional(),
  brokerUserId: z.string().optional(),
  commissionPercent: z.coerce.number().min(0).max(100).optional(),
  commissionFlat: z.coerce.number().positive().optional(),
  listingPriceMin: z.coerce.number().positive().optional(),
  listingPriceMax: z.coerce.number().positive().optional(),
  termStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD'),
  termEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD')
}).refine(data => {
  if (data.termStartDate && data.termEndDate) {
    return new Date(data.termEndDate) > new Date(data.termStartDate);
  }
  return true;
}, { message: 'termEndDate must be after termStartDate' });

export const UpdateListingAgreementSchema = z.object({
  agreementType: z.enum(['EXCLUSIVE_RIGHT_TO_SELL', 'EXCLUSIVE_AGENCY', 'OPEN']).optional(),
  commissionPercent: z.coerce.number().min(0).max(100).optional(),
  commissionFlat: z.coerce.number().positive().optional(),
  listingPriceMin: z.coerce.number().positive().optional(),
  listingPriceMax: z.coerce.number().positive().optional(),
  termStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
  termEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
  sellerEntityName: z.string().optional()
});

export const TerminateAgreementSchema = z.object({
  reason: z.string().optional()
});

// =============================================================================
// BATCH 12: Excel Import Validation (P3 Security Sprint)
// =============================================================================

export const UpdateMappingsSchema = z.object({
  mappings: z.array(z.object({
    sourceColumn: z.string().min(1, 'Source column is required'),
    targetField: z.string().min(1, 'Target field is required'),
    transform: z.string().optional()
  })).min(1, 'At least one mapping is required')
});

export const ApplyExcelImportSchema = z.object({
  fields: z.array(z.object({
    fieldPath: z.string().min(1, 'Field path is required'),
    value: z.any(),
    source: z.string().optional()
  })).optional()
});
