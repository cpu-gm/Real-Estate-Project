/**
 * Prisma Query Metrics Middleware
 * Sprint 5: Production Hardening
 *
 * Provides database query monitoring and performance insights.
 * Integrates with the metrics system for Prometheus export.
 */

import { recordDbQuery } from './metrics.js';
import { createLogger } from './logger.js';

const log = createLogger('prisma-metrics');

// Slow query threshold (milliseconds)
const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '500', 10);

// Enable debug logging
const DEBUG = process.env.DEBUG_PRISMA_METRICS === 'true';

// Query count tracking for N+1 detection
const queryCountWindow = new Map();
const N1_DETECTION_WINDOW_MS = 1000;
const N1_THRESHOLD = 5;  // Same model queried 5+ times in 1 second

/**
 * Create Prisma middleware for query metrics
 *
 * Usage:
 *   import { getPrisma } from './db.js';
 *   import { createPrismaMetricsMiddleware } from './lib/prisma-metrics.js';
 *
 *   const prisma = getPrisma();
 *   prisma.$use(createPrismaMetricsMiddleware());
 *
 * @returns {Function} Prisma middleware function
 */
export function createPrismaMetricsMiddleware() {
  return async (params, next) => {
    const start = Date.now();
    const model = params.model || 'unknown';
    const action = params.action || 'unknown';

    // Track query for N+1 detection
    const queryKey = `${model}:${action}`;
    const now = Date.now();

    // Clean old entries from window
    for (const [key, data] of queryCountWindow.entries()) {
      if (now - data.firstSeen > N1_DETECTION_WINDOW_MS) {
        queryCountWindow.delete(key);
      }
    }

    // Track this query
    if (!queryCountWindow.has(queryKey)) {
      queryCountWindow.set(queryKey, { count: 1, firstSeen: now });
    } else {
      const data = queryCountWindow.get(queryKey);
      data.count++;

      // Detect potential N+1
      if (data.count === N1_THRESHOLD) {
        log.warn('Potential N+1 query detected', {
          model,
          action,
          count: data.count,
          windowMs: N1_DETECTION_WINDOW_MS,
          suggestion: `Consider using 'include' to eager load ${model} relations`
        });
      }
    }

    // Execute the query
    let result;
    let error;
    try {
      result = await next(params);
    } catch (e) {
      error = e;
    }

    const duration = Date.now() - start;

    // Record metrics
    recordDbQuery(action, model, duration);

    // Log slow queries
    if (duration > SLOW_QUERY_THRESHOLD_MS) {
      log.warn('Slow query detected', {
        model,
        action,
        durationMs: duration,
        thresholdMs: SLOW_QUERY_THRESHOLD_MS,
        args: DEBUG ? sanitizeArgs(params.args) : '[redacted]'
      });
    } else if (DEBUG) {
      log.debug('Query executed', {
        model,
        action,
        durationMs: duration
      });
    }

    // Re-throw any error
    if (error) {
      throw error;
    }

    return result;
  };
}

/**
 * Sanitize query arguments for logging (remove sensitive data)
 */
function sanitizeArgs(args) {
  if (!args) return null;

  const sanitized = { ...args };

  // Remove potential sensitive fields
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'ssn', 'taxId'];

  const sanitizeObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;

    const result = Array.isArray(obj) ? [...obj] : { ...obj };

    for (const key of Object.keys(result)) {
      if (sensitiveFields.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
        result[key] = '[REDACTED]';
      } else if (typeof result[key] === 'object') {
        result[key] = sanitizeObject(result[key]);
      }
    }

    return result;
  };

  return sanitizeObject(sanitized);
}

/**
 * Get current N+1 detection stats (for debugging)
 */
export function getN1Stats() {
  const stats = [];
  for (const [key, data] of queryCountWindow.entries()) {
    if (data.count >= N1_THRESHOLD) {
      const [model, action] = key.split(':');
      stats.push({
        model,
        action,
        count: data.count,
        age: Date.now() - data.firstSeen
      });
    }
  }
  return stats;
}

/**
 * Reset N+1 tracking (for testing)
 */
export function resetN1Tracking() {
  queryCountWindow.clear();
}

/**
 * Query timing helper for manual instrumentation
 *
 * Usage:
 *   const timer = startQueryTimer('User', 'findMany');
 *   const users = await prisma.user.findMany();
 *   timer.end();
 *
 * @param {string} model - Model name
 * @param {string} action - Action name
 * @returns {{ end: Function }} Timer object with end method
 */
export function startQueryTimer(model, action) {
  const start = Date.now();

  return {
    end: () => {
      const duration = Date.now() - start;
      recordDbQuery(action, model, duration);

      if (duration > SLOW_QUERY_THRESHOLD_MS) {
        log.warn('Slow query detected (manual timing)', {
          model,
          action,
          durationMs: duration
        });
      }

      return duration;
    }
  };
}

/**
 * Decorator for timing async functions that make DB queries
 *
 * Usage:
 *   const timedFn = withQueryTiming('BatchProcess', 'bulkUpdate', myAsyncFn);
 *   await timedFn(arg1, arg2);
 *
 * @param {string} model - Model name for metrics
 * @param {string} action - Action name for metrics
 * @param {Function} fn - Async function to time
 * @returns {Function} Wrapped function
 */
export function withQueryTiming(model, action, fn) {
  return async (...args) => {
    const timer = startQueryTimer(model, action);
    try {
      return await fn(...args);
    } finally {
      timer.end();
    }
  };
}
