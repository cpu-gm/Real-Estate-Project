/**
 * Sentry Error Tracking
 * Sprint 2: Observability
 *
 * Provides centralized error tracking for production monitoring.
 * Integrates with existing error-log.js for development debugging.
 */

import * as Sentry from '@sentry/node';

const DEBUG = process.env.DEBUG_SENTRY === 'true';

function log(level, message, context = {}) {
  if (DEBUG || level === 'ERROR') {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      component: 'sentry',
      message,
      ...context
    }));
  }
}

let initialized = false;

/**
 * Initialize Sentry (call once at startup)
 * @returns {boolean} Whether initialization succeeded
 */
export function initSentry() {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    log('WARN', 'SENTRY_DSN not configured - error tracking disabled');
    return false;
  }

  if (initialized) {
    log('DEBUG', 'Sentry already initialized');
    return true;
  }

  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.APP_VERSION || 'unknown',

      // Performance monitoring (10% of transactions in production)
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

      // Filter out health checks and common noise
      beforeSend(event, hint) {
        // Skip health check errors
        if (event.request?.url?.includes('/health') || event.request?.url?.includes('/metrics')) {
          return null;
        }

        // Skip 4xx client errors (not our fault)
        const statusCode = event.contexts?.response?.status_code;
        if (statusCode && statusCode >= 400 && statusCode < 500) {
          return null;
        }

        log('DEBUG', 'Sending event to Sentry', {
          eventId: event.event_id,
          message: event.message
        });

        return event;
      },

      // Scrub sensitive data
      beforeBreadcrumb(breadcrumb) {
        // Remove Authorization headers from breadcrumbs
        if (breadcrumb.data?.headers?.Authorization) {
          breadcrumb.data.headers.Authorization = '[REDACTED]';
        }
        if (breadcrumb.data?.headers?.authorization) {
          breadcrumb.data.headers.authorization = '[REDACTED]';
        }
        return breadcrumb;
      }
    });

    initialized = true;
    log('INFO', 'Sentry initialized', {
      environment: process.env.NODE_ENV,
      release: process.env.APP_VERSION
    });

    return true;
  } catch (error) {
    log('ERROR', 'Failed to initialize Sentry', { error: error.message });
    return false;
  }
}

/**
 * Check if Sentry is initialized
 * @returns {boolean}
 */
export function isSentryInitialized() {
  return initialized;
}

/**
 * Capture an exception with context
 * @param {Error} error - The error to capture
 * @param {Object} context - Additional context
 * @param {string} context.userId - User ID
 * @param {string} context.requestId - Request ID
 * @param {string} context.path - Request path
 * @param {string} context.organizationId - Organization ID
 * @param {Object} context.extra - Additional data
 */
export function captureException(error, context = {}) {
  if (!initialized) {
    log('DEBUG', 'Sentry not initialized, skipping capture', { error: error.message });
    return null;
  }

  Sentry.withScope((scope) => {
    // Add user context if available
    if (context.userId) {
      scope.setUser({ id: context.userId });
    }

    // Add request context as tags
    if (context.requestId) {
      scope.setTag('request_id', context.requestId);
    }

    if (context.path) {
      scope.setTag('path', context.path);
    }

    if (context.organizationId) {
      scope.setTag('organization_id', context.organizationId);
    }

    if (context.method) {
      scope.setTag('method', context.method);
    }

    // Add extra context data
    if (context.extra) {
      scope.setExtras(context.extra);
    }

    Sentry.captureException(error);
  });

  log('DEBUG', 'Exception captured', {
    errorMessage: error.message,
    requestId: context.requestId
  });
}

/**
 * Capture a message (non-exception event)
 * @param {string} message - The message to capture
 * @param {string} level - Severity level (debug, info, warning, error, fatal)
 * @param {Object} context - Additional context
 */
export function captureMessage(message, level = 'info', context = {}) {
  if (!initialized) {
    return null;
  }

  Sentry.withScope((scope) => {
    if (context.userId) {
      scope.setUser({ id: context.userId });
    }

    if (context.requestId) {
      scope.setTag('request_id', context.requestId);
    }

    scope.setLevel(level);
    Sentry.captureMessage(message);
  });

  log('DEBUG', 'Message captured', { message, level });
}

/**
 * Add breadcrumb for debugging
 * @param {string} message - Breadcrumb message
 * @param {string} category - Category (e.g., 'http', 'db', 'auth')
 * @param {Object} data - Additional data
 * @param {string} level - Severity level
 */
export function addBreadcrumb(message, category, data = {}, level = 'info') {
  if (!initialized) {
    return;
  }

  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level
  });
}

/**
 * Set user context for subsequent events
 * @param {Object} user - User object with id, email, etc.
 */
export function setUser(user) {
  if (!initialized) {
    return;
  }

  Sentry.setUser(user ? { id: user.id, email: user.email } : null);
}

/**
 * Clear user context
 */
export function clearUser() {
  if (!initialized) {
    return;
  }

  Sentry.setUser(null);
}

/**
 * Flush pending events before shutdown
 * @param {number} timeout - Timeout in milliseconds
 */
export async function flushSentry(timeout = 2000) {
  if (initialized) {
    try {
      await Sentry.flush(timeout);
      log('DEBUG', 'Sentry flushed');
    } catch (error) {
      log('ERROR', 'Failed to flush Sentry', { error: error.message });
    }
  }
}

/**
 * Close Sentry client
 */
export async function closeSentry() {
  if (initialized) {
    try {
      await Sentry.close(2000);
      initialized = false;
      log('DEBUG', 'Sentry closed');
    } catch (error) {
      log('ERROR', 'Failed to close Sentry', { error: error.message });
    }
  }
}

// Export Sentry for advanced use cases
export { Sentry };
