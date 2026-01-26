/**
 * Integrity Logger Service
 *
 * Structured logging for data integrity operations.
 * All financial mutations MUST use this logger for:
 * - Before/after state tracking
 * - Invariant checking
 * - Computed value logging
 * - Violation detection and alerting
 *
 * @module services/integrity-logger
 */

import { getPrisma } from '../db.js';

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, CRITICAL: 4 };

/**
 * Creates a structured integrity logger for a financial operation
 *
 * @param {Object} context - Logger context
 * @param {string} context.operation - Operation name (e.g., "CAPITAL_CALL_CREATE")
 * @param {string} [context.dealId] - Deal ID for this operation
 * @param {string} [context.userId] - User performing the operation
 * @param {string} [context.requestId] - Request ID for correlation
 * @returns {Object} Logger instance with logging methods
 *
 * @example
 * const logger = createIntegrityLogger({
 *   operation: 'CAPITAL_CALL_CREATE',
 *   dealId: 'deal-123',
 *   userId: 'user-456',
 *   requestId: req.headers['x-request-id']
 * });
 *
 * logger.beforeState('lpActors', lpActors);
 * // ... perform operation
 * logger.afterState('allocations', allocations);
 * logger.invariantCheck('SUM_EQUALS_TOTAL', sum === total, { sum, total });
 * await logger.flush();
 */
export function createIntegrityLogger(context) {
  const { operation, dealId, userId, requestId } = context;
  const startTime = Date.now();
  const logs = [];

  function log(level, message, data = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      levelNum: LOG_LEVELS[level],
      message,
      data,
      operation,
      dealId,
      requestId
    };
    logs.push(entry);

    // Immediate console output for errors and warnings
    if (LOG_LEVELS[level] >= LOG_LEVELS.WARN) {
      console.warn(`[INTEGRITY:${level}] ${operation} - ${message}`, JSON.stringify(data));
    }
  }

  async function writeViolation(invariantName, details) {
    try {
      const prisma = getPrisma();
      await prisma.integrityViolation.create({
        data: {
          invariantName,
          operation,
          dealId: dealId || null,
          userId: userId || null,
          details: JSON.stringify(details),
          detectedAt: new Date()
        }
      });
    } catch (e) {
      console.error('[INTEGRITY] Failed to write violation:', e.message);
    }
  }

  async function persistLogs(op, deal, logsToSave) {
    try {
      const prisma = getPrisma();
      await prisma.integrityLog.create({
        data: {
          operation: op,
          dealId: deal || null,
          logs: JSON.stringify(logsToSave),
          createdAt: new Date()
        }
      });
    } catch (e) {
      console.error('[INTEGRITY] Failed to persist logs:', e.message);
    }
  }

  const logger = {
    debug: (msg, data) => log('DEBUG', msg, data),
    info: (msg, data) => log('INFO', msg, data),
    warn: (msg, data) => log('WARN', msg, data),
    error: (msg, data) => log('ERROR', msg, data),
    critical: (msg, data) => log('CRITICAL', msg, data),

    /**
     * Log state before an operation
     * @param {string} entity - Entity name being tracked
     * @param {any} state - Current state
     */
    beforeState: (entity, state) => log('INFO', `BEFORE_STATE:${entity}`, state),

    /**
     * Log state after an operation
     * @param {string} entity - Entity name being tracked
     * @param {any} state - New state
     */
    afterState: (entity, state) => log('INFO', `AFTER_STATE:${entity}`, state),

    /**
     * Check an invariant and log the result
     * @param {string} name - Invariant name (e.g., "ALLOCATION_SUM_MATCHES_TOTAL")
     * @param {boolean} passed - Whether the invariant holds
     * @param {Object} details - Additional context for debugging
     * @returns {boolean} Whether the invariant passed
     */
    invariantCheck: (name, passed, details) => {
      const level = passed ? 'INFO' : 'CRITICAL';
      log(level, `INVARIANT:${name}`, { passed, ...details });
      if (!passed) {
        // Write to IntegrityViolation table for alerting
        writeViolation(name, details);
      }
      return passed;
    },

    /**
     * Log a computed value with its inputs for audit trail
     * @param {string} name - Value name (e.g., "capitalContributed")
     * @param {any} value - The computed value
     * @param {Object} inputs - Inputs used to compute the value
     */
    computedValue: (name, value, inputs) => log('DEBUG', `COMPUTED:${name}`, { value, inputs }),

    /**
     * Finalize and persist logs
     * @returns {Promise<Object>} Summary of the logging session
     */
    flush: async () => {
      const duration = Date.now() - startTime;
      const summary = {
        operation,
        dealId,
        userId,
        requestId,
        duration,
        logCount: logs.length,
        hasErrors: logs.some(l => l.levelNum >= LOG_LEVELS.ERROR),
        hasWarnings: logs.some(l => l.levelNum >= LOG_LEVELS.WARN)
      };

      // Write to console (structured JSON for log aggregation)
      console.log(JSON.stringify({ type: 'INTEGRITY_LOG', ...summary, logs }));

      // Persist critical logs to database
      const criticalLogs = logs.filter(l => l.levelNum >= LOG_LEVELS.WARN);
      if (criticalLogs.length > 0) {
        await persistLogs(operation, dealId, criticalLogs);
      }

      return summary;
    },

    /**
     * Get all logs without flushing
     * @returns {Array} Array of log entries
     */
    getLogs: () => [...logs]
  };

  return logger;
}

/**
 * Standard financial operation names for consistency
 */
export const INTEGRITY_OPERATIONS = {
  CAPITAL_CALL_CREATE: 'CAPITAL_CALL_CREATE',
  CAPITAL_CALL_ISSUE: 'CAPITAL_CALL_ISSUE',
  CAPITAL_CALL_FUND: 'CAPITAL_CALL_FUND',
  DISTRIBUTION_CREATE: 'DISTRIBUTION_CREATE',
  DISTRIBUTION_APPROVE: 'DISTRIBUTION_APPROVE',
  DISTRIBUTION_PAY: 'DISTRIBUTION_PAY',
  LP_POSITION_COMPUTE: 'LP_POSITION_COMPUTE',
  WATERFALL_CALCULATE: 'WATERFALL_CALCULATE'
};

/**
 * Standard invariant names for consistency
 */
export const INVARIANTS = {
  ALLOCATION_SUM_EQUALS_TOTAL: 'ALLOCATION_SUM_EQUALS_TOTAL',
  ALLOCATION_AMOUNT_POSITIVE: 'ALLOCATION_AMOUNT_POSITIVE',
  CAPITAL_CONTRIBUTED_NON_NEGATIVE: 'CAPITAL_CONTRIBUTED_NON_NEGATIVE',
  CAPITAL_CONTRIBUTED_LTE_COMMITMENT: 'CAPITAL_CONTRIBUTED_LTE_COMMITMENT',
  TOTAL_OWNERSHIP_APPROXIMATELY_100: 'TOTAL_OWNERSHIP_APPROXIMATELY_100',
  VERSION_MATCH: 'VERSION_MATCH',
  LP_ACTOR_DEAL_MATCH: 'LP_ACTOR_DEAL_MATCH'
};
