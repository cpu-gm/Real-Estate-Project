/**
 * Request Logger Middleware
 *
 * Logs all requests with timing and captures errors for debugging.
 * Recent errors are stored in memory for the debug status endpoint.
 *
 * Provides withErrorHandling() for global error handling with ApiError support.
 */

import crypto from 'crypto';
import { ApiError, isApiError } from '../lib/api-error.js';
import { logErrorForClaude } from '../lib/error-log.js';
import { writeDetailedErrorLog } from '../lib/error-context.js';

const MAX_RECENT_ERRORS = 100;
const recentErrors = [];
const requestStats = {
  total: 0,
  successful: 0,
  failed: 0,
  byPath: new Map(),
};

/**
 * Add an error to the recent errors list
 */
export function addRecentError(error) {
  recentErrors.unshift({
    id: Date.now() + Math.random().toString(36).slice(2),
    timestamp: new Date().toISOString(),
    ...error,
  });
  if (recentErrors.length > MAX_RECENT_ERRORS) {
    recentErrors.pop();
  }
}

/**
 * Get recent errors
 */
export function getRecentErrors(limit = 50) {
  return recentErrors.slice(0, limit);
}

/**
 * Get request statistics
 */
export function getRequestStats() {
  return {
    total: requestStats.total,
    successful: requestStats.successful,
    failed: requestStats.failed,
    successRate: requestStats.total > 0
      ? ((requestStats.successful / requestStats.total) * 100).toFixed(1) + '%'
      : 'N/A',
    topPaths: Array.from(requestStats.byPath.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([path, stats]) => ({
        path,
        count: stats.count,
        errors: stats.errors,
        avgLatency: Math.round(stats.totalLatency / stats.count),
      })),
  };
}

/**
 * Clear all stats and errors
 */
export function clearStats() {
  recentErrors.length = 0;
  requestStats.total = 0;
  requestStats.successful = 0;
  requestStats.failed = 0;
  requestStats.byPath.clear();
}

/**
 * Wrap a request handler with logging
 */
export function withLogging(handler, routeName = null) {
  return async (req, res) => {
    const start = Date.now();
    const method = req.method;
    const path = routeName || req.url.split('?')[0];

    requestStats.total++;

    // Track by path
    if (!requestStats.byPath.has(path)) {
      requestStats.byPath.set(path, { count: 0, errors: 0, totalLatency: 0 });
    }
    const pathStats = requestStats.byPath.get(path);
    pathStats.count++;

    // Capture original methods to intercept status
    const originalEnd = res.end.bind(res);
    let statusCode = 200;
    let responseBody = null;

    res.end = function(chunk, encoding) {
      const latency = Date.now() - start;
      pathStats.totalLatency += latency;

      if (res.statusCode >= 400) {
        statusCode = res.statusCode;
        requestStats.failed++;
        pathStats.errors++;

        // Try to parse error from response
        let errorMessage = 'Unknown error';
        if (chunk) {
          try {
            const body = JSON.parse(chunk.toString());
            errorMessage = body.message || body.error || 'Unknown error';
            responseBody = body;
          } catch {
            errorMessage = chunk.toString().slice(0, 200);
          }
        }

        addRecentError({
          method,
          path,
          status: statusCode,
          message: errorMessage,
          latency,
          details: responseBody?.details || null,
        });

        // Log to console in development
        if (process.env.NODE_ENV !== 'production') {
          console.error(`[${method}] ${path} - ${statusCode} (${latency}ms): ${errorMessage}`);
        }
      } else {
        requestStats.successful++;

        // Log successful requests in verbose mode
        if (process.env.BFF_VERBOSE_LOGGING === 'true') {
          console.log(`[${method}] ${path} - ${res.statusCode} (${latency}ms)`);
        }
      }

      return originalEnd(chunk, encoding);
    };

    try {
      await handler(req, res);
    } catch (error) {
      const latency = Date.now() - start;

      requestStats.failed++;
      pathStats.errors++;

      addRecentError({
        method,
        path,
        status: 500,
        message: error.message,
        latency,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      });

      console.error(`[${method}] ${path} - UNCAUGHT ERROR (${latency}ms):`, error);

      // Send error response if not already sent
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          message: 'Internal server error',
          details: process.env.NODE_ENV !== 'production' ? error.message : null,
        }));
      }
    }
  };
}

/**
 * Global error handling wrapper with ApiError support
 *
 * Wraps a request handler to:
 * - Catch ApiError and send standardized response
 * - Catch Zod errors and convert to ApiError
 * - Catch unexpected errors, log stack, return safe 500
 * - Add X-Request-Id header for tracing
 *
 * @param {Function} handler - Async request handler (req, res) => Promise
 * @param {string} [routeName] - Optional route name for logging
 */
export function withErrorHandling(handler, routeName = null) {
  return async (req, res) => {
    const requestId = crypto.randomUUID().slice(0, 8);
    const start = Date.now();
    const method = req.method;
    const path = routeName || req.url?.split('?')[0] || '/';

    // Attach requestId to request for downstream use
    req.requestId = requestId;

    // Attach request to response so sendError() can access it for logging
    res._req = req;

    requestStats.total++;

    // Track by path
    if (!requestStats.byPath.has(path)) {
      requestStats.byPath.set(path, { count: 0, errors: 0, totalLatency: 0 });
    }
    const pathStats = requestStats.byPath.get(path);
    pathStats.count++;

    try {
      await handler(req, res);

      // Track successful requests
      if (!res.headersSent || res.statusCode < 400) {
        requestStats.successful++;
      }
    } catch (error) {
      const latency = Date.now() - start;

      requestStats.failed++;
      pathStats.errors++;

      // Handle ApiError (expected errors with typed codes)
      if (isApiError(error)) {
        logErrorToConsole(method, path, error.status, error.message, latency, requestId);
        const errorData = {
          requestId,
          method,
          path,
          status: error.status,
          code: error.code,
          message: error.message,
          suggestion: error.suggestion,
          details: error.details,
          latency
        };
        addRecentError(errorData);
        logErrorForClaude(errorData);
        // Write detailed context for Claude (async, don't wait)
        writeDetailedErrorLog(errorData, req).catch(() => {});
        return sendApiErrorResponse(res, error, requestId);
      }

      // Handle Zod errors that slipped through validation helpers
      if (error.name === 'ZodError') {
        const apiError = ApiError.fromZodError(error);
        logErrorToConsole(method, path, 400, 'Validation error', latency, requestId);
        const errorData = {
          requestId,
          method,
          path,
          status: 400,
          code: 'VALIDATION_FAILED',
          message: apiError.message,
          details: apiError.details,
          latency
        };
        addRecentError(errorData);
        logErrorForClaude(errorData);
        // Write detailed context for Claude (async, don't wait)
        writeDetailedErrorLog(errorData, req).catch(() => {});
        return sendApiErrorResponse(res, apiError, requestId);
      }

      // Unexpected errors - log full stack, return safe message
      console.error(`[${requestId}] [${method}] ${path} - UNCAUGHT ERROR (${latency}ms):`, error);

      const errorData = {
        requestId,
        method,
        path,
        status: 500,
        code: 'INTERNAL_ERROR',
        message: error.message,
        latency,
        stack: error.stack // Always include stack for Claude to analyze
      };
      addRecentError({
        ...errorData,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      });
      logErrorForClaude(errorData);
      // Write detailed context for Claude (async, don't wait)
      writeDetailedErrorLog(errorData, req).catch(() => {});

      if (!res.headersSent) {
        const internalError = ApiError.internal(
          process.env.NODE_ENV !== 'production' ? error.message : 'An unexpected error occurred'
        );
        return sendApiErrorResponse(res, internalError, requestId);
      }
    }
  };
}

/**
 * Send standardized API error response
 */
function sendApiErrorResponse(res, apiError, requestId) {
  res.writeHead(apiError.status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'X-Request-Id': requestId
  });
  res.end(JSON.stringify(apiError.toResponse(requestId)));
}

/**
 * Log error to console with consistent format
 */
function logErrorToConsole(method, path, status, message, latency, requestId) {
  const level = status >= 500 ? 'ERROR' : 'WARN';
  console.error(`[${requestId}] [${level}] [${method}] ${path} - ${status} (${latency}ms): ${message}`);
}
