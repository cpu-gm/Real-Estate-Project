/**
 * Centralized Structured Logger
 * Sprint 2: Observability
 *
 * Provides consistent JSON logging across the application.
 * Replaces scattered console.log calls with structured logging.
 */

import winston from 'winston';

const DEBUG = process.env.DEBUG_LOGGER === 'true';

// Determine log level from environment
const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

// Custom format for structured JSON logs
const structuredFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Console format for development (more readable)
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, component, requestId, ...meta }) => {
    const prefix = component ? `[${component}]` : '';
    const reqId = requestId ? `(${requestId})` : '';
    const metaKeys = Object.keys(meta).filter(k => k !== 'level' && k !== 'timestamp');
    const metaStr = metaKeys.length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}${prefix}${reqId}: ${message}${metaStr}`;
  })
);

// Create transports based on environment
const transports = [];

// Console transport (always enabled)
transports.push(
  new winston.transports.Console({
    format: process.env.NODE_ENV === 'production' ? structuredFormat : consoleFormat
  })
);

// File transport for production (if LOG_FILE is set)
if (process.env.LOG_FILE) {
  transports.push(
    new winston.transports.File({
      filename: process.env.LOG_FILE,
      format: structuredFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true
    })
  );
}

// Error-specific file transport (if LOG_ERROR_FILE is set)
if (process.env.LOG_ERROR_FILE) {
  transports.push(
    new winston.transports.File({
      filename: process.env.LOG_ERROR_FILE,
      level: 'error',
      format: structuredFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 3
    })
  );
}

// Create the logger
const logger = winston.createLogger({
  level: LOG_LEVEL,
  defaultMeta: { service: 'cre-bff' },
  transports,
  // Handle exceptions and rejections
  exceptionHandlers: process.env.NODE_ENV === 'production' ? [
    new winston.transports.Console({ format: structuredFormat })
  ] : undefined,
  rejectionHandlers: process.env.NODE_ENV === 'production' ? [
    new winston.transports.Console({ format: structuredFormat })
  ] : undefined
});

/**
 * Create a child logger with component context
 * @param {string} component - Component name for log context
 * @returns {Object} Logger with debug, info, warn, error methods
 */
export function createLogger(component) {
  return {
    debug: (message, meta = {}) => logger.debug(message, { component, ...meta }),
    info: (message, meta = {}) => logger.info(message, { component, ...meta }),
    warn: (message, meta = {}) => logger.warn(message, { component, ...meta }),
    error: (message, meta = {}) => logger.error(message, { component, ...meta }),

    /**
     * Create request-scoped logger
     * @param {string} requestId - Request ID for correlation
     * @returns {Object} Logger with requestId context
     */
    withRequestId: (requestId) => ({
      debug: (message, meta = {}) => logger.debug(message, { component, requestId, ...meta }),
      info: (message, meta = {}) => logger.info(message, { component, requestId, ...meta }),
      warn: (message, meta = {}) => logger.warn(message, { component, requestId, ...meta }),
      error: (message, meta = {}) => logger.error(message, { component, requestId, ...meta })
    }),

    /**
     * Create user-scoped logger
     * @param {Object} user - User context
     * @param {string} user.id - User ID
     * @param {string} user.email - User email
     * @param {string} user.organizationId - Organization ID
     * @returns {Object} Logger with user context
     */
    withUser: (user) => ({
      debug: (message, meta = {}) => logger.debug(message, {
        component,
        userId: user?.id,
        userEmail: user?.email,
        organizationId: user?.organizationId,
        ...meta
      }),
      info: (message, meta = {}) => logger.info(message, {
        component,
        userId: user?.id,
        userEmail: user?.email,
        organizationId: user?.organizationId,
        ...meta
      }),
      warn: (message, meta = {}) => logger.warn(message, {
        component,
        userId: user?.id,
        userEmail: user?.email,
        organizationId: user?.organizationId,
        ...meta
      }),
      error: (message, meta = {}) => logger.error(message, {
        component,
        userId: user?.id,
        userEmail: user?.email,
        organizationId: user?.organizationId,
        ...meta
      })
    })
  };
}

/**
 * Log an HTTP request (for request logger middleware)
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {number} durationMs - Request duration in milliseconds
 */
export function logRequest(req, res, durationMs) {
  const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

  logger.log(level, 'HTTP Request', {
    component: 'http',
    method: req.method,
    path: req.url,
    statusCode: res.statusCode,
    durationMs,
    requestId: req.headers?.['x-request-id'],
    userAgent: req.headers?.['user-agent'],
    ip: req.socket?.remoteAddress,
    contentLength: res.getHeader?.('content-length')
  });
}

/**
 * Log an error with full context
 * @param {Error} error - Error object
 * @param {Object} context - Additional context
 */
export function logError(error, context = {}) {
  logger.error(error.message, {
    component: context.component || 'unknown',
    errorCode: error.code,
    errorType: error.name,
    stack: error.stack,
    requestId: context.requestId,
    userId: context.userId,
    path: context.path,
    ...context
  });
}

/**
 * Log a security event
 * @param {string} event - Security event type
 * @param {Object} context - Event context
 */
export function logSecurityEvent(event, context = {}) {
  logger.warn(`Security: ${event}`, {
    component: 'security',
    event,
    ...context
  });
}

/**
 * Log an audit event (for compliance)
 * @param {string} action - Action performed
 * @param {Object} context - Audit context
 */
export function logAuditEvent(action, context = {}) {
  logger.info(`Audit: ${action}`, {
    component: 'audit',
    action,
    timestamp: new Date().toISOString(),
    ...context
  });
}

/**
 * Log database operation
 * @param {string} operation - Operation type (query, insert, update, delete)
 * @param {string} table - Table name
 * @param {number} durationMs - Duration in milliseconds
 * @param {Object} context - Additional context
 */
export function logDbOperation(operation, table, durationMs, context = {}) {
  const level = durationMs > 1000 ? 'warn' : 'debug';

  logger.log(level, `DB ${operation}`, {
    component: 'database',
    operation,
    table,
    durationMs,
    slow: durationMs > 1000,
    ...context
  });
}

/**
 * Log external API call
 * @param {string} service - Service name (kernel, openai, sendgrid, etc.)
 * @param {string} endpoint - API endpoint
 * @param {number} durationMs - Duration in milliseconds
 * @param {number} statusCode - Response status code
 * @param {Object} context - Additional context
 */
export function logExternalCall(service, endpoint, durationMs, statusCode, context = {}) {
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

  logger.log(level, `External call: ${service}`, {
    component: 'external',
    service,
    endpoint,
    durationMs,
    statusCode,
    ...context
  });
}

/**
 * Create a timer for measuring operation duration
 * @param {string} operation - Operation name
 * @param {Object} context - Context to include in log
 * @returns {Function} End function that logs the duration
 */
export function startTimer(operation, context = {}) {
  const start = Date.now();

  return (additionalContext = {}) => {
    const durationMs = Date.now() - start;
    logger.debug(`Timer: ${operation}`, {
      component: context.component || 'timer',
      operation,
      durationMs,
      ...context,
      ...additionalContext
    });
    return durationMs;
  };
}

/**
 * Get the current log level
 * @returns {string} Current log level
 */
export function getLogLevel() {
  return logger.level;
}

/**
 * Set the log level dynamically
 * @param {string} level - New log level (debug, info, warn, error)
 */
export function setLogLevel(level) {
  logger.level = level;
}

// Export the base logger for advanced use cases
export { logger };
