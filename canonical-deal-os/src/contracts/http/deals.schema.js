/**
 * Deal HTTP Schemas
 *
 * Request/response schemas for deal-related endpoints.
 * MIGRATED from src/lib/contracts.js
 */

import { z } from 'zod';

/**
 * Deal profile schema (subset used for create requests)
 * Full schema definition lives in src/lib/contracts.js:dealProfileSchema
 * Duplicated here to avoid circular imports.
 */
const dealProfileForCreateSchema = z.object({
  asset_type: z.string().nullable().optional(),
  asset_address: z.string().nullable().optional(),
  asset_city: z.string().nullable().optional(),
  asset_state: z.string().nullable().optional(),
  square_footage: z.number().nullable().optional(),
  unit_count: z.number().nullable().optional(),
  year_built: z.number().nullable().optional(),
  purchase_price: z.number().nullable().optional(),
  noi: z.number().nullable().optional(),
  cap_rate: z.number().nullable().optional(),
  ltv: z.number().nullable().optional(),
  dscr: z.number().nullable().optional(),
  senior_debt: z.number().nullable().optional(),
  mezzanine_debt: z.number().nullable().optional(),
  preferred_equity: z.number().nullable().optional(),
  common_equity: z.number().nullable().optional(),
  gp_name: z.string().nullable().optional(),
  lender_name: z.string().nullable().optional(),
  deal_summary: z.string().nullable().optional(),
  ai_derived: z.boolean().optional(),
  verification_status: z.string().nullable().optional(),
  next_action: z.string().nullable().optional(),
  truth_health: z.string().nullable().optional()
});

/**
 * POST /api/deals - Create deal request
 *
 * @example
 * {
 *   "name": "123 Main Street Acquisition",
 *   "profile": { "asset_type": "Multifamily", ... }
 * }
 */
export const createDealRequestSchema = z.object({
  name: z.string().min(1),
  profile: dealProfileForCreateSchema.optional(),
  sessionId: z.string().optional()
});
