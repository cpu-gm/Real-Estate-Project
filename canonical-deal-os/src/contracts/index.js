/**
 * Canonical Contracts Index
 *
 * This is the FUTURE canonical import point for all contracts.
 * Migration is in progress - see status below.
 *
 * USAGE (future):
 *   import { createDealRequestSchema, dealSchema } from '../contracts';
 *
 * MIGRATION STATUS:
 *   [MIGRATED] createDealRequestSchema - ./http/deals.schema.js
 *   [MIGRATED] explainBlockSchema - ./http/explain.schema.js
 *   [LEGACY]   All other schemas - ../lib/contracts.js
 *
 * DO NOT add new schemas to ../lib/contracts.js
 * Add them to the appropriate file in ./http/ or ./events/
 */

// =============================================================================
// MIGRATED SCHEMAS (new location)
// =============================================================================

export { createDealRequestSchema } from './http/deals.schema.js';
export { explainBlockSchema, explainReasonSchema } from './http/explain.schema.js';

// =============================================================================
// LEGACY SCHEMAS (re-exported from old location for backward compatibility)
// =============================================================================

export {
  // Deal schemas
  dealSchema,
  dealProfileSchema,
  dealProfileMetaSchema,
  dealListResponseSchema,
  dealEventSchema,
  dealHomeResponseSchema,
  dealRecordsResponseSchema,

  // Authority & material schemas
  authoritySchema,
  materialSchema,
  covenantSchema,

  // Evidence schemas
  evidenceSummarySchema,
  evidenceReferenceSchema,
  evidenceArtifactSchema,
  evidenceIndexSchema,

  // Approval schemas
  approvalSummarySchema,
  approvalsSchema,

  // Explain schemas (except explainBlockSchema - migrated)
  explainAllowedSchema,
  explainResponseSchema,
  actionResponseSchema,

  // Action types
  actionTypeSchema,

  // LLM schemas
  llmDealParseRequestSchema,
  llmDealParseResponseSchema,

  // LP schemas
  lpInvitationRequestSchema,
  lpInvitationSchema,
  lpPortalInvestmentSchema,
  lpPortalInvestmentListSchema,
  lpPortalResponseSchema,
  lpCapitalEventSchema,
  lpInvestmentDetailSchema,

  // Events response
  eventsResponseSchema
} from '../lib/contracts.js';
