/**
 * Standardized API Error System
 *
 * Provides typed error codes and consistent error responses across all endpoints.
 * All API errors should use this class to ensure uniform error handling.
 */

export const ErrorCode = {
  // Authentication
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_INVALID_TOKEN: 'AUTH_INVALID_TOKEN',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_SESSION_REVOKED: 'AUTH_SESSION_REVOKED',

  // Authorization
  FORBIDDEN_ROLE: 'FORBIDDEN_ROLE',
  FORBIDDEN_ORG: 'FORBIDDEN_ORG',
  FORBIDDEN_DEAL_ACCESS: 'FORBIDDEN_DEAL_ACCESS',
  FORBIDDEN_RESOURCE: 'FORBIDDEN_RESOURCE',

  // Validation
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  CONTRACT_MISMATCH: 'CONTRACT_MISMATCH',

  // Resource
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  ALREADY_EXISTS: 'ALREADY_EXISTS',

  // Business Logic
  DEAL_LOCKED: 'DEAL_LOCKED',
  ACTION_BLOCKED: 'ACTION_BLOCKED',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  SELF_APPROVAL_FORBIDDEN: 'SELF_APPROVAL_FORBIDDEN',

  // External
  KERNEL_UNAVAILABLE: 'KERNEL_UNAVAILABLE',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',

  // Internal
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED'
};

/**
 * API Error class with typed codes and structured responses
 */
export class ApiError extends Error {
  /**
   * @param {string} code - Error code from ErrorCode enum
   * @param {string} message - Human-readable error message
   * @param {Object} options
   * @param {number} [options.status=500] - HTTP status code
   * @param {*} [options.details=null] - Additional error details
   * @param {string} [options.field=null] - Field name for validation errors
   * @param {string} [options.suggestion=null] - Actionable suggestion for the user
   */
  constructor(code, message, { status = 500, details = null, field = null, suggestion = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.field = field;
    this.suggestion = suggestion;
  }

  // ========== Factory Methods ==========

  /**
   * Authentication required error
   */
  static auth(message = 'Authentication required', suggestion = 'Please log in') {
    return new ApiError(ErrorCode.AUTH_REQUIRED, message, { status: 401, suggestion });
  }

  /**
   * Token expired error
   */
  static tokenExpired() {
    return new ApiError(ErrorCode.AUTH_TOKEN_EXPIRED, 'Your session has expired', {
      status: 401,
      suggestion: 'Please log in again'
    });
  }

  /**
   * Invalid token error
   */
  static invalidToken(message = 'Invalid authentication token') {
    return new ApiError(ErrorCode.AUTH_INVALID_TOKEN, message, {
      status: 401,
      suggestion: 'Please log in again'
    });
  }

  /**
   * Generic forbidden error
   */
  static forbidden(message = 'Access denied', code = ErrorCode.FORBIDDEN_RESOURCE) {
    return new ApiError(code, message, { status: 403 });
  }

  /**
   * Role requirement not met
   */
  static forbiddenRole(requiredRole) {
    return new ApiError(ErrorCode.FORBIDDEN_ROLE, `${requiredRole} role required`, {
      status: 403,
      suggestion: `Contact your administrator for ${requiredRole} access`
    });
  }

  /**
   * Cross-organization access denied
   */
  static forbiddenOrg(resourceName = 'resource') {
    return new ApiError(ErrorCode.FORBIDDEN_ORG, `Access denied - ${resourceName} belongs to different organization`, {
      status: 403
    });
  }

  /**
   * Deal access denied
   */
  static forbiddenDeal() {
    return new ApiError(ErrorCode.FORBIDDEN_DEAL_ACCESS, 'Access denied to this deal', {
      status: 403
    });
  }

  /**
   * Resource not found
   */
  static notFound(resource = 'Resource') {
    return new ApiError(ErrorCode.NOT_FOUND, `${resource} not found`, { status: 404 });
  }

  /**
   * Validation error from manual check
   */
  static validation(message, details = null, field = null) {
    return new ApiError(ErrorCode.VALIDATION_FAILED, message, {
      status: 400,
      details,
      field
    });
  }

  /**
   * Create from Zod validation error
   */
  static fromZodError(zodError) {
    const firstIssue = zodError.issues?.[0];
    const field = firstIssue?.path?.join('.') || null;
    const message = firstIssue?.message || 'Validation failed';

    return new ApiError(ErrorCode.VALIDATION_FAILED, message, {
      status: 400,
      details: zodError.flatten?.() || zodError.issues,
      field
    });
  }

  /**
   * Conflict error (e.g., duplicate resource)
   */
  static conflict(message, details = null) {
    return new ApiError(ErrorCode.CONFLICT, message, { status: 409, details });
  }

  /**
   * Already exists error
   */
  static alreadyExists(resource = 'Resource') {
    return new ApiError(ErrorCode.ALREADY_EXISTS, `${resource} already exists`, { status: 409 });
  }

  /**
   * Kernel service unavailable
   */
  static kernelUnavailable(error = null) {
    return new ApiError(ErrorCode.KERNEL_UNAVAILABLE, 'Kernel service unavailable', {
      status: 502,
      details: error?.message || null
    });
  }

  /**
   * External service error
   */
  static externalService(serviceName, error = null) {
    return new ApiError(ErrorCode.EXTERNAL_SERVICE_ERROR, `${serviceName} service error`, {
      status: 502,
      details: error?.message || null
    });
  }

  /**
   * Internal server error
   */
  static internal(message = 'Internal server error', details = null) {
    return new ApiError(ErrorCode.INTERNAL_ERROR, message, { status: 500, details });
  }

  /**
   * Business logic: action blocked
   */
  static actionBlocked(message, details = null) {
    return new ApiError(ErrorCode.ACTION_BLOCKED, message, { status: 400, details });
  }

  /**
   * Business logic: approval required
   */
  static approvalRequired(approvalType) {
    return new ApiError(ErrorCode.APPROVAL_REQUIRED, `${approvalType} approval required`, {
      status: 403,
      suggestion: `Request ${approvalType} approval before proceeding`
    });
  }

  /**
   * Business logic: self-approval forbidden
   */
  static selfApprovalForbidden() {
    return new ApiError(ErrorCode.SELF_APPROVAL_FORBIDDEN, 'Cannot approve your own submission', {
      status: 403
    });
  }

  // ========== Response Formatting ==========

  /**
   * Convert to standardized response object
   * @param {string} [requestId] - Optional request ID for tracing
   */
  toResponse(requestId = null) {
    const response = {
      error: {
        code: this.code,
        message: this.message
      },
      timestamp: new Date().toISOString()
    };

    // Only include optional fields if they have values
    if (this.details !== null) {
      response.error.details = this.details;
    }
    if (this.field !== null) {
      response.error.field = this.field;
    }
    if (this.suggestion !== null) {
      response.error.suggestion = this.suggestion;
    }
    if (requestId) {
      response.requestId = requestId;
    }

    return response;
  }
}

/**
 * Check if an error is an ApiError
 */
export function isApiError(error) {
  return error instanceof ApiError || error?.name === 'ApiError';
}
