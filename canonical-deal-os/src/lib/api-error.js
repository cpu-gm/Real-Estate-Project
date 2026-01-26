/**
 * Typed API Error Codes - matches server ErrorCode enum
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
 * Create a structured API error
 */
export function createApiError({
  message,
  status = 500,
  endpoint,
  code = ErrorCode.INTERNAL_ERROR,
  userSafeMessage,
  debugDetails,
  suggestion,
  field,
  details
}) {
  const error = new Error(message || "Request failed");
  error.name = "ApiError";
  error.status = status;
  error.endpoint = endpoint;
  error.code = code;
  error.userSafeMessage = userSafeMessage;
  error.suggestion = suggestion;
  error.field = field;
  error.details = details;
  if (import.meta.env?.DEV) {
    error.debugDetails = debugDetails;
  }
  error.isApiError = true;
  return error;
}

/**
 * Check if error is an ApiError
 */
export function isApiError(error) {
  return Boolean(error?.isApiError || error?.name === "ApiError");
}

/**
 * Check if error is an authentication error (needs login)
 */
export function isAuthError(error) {
  return [
    ErrorCode.AUTH_REQUIRED,
    ErrorCode.AUTH_INVALID_TOKEN,
    ErrorCode.AUTH_TOKEN_EXPIRED,
    ErrorCode.AUTH_SESSION_REVOKED
  ].includes(error?.code);
}

/**
 * Check if error is a validation error
 */
export function isValidationError(error) {
  return error?.code === ErrorCode.VALIDATION_FAILED;
}

/**
 * Check if error is a not found error
 */
export function isNotFoundError(error) {
  return error?.code === ErrorCode.NOT_FOUND;
}

/**
 * Check if error is a permission/authorization error
 */
export function isForbiddenError(error) {
  return [
    ErrorCode.FORBIDDEN_ROLE,
    ErrorCode.FORBIDDEN_ORG,
    ErrorCode.FORBIDDEN_DEAL_ACCESS,
    ErrorCode.FORBIDDEN_RESOURCE
  ].includes(error?.code);
}

/**
 * Check if error is a server/external error
 */
export function isServerError(error) {
  return [
    ErrorCode.KERNEL_UNAVAILABLE,
    ErrorCode.EXTERNAL_SERVICE_ERROR,
    ErrorCode.INTERNAL_ERROR
  ].includes(error?.code);
}

/**
 * Get user-friendly message from error
 */
export function getUserMessage(error) {
  if (error?.userSafeMessage) {
    return error.userSafeMessage;
  }
  if (error?.suggestion) {
    return `${error.message}. ${error.suggestion}`;
  }
  return error?.message || 'An unexpected error occurred';
}
