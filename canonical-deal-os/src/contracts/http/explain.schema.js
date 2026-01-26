/**
 * Explain HTTP Schemas
 *
 * Schemas for kernel explain endpoints (action gating).
 * MIGRATED from src/lib/contracts.js
 */

import { z } from 'zod';

/**
 * Individual reason for blocking an action
 */
export const explainReasonSchema = z.object({
  type: z.string(),
  message: z.string(),
  materialType: z.string().nullable().optional(),
  requiredTruth: z.string().nullable().optional(),
  currentTruth: z.string().nullable().optional(),
  satisfiedByOverride: z.boolean().optional()
});

/**
 * Response when kernel blocks an action
 *
 * @example
 * {
 *   "action": "APPROVE_DEAL",
 *   "status": "BLOCKED",
 *   "reasons": [{ "type": "MISSING_MATERIAL", ... }],
 *   "nextSteps": [{ "description": "Upload...", ... }]
 * }
 */
export const explainBlockSchema = z.object({
  action: z.string(),
  status: z.literal("BLOCKED"),
  reasons: z.array(explainReasonSchema),
  nextSteps: z.array(
    z.object({
      description: z.string(),
      canBeFixedByRoles: z.array(z.string()),
      canBeOverriddenByRoles: z.array(z.string())
    })
  )
}).passthrough();
