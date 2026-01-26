/**
 * Request Validation Middleware
 *
 * Provides Zod-based validation helpers for request bodies, params, and queries.
 * Throws ApiError on validation failure for consistent error handling.
 */

import { z } from 'zod';
import { ApiError } from '../lib/api-error.js';

/**
 * Validate request body against a Zod schema
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @returns {Function} Async function that validates and returns parsed data or throws ApiError
 *
 * @example
 * const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(6) });
 * const body = await validateBody(LoginSchema)(req, readJsonBody);
 */
export function validateBody(schema) {
  return async (req, readJsonBody) => {
    const body = await readJsonBody(req);
    const result = schema.safeParse(body ?? {});

    if (!result.success) {
      throw ApiError.fromZodError(result.error);
    }

    return result.data;
  };
}

/**
 * Validate URL params against a Zod schema
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @returns {Function} Function that validates params and returns parsed data or throws ApiError
 *
 * @example
 * const params = validateParams(UUIDParam)({ id: match[1] });
 */
export function validateParams(schema) {
  return (params) => {
    const result = schema.safeParse(params);

    if (!result.success) {
      throw ApiError.fromZodError(result.error);
    }

    return result.data;
  };
}

/**
 * Validate query params against a Zod schema
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @returns {Function} Function that validates query params and returns parsed data or throws ApiError
 *
 * @example
 * const query = validateQuery(PaginationQuery)(url);
 */
export function validateQuery(schema) {
  return (url) => {
    // Convert URL search params to plain object
    const params = {};
    for (const [key, value] of url.searchParams.entries()) {
      // Handle array params (e.g., ?status=A&status=B)
      if (params[key] !== undefined) {
        if (Array.isArray(params[key])) {
          params[key].push(value);
        } else {
          params[key] = [params[key], value];
        }
      } else {
        params[key] = value;
      }
    }

    const result = schema.safeParse(params);

    if (!result.success) {
      throw ApiError.fromZodError(result.error);
    }

    return result.data;
  };
}

/**
 * Inline validation helper - validates data and throws if invalid
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @param {*} data - Data to validate
 * @returns {*} Parsed and validated data
 * @throws {ApiError} If validation fails
 *
 * @example
 * const validEmail = validate(z.string().email(), userInput);
 */
export function validate(schema, data) {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw ApiError.fromZodError(result.error);
  }

  return result.data;
}

// ========== Common Param Schemas ==========

/**
 * UUID ID param - validates { id: "uuid-string" }
 */
export const UUIDParam = z.object({
  id: z.string().uuid('Invalid ID format - must be a valid UUID')
});

/**
 * Deal ID param - validates { dealId: "uuid-string" }
 */
export const DealIdParam = z.object({
  dealId: z.string().uuid('Invalid deal ID format')
});

/**
 * Submission ID param
 */
export const SubmissionIdParam = z.object({
  submissionId: z.string().uuid('Invalid submission ID format')
});

// ========== Common Query Schemas ==========

/**
 * Standard pagination query params
 */
export const PaginationQuery = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0)
});

/**
 * Optional deal filter
 */
export const DealFilterQuery = z.object({
  dealId: z.string().uuid().optional()
});

/**
 * Status filter (generic)
 */
export const StatusFilterQuery = z.object({
  status: z.string().optional()
});

// ========== Common Body Schemas ==========

/**
 * Email field
 */
export const EmailField = z.string().email('Invalid email address');

/**
 * Password field (min 6 chars)
 */
export const PasswordField = z.string().min(6, 'Password must be at least 6 characters');

/**
 * Non-empty string
 */
export const RequiredString = z.string().min(1, 'This field is required');

/**
 * Optional UUID
 */
export const OptionalUUID = z.string().uuid().optional().nullable();

/**
 * Boolean with default false
 */
export const BooleanDefault = z.coerce.boolean().default(false);
