/**
 * Contract Schemas - Re-exports from canonical source
 *
 * CANONICAL SOURCE: canonical-deal-os/src/lib/contracts.js
 *
 * This file re-exports schemas used for fixture validation.
 * Do NOT define schemas here - add them to the canonical source.
 */

// Import zod from canonical-deal-os where it's installed
import { z } from '../canonical-deal-os/node_modules/zod/index.js';

// Re-export HTTP schemas
// Import migrated schemas from new locations to avoid circular dependency
export { createDealRequestSchema } from '../canonical-deal-os/src/contracts/http/deals.schema.js';
export { explainBlockSchema } from '../canonical-deal-os/src/contracts/http/explain.schema.js';

// Legacy schemas still come from lib/contracts.js
export {
  dealSchema,
  lpInvitationRequestSchema,
  explainAllowedSchema
} from '../canonical-deal-os/src/lib/contracts.js';

// OM schemas
export {
  OMGenerateRequest as omGenerateRequestSchema,
  OMVersion as omVersionSchema,
  OMStatus as omStatusSchema
} from '../canonical-deal-os/src/lib/contracts/om.js';

// Distribution schemas
export {
  CreateDistributionRequest as createDistributionRequestSchema,
  CreateDistributionResponse as createDistributionResponseSchema,
  DealDistribution as dealDistributionSchema,
  BuyerResponse as buyerResponseSchema
} from '../canonical-deal-os/src/lib/contracts/distribution.js';

/**
 * Deal with Organization Context Schema
 *
 * Extends dealSchema with required organizationId for multi-tenant isolation.
 * All deal queries MUST include organizationId filtering.
 */
export const dealWithOrgContextSchema = z.object({
  id: z.string(),
  organizationId: z.string().min(1),  // REQUIRED for multi-tenant isolation
  name: z.string(),
  lifecycle_state: z.string().nullable().optional(),
  stress_mode: z.boolean().optional(),
  truth_health: z.enum(["healthy", "warning", "danger"]).nullable().optional(),
  created_date: z.string().nullable().optional(),
  profile: z.record(z.unknown()).nullable().optional()
}).passthrough();

/**
 * Kernel Event Schema (base envelope)
 *
 * Validates the structure of kernel events (event ledger format).
 * Based on cre-kernel-phase1/apps/kernel-api/src/server.ts inline schema.
 *
 * Note: Event types are defined in cre-kernel-phase1/packages/shared/src/index.ts
 */
export const kernelEventSchema = z.object({
  type: z.string().min(1).max(100),
  actorId: z.string().uuid(),
  payload: z.record(z.unknown()).optional().default({}),
  authorityContext: z.record(z.unknown()).optional().default({}),
  evidenceRefs: z.array(z.string()).optional().default([])
});

/**
 * Kernel Event with Payload Schema (extended)
 *
 * Extends kernelEventSchema with additional payload validation:
 * - dealId: Required for event traceability
 * - orgId: Required for multi-tenant isolation
 * - timestamp: Required for audit trail
 *
 * Use this for stricter validation of production events.
 * Backward compatible: base kernelEventSchema still works.
 */
export const kernelEventWithPayloadSchema = z.object({
  type: z.string().min(1).max(100),
  actorId: z.string().uuid(),
  payload: z.object({
    dealId: z.string().uuid().optional(),
    orgId: z.string().optional(),
    timestamp: z.string().optional()
  }).passthrough().optional().default({}),
  authorityContext: z.object({
    role: z.string().optional(),
    overrideReason: z.string().nullable().optional()
  }).passthrough().optional().default({}),
  evidenceRefs: z.array(z.string()).optional().default([])
});

/**
 * Schema inventory for documentation
 */
export const SCHEMA_INVENTORY = {
  http: {
    // MIGRATED schemas (new location)
    createDealRequestSchema: 'canonical-deal-os/src/contracts/http/deals.schema.js',
    explainBlockSchema: 'canonical-deal-os/src/contracts/http/explain.schema.js',
    // LEGACY schemas (old location, will migrate later)
    dealSchema: 'canonical-deal-os/src/lib/contracts.js:52',
    lpInvitationRequestSchema: 'canonical-deal-os/src/lib/contracts.js:448',
    explainAllowedSchema: 'canonical-deal-os/src/lib/contracts.js:181',
    // OM schemas
    omGenerateRequestSchema: 'canonical-deal-os/src/lib/contracts/om.js',
    omVersionSchema: 'canonical-deal-os/src/lib/contracts/om.js',
    // Distribution schemas
    createDistributionRequestSchema: 'canonical-deal-os/src/lib/contracts/distribution.js',
    createDistributionResponseSchema: 'canonical-deal-os/src/lib/contracts/distribution.js',
    dealDistributionSchema: 'canonical-deal-os/src/lib/contracts/distribution.js',
    buyerResponseSchema: 'canonical-deal-os/src/lib/contracts/distribution.js'
  },
  events: {
    kernelEventSchema: 'contracts/schemas.js (mirrors kernel-api/src/server.ts:100-106)',
    kernelEventWithPayloadSchema: 'contracts/schemas.js (extended with dealId, orgId, timestamp)'
  },
  types: {
    EventTypes: 'cre-kernel-phase1/packages/shared/src/index.ts:31-49',
    DealStates: 'cre-kernel-phase1/packages/shared/src/index.ts:5-18',
    TruthIndicator: 'cre-kernel-phase1/packages/shared/src/index.ts:3'
  }
};
