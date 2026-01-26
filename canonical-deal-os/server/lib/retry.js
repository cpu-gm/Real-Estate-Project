/**
 * Retry with Exponential Backoff
 * Sprint 3: Scalability
 *
 * Provides retry logic for transient failures.
 */

import { createLogger } from './logger.js';

const log = createLogger('retry');
const DEBUG = process.env.DEBUG_RETRY === 'true';

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxAttempts - Maximum number of attempts (default: 3)
 * @param {number} options.baseDelayMs - Base delay between retries in ms (default: 1000)
 * @param {number} options.maxDelayMs - Maximum delay between retries in ms (default: 10000)
 * @param {number} options.factor - Exponential factor (default: 2)
 * @param {boolean} options.jitter - Add randomness to prevent thundering herd (default: true)
 * @param {Function} options.retryOn - Function to determine if error is retryable (default: all errors)
 * @param {Function} options.onRetry - Callback on each retry: (error, attempt) => void
 * @returns {Promise<any>} Result from fn
 */
export async function withRetry(fn, options = {}) {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    factor = 2,
    jitter = true,
    retryOn = () => true,  // Retry all errors by default
    onRetry = null
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (DEBUG) {
        log.debug(`Attempt ${attempt}/${maxAttempts}`);
      }
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        log.error(`All ${maxAttempts} attempts failed`, {
          error: error.message,
          code: error.code
        });
        throw error;
      }

      if (!retryOn(error)) {
        if (DEBUG) {
          log.debug('Error not retryable', { error: error.message });
        }
        throw error;
      }

      // Calculate delay with exponential backoff
      let delay = Math.min(baseDelayMs * Math.pow(factor, attempt - 1), maxDelayMs);

      // Add jitter to prevent thundering herd (±50%)
      if (jitter) {
        delay = delay * (0.5 + Math.random());
      }

      if (DEBUG) {
        log.debug(`Retrying in ${Math.round(delay)}ms`, {
          attempt,
          maxAttempts,
          error: error.message
        });
      }

      if (onRetry) {
        onRetry(error, attempt);
      }

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Check if error is retryable (network errors, 5xx, rate limiting)
 * @param {Error} error - Error to check
 * @returns {boolean} Whether error is retryable
 */
export function isRetryableError(error) {
  // Network errors
  if (error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNRESET' ||
      error.code === 'EAI_AGAIN' ||
      error.code === 'EPIPE') {
    return true;
  }

  // HTTP 5xx errors
  if (error.status >= 500 && error.status < 600) {
    return true;
  }

  // Rate limiting (429)
  if (error.status === 429) {
    return true;
  }

  // Kernel unavailable
  if (error.type === 'KERNEL_UNAVAILABLE' || error.code === 'KERNEL_UNAVAILABLE') {
    return true;
  }

  // OpenAI specific errors
  if (error.code === 'OPENAI_RATE_LIMIT' || error.code === 'OPENAI_API_ERROR') {
    return true;
  }

  return false;
}

/**
 * Check if error is a client error (not retryable)
 * @param {Error} error - Error to check
 * @returns {boolean} Whether error is a client error
 */
export function isClientError(error) {
  // 4xx errors (except 429 rate limiting)
  if (error.status >= 400 && error.status < 500 && error.status !== 429) {
    return true;
  }

  // Validation errors
  if (error.code === 'VALIDATION_FAILED' ||
      error.code === 'INVALID_REQUEST' ||
      error.code === 'BAD_REQUEST') {
    return true;
  }

  // Auth errors
  if (error.code === 'AUTH_REQUIRED' ||
      error.code === 'FORBIDDEN' ||
      error.status === 401 ||
      error.status === 403) {
    return true;
  }

  return false;
}

/**
 * Create a retryable version of a function
 * @param {Function} fn - Function to wrap
 * @param {Object} options - Retry options (same as withRetry)
 * @returns {Function} Wrapped function with retry
 */
export function makeRetryable(fn, options = {}) {
  return (...args) => withRetry(() => fn(...args), options);
}

/**
 * Create retry options for specific services
 */
export const retryProfiles = {
  // Kernel API - quick retries
  kernel: {
    maxAttempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    factor: 2,
    retryOn: isRetryableError
  },

  // OpenAI API - longer delays for rate limiting
  openai: {
    maxAttempts: 3,
    baseDelayMs: 2000,
    maxDelayMs: 30000,
    factor: 2,
    retryOn: isRetryableError
  },

  // SendGrid - moderate retries
  sendgrid: {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    factor: 2,
    retryOn: isRetryableError
  },

  // n8n webhooks - quick retries
  n8n: {
    maxAttempts: 2,
    baseDelayMs: 500,
    maxDelayMs: 3000,
    factor: 2,
    retryOn: isRetryableError
  },

  // Database operations - very quick retries
  database: {
    maxAttempts: 2,
    baseDelayMs: 100,
    maxDelayMs: 1000,
    factor: 2,
    jitter: false,
    retryOn: (error) => error.code === 'P2024' || error.code === 'P2034' // Prisma connection/timeout
  }
};

/**
 * Retry with a specific profile
 * @param {string} profile - Profile name (kernel, openai, sendgrid, n8n, database)
 * @param {Function} fn - Function to retry
 * @param {Object} overrides - Override profile options
 * @returns {Promise<any>} Result from fn
 */
export function withRetryProfile(profile, fn, overrides = {}) {
  const profileOptions = retryProfiles[profile];
  if (!profileOptions) {
    throw new Error(`Unknown retry profile: ${profile}`);
  }
  return withRetry(fn, { ...profileOptions, ...overrides });
}
