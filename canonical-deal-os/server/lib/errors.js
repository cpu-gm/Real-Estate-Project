/**
 * Error Taxonomy
 *
 * Sprint 2, Day 15: Production Readiness
 *
 * Standardized error classes for consistent error handling across the platform.
 *
 * Error Categories:
 * - 4xx Client Errors: Invalid requests, authentication, authorization
 * - 5xx Server Errors: Internal failures, external service failures
 *
 * Usage:
 * ```javascript
 * import { AuthRequiredError, ForbiddenOrgError, ValidationError } from '../lib/errors.js';
 *
 * if (!authUser) {
 *   throw new AuthRequiredError('Authentication token required');
 * }
 *
 * if (resource.organizationId !== authUser.organizationId) {
 *   throw new ForbiddenOrgError('Resource belongs to different organization');
 * }
 * ```
 */

/**
 * Base application error with code and metadata support
 */
export class AppError extends Error {
  constructor(message, code, statusCode = 500, metadata = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.metadata = metadata;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        timestamp: this.timestamp,
        ...(Object.keys(this.metadata).length > 0 && { metadata: this.metadata })
      }
    };
  }
}

// =============================================================================
// 401 AUTHENTICATION ERRORS
// =============================================================================

/**
 * 401 - Authentication required
 * User must provide valid credentials
 */
export class AuthRequiredError extends AppError {
  constructor(message = 'Authentication required', metadata = {}) {
    super(message, 'AUTH_REQUIRED', 401, metadata);
  }
}

/**
 * 401 - Invalid token
 * Token is malformed or expired
 */
export class InvalidTokenError extends AppError {
  constructor(message = 'Invalid or expired token', metadata = {}) {
    super(message, 'INVALID_TOKEN', 401, metadata);
  }
}

/**
 * 401 - Session expired
 * User session has timed out
 */
export class SessionExpiredError extends AppError {
  constructor(message = 'Session expired, please log in again', metadata = {}) {
    super(message, 'SESSION_EXPIRED', 401, metadata);
  }
}

// =============================================================================
// 403 AUTHORIZATION ERRORS
// =============================================================================

/**
 * 403 - Forbidden role
 * User's role doesn't permit this action
 */
export class ForbiddenRoleError extends AppError {
  constructor(message = 'Insufficient role privileges', metadata = {}) {
    super(message, 'FORBIDDEN_ROLE', 403, metadata);
  }
}

/**
 * 403 - Forbidden organization (returns 404 to prevent enumeration)
 * Resource belongs to a different organization
 * NOTE: In HTTP response, this should be converted to 404
 */
export class ForbiddenOrgError extends AppError {
  constructor(message = 'Resource not found', metadata = {}) {
    // Use 404 status to prevent resource enumeration
    super(message, 'FORBIDDEN_ORG', 404, metadata);
  }
}

/**
 * 403 - Forbidden action
 * User cannot perform this specific action
 */
export class ForbiddenActionError extends AppError {
  constructor(message = 'Action not permitted', metadata = {}) {
    super(message, 'FORBIDDEN_ACTION', 403, metadata);
  }
}

/**
 * 403 - Account not active
 * User account is suspended or pending
 */
export class AccountInactiveError extends AppError {
  constructor(message = 'Account is not active', metadata = {}) {
    super(message, 'ACCOUNT_INACTIVE', 403, metadata);
  }
}

// =============================================================================
// 400 VALIDATION ERRORS
// =============================================================================

/**
 * 400 - Validation failed
 * Request body failed schema validation
 */
export class ValidationError extends AppError {
  constructor(message = 'Validation failed', errors = [], metadata = {}) {
    super(message, 'VALIDATION_FAILED', 400, { ...metadata, errors });
    this.errors = errors;
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        timestamp: this.timestamp,
        errors: this.errors
      }
    };
  }
}

/**
 * 400 - Bad request
 * Request is malformed or missing required data
 */
export class BadRequestError extends AppError {
  constructor(message = 'Bad request', metadata = {}) {
    super(message, 'BAD_REQUEST', 400, metadata);
  }
}

/**
 * 400 - Invalid state transition
 * Resource cannot transition to requested state
 */
export class InvalidStateTransitionError extends AppError {
  constructor(message = 'Invalid state transition', metadata = {}) {
    super(message, 'INVALID_STATE_TRANSITION', 400, metadata);
  }
}

// =============================================================================
// 404 NOT FOUND ERRORS
// =============================================================================

/**
 * 404 - Not found
 * Resource does not exist
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', metadata = {}) {
    super(message, 'NOT_FOUND', 404, metadata);
  }
}

/**
 * 404 - Deal not found
 * Specific deal does not exist
 */
export class DealNotFoundError extends NotFoundError {
  constructor(dealId, metadata = {}) {
    super('Deal not found', { ...metadata, dealId });
    this.code = 'DEAL_NOT_FOUND';
  }
}

// =============================================================================
// 409 CONFLICT ERRORS
// =============================================================================

/**
 * 409 - Conflict
 * Operation cannot be completed due to conflict
 */
export class ConflictError extends AppError {
  constructor(message = 'Operation conflicts with existing resource', metadata = {}) {
    super(message, 'CONFLICT', 409, metadata);
  }
}

/**
 * 409 - Concurrency error
 * Resource was modified by another user
 */
export class ConcurrencyError extends AppError {
  constructor(message = 'Resource was modified by another user', metadata = {}) {
    super(message, 'CONCURRENCY_ERROR', 409, metadata);
  }
}

/**
 * 409 - Duplicate resource
 * Resource with same key already exists
 */
export class DuplicateError extends AppError {
  constructor(message = 'Resource already exists', metadata = {}) {
    super(message, 'DUPLICATE_RESOURCE', 409, metadata);
  }
}

// =============================================================================
// 429 RATE LIMIT ERRORS
// =============================================================================

/**
 * 429 - Rate limit exceeded
 * Too many requests from this client
 */
export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded', retryAfter = 60, metadata = {}) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, { ...metadata, retryAfter });
    this.retryAfter = retryAfter;
  }
}

// =============================================================================
// 500 INTERNAL SERVER ERRORS
// =============================================================================

/**
 * 500 - Internal error
 * Unexpected server error
 */
export class InternalError extends AppError {
  constructor(message = 'Internal server error', metadata = {}) {
    super(message, 'INTERNAL_ERROR', 500, metadata);
  }
}

/**
 * 500 - Database error
 * Database operation failed
 */
export class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', metadata = {}) {
    super(message, 'DATABASE_ERROR', 500, metadata);
  }
}

// =============================================================================
// 503 SERVICE UNAVAILABLE ERRORS
// =============================================================================

/**
 * 503 - Service unavailable
 * External service is not responding
 */
export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable', metadata = {}) {
    super(message, 'SERVICE_UNAVAILABLE', 503, metadata);
  }
}

/**
 * 503 - Kernel unavailable
 * Kernel API is not responding
 */
export class KernelUnavailableError extends ServiceUnavailableError {
  constructor(metadata = {}) {
    super('Kernel service is temporarily unavailable', metadata);
    this.code = 'KERNEL_UNAVAILABLE';
  }
}

/**
 * 503 - External service error
 * Third-party service (OpenAI, SendGrid, etc.) failed
 */
export class ExternalServiceError extends ServiceUnavailableError {
  constructor(serviceName, message, metadata = {}) {
    super(message || `${serviceName} service is temporarily unavailable`, { ...metadata, service: serviceName });
    this.code = 'EXTERNAL_SERVICE_ERROR';
    this.serviceName = serviceName;
  }
}

// =============================================================================
// ERROR HANDLER UTILITY
// =============================================================================

/**
 * Convert any error to AppError format
 */
export function normalizeError(error) {
  if (error instanceof AppError) {
    return error;
  }

  // Prisma errors
  if (error.code === 'P2002') {
    return new DuplicateError('Resource with this key already exists', {
      field: error.meta?.target
    });
  }

  if (error.code === 'P2025') {
    return new NotFoundError('Resource not found');
  }

  // Generic error
  return new InternalError(
    process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : error.message
  );
}

/**
 * Express error handler middleware
 */
export function errorHandler(err, req, res, next) {
  const error = normalizeError(err);

  // Log error for debugging
  console.error(`[ERROR] ${error.code}: ${error.message}`, {
    requestId: req.requestId,
    userId: req.authUser?.id,
    path: req.url,
    method: req.method,
    stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
  });

  // Send response
  res.status(error.statusCode).json(error.toJSON());
}

/**
 * Error code reference for documentation
 */
export const ERROR_CODES = {
  // 401
  AUTH_REQUIRED: 'Authentication token is required',
  INVALID_TOKEN: 'Token is malformed or expired',
  SESSION_EXPIRED: 'Session has timed out',

  // 403
  FORBIDDEN_ROLE: 'User role does not permit this action',
  FORBIDDEN_ORG: 'Resource belongs to different organization (returns 404)',
  FORBIDDEN_ACTION: 'Specific action is not permitted',
  ACCOUNT_INACTIVE: 'User account is not active',

  // 400
  VALIDATION_FAILED: 'Request body failed schema validation',
  BAD_REQUEST: 'Request is malformed',
  INVALID_STATE_TRANSITION: 'Resource cannot transition to this state',

  // 404
  NOT_FOUND: 'Resource does not exist',
  DEAL_NOT_FOUND: 'Specific deal not found',

  // 409
  CONFLICT: 'Operation conflicts with existing resource',
  CONCURRENCY_ERROR: 'Resource modified by another user',
  DUPLICATE_RESOURCE: 'Resource with this key exists',

  // 429
  RATE_LIMIT_EXCEEDED: 'Too many requests',

  // 500
  INTERNAL_ERROR: 'Unexpected server error',
  DATABASE_ERROR: 'Database operation failed',

  // 503
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable',
  KERNEL_UNAVAILABLE: 'Kernel API not responding',
  EXTERNAL_SERVICE_ERROR: 'Third-party service failed'
};

export default {
  AppError,
  AuthRequiredError,
  InvalidTokenError,
  SessionExpiredError,
  ForbiddenRoleError,
  ForbiddenOrgError,
  ForbiddenActionError,
  AccountInactiveError,
  ValidationError,
  BadRequestError,
  InvalidStateTransitionError,
  NotFoundError,
  DealNotFoundError,
  ConflictError,
  ConcurrencyError,
  DuplicateError,
  RateLimitError,
  InternalError,
  DatabaseError,
  ServiceUnavailableError,
  KernelUnavailableError,
  ExternalServiceError,
  normalizeError,
  errorHandler,
  ERROR_CODES
};
